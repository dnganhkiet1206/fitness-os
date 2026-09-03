import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';
import * as Haptics from 'expo-haptics';

import { useAppSettings } from '@/hooks/use-app-settings';
import { supabase } from '@/integrations/supabase/client';
import { confirmWrite } from '@/lib/write-result';
import { AWARD_TEXT, CHALLENGE_TEXT } from '@/lib/gamification-i18n';
/* Straight to the queue rather than through `award-celebration.tsx`, whose
   `fireCelebration` is a one-line pass-through to exactly this. A hook reaching
   into a component to reach a lib pulls React and the whole overlay into the
   import graph of something that only wanted to append to an array. */
import { enqueueAward } from '@/lib/celebration-queue';
import { localDateStr, localDayRangeISO, parseLocalDate, weekStartOf } from '@/lib/local-date';
import { macroTargetsFor } from '@/lib/macro-targets';
import { refreshKoaContext, useKoaContext } from '@/hooks/use-koa-context';
import { TIER_MAGNITUDE } from '@/lib/koa-event';
import { emitKoa } from '@/lib/koa-stage';
import {
  AWARD_DEFINITIONS,
  awardsToGrant,
  grantAll,
  isDuplicateAward,
  type AwardDef,
  type AwardSources,
} from '@/lib/award-grant';
import { LOGGED_DAY_FILTER, streakFrom, STREAK_WINDOW } from '@/lib/streak';
import { challengeStep } from '@/lib/challenge-progress';
import { CHALLENGE_REWARD, challengeRefKey } from '@/lib/mascot-room';
import type { Json } from '@/integrations/supabase/types';
import { useAuth } from './use-auth';

export function useAwards() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['awards', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('awards')
        .select('id, award_key, title, description, icon, tier, earned_at')
        .eq('user_id', user!.id)
        .order('earned_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useRecentAwards(limit = 3) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['awards_recent', user?.id, limit],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('awards')
        .select('id, award_key, title, description, icon, tier, earned_at')
        .eq('user_id', user!.id)
        .order('earned_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * Award auto-grant engine — port of the web useCheckAwards. Run once per
 * app session (Today mount). Without this the native app never grants
 * awards; they only appeared when the web app happened to run.
 */
/* Re-exported so the screens already reading the catalogue from this module
   keep working; the list itself lives beside the decision it feeds. */
export { AWARD_DEFINITIONS };

/**
 * Mọi con số mà huy chương được quyết định từ đó.
 *
 * Đứng RIÊNG, không nằm trong `useCheckAwards`, vì hai chỗ cần nó: lượt xét để
 * trao, và màn huy chương để vẽ tiến độ trên những cái chưa mở.
 *
 * Bản đầu tôi định cho màn tự truy vấn lấy — và đó đúng là "một quy tắc, hai
 * bản sao" đã làm hỏng nhiều thứ trong repo này. Ngưỡng nằm ở `award-grant` mà
 * con số hiển thị đọc từ một truy vấn khác thì hai bên sẽ lệch, và người dùng
 * sẽ thấy "29/30" trên một huy chương đã được trao.
 */
export async function readAwardSources(uid: string): Promise<AwardSources> {

    const [logsRes, freezeRes, workoutRes, prRes, todayRes, mealRes, waterRes, sleepRes, weighRes] =
      await Promise.all([
      supabase
        .from('daily_logs')
        .select('date')
        .eq('user_id', uid)
        /* Only days this person logged. A bare row is no longer evidence of one
           — the health sync creates rows for backfilled steps, and thirteen of
           those alone measured a streak of thirteen. See `LOGGED_DAY_FILTER`. */
        .or(LOGGED_DAY_FILTER)
        .order('date', { ascending: false })
        .limit(STREAK_WINDOW),
      supabase.from('streak_freezes').select('used_on').eq('user_id', uid),
      supabase.from('workout_sessions').select('id', { count: 'exact', head: true }).eq('user_id', uid),
      supabase
        .from('workout_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', uid)
        .eq('pr_detected', true),
      supabase.from('daily_logs').select('steps').eq('user_id', uid).eq('date', localDateStr()).maybeSingle(),
      /*
        Bốn miền mới. `head: true` với `count: 'exact'` nên server chỉ trả về
        con số, không trả hàng nào — cùng cách hai truy vấn buổi tập ở trên đã
        làm, và đó là lý do thêm bốn cái này không làm màn chậm đi.
      */
      supabase.from('meal_entries').select('id', { count: 'exact', head: true }).eq('user_id', uid),
      /*
        Nước đếm theo NGÀY, không theo lần ghi.

        `water_logs` có một hàng mỗi lần uống, nên một người uống tám cốc trong
        một ngày sẽ đạt "7 ngày uống đủ" ngay hôm đầu nếu đếm hàng. Huy chương
        này nói về THÓI QUEN, và thói quen đo bằng số ngày.

        Không có `count: 'exact'` cho DISTINCT trong PostgREST, nên đọc cột ngày
        rồi đếm ở client. Giới hạn 400 hàng: ngưỡng cao nhất là 100 ngày, và
        400 lần ghi đủ phủ nó ở mọi nhịp uống hợp lý.
      */
      supabase.from('water_logs').select('date').eq('user_id', uid).limit(400),
      supabase.from('sleep_logs').select('id', { count: 'exact', head: true }).eq('user_id', uid),
      supabase.from('weight_logs').select('id', { count: 'exact', head: true }).eq('user_id', uid),
    ]);

    /*
      The freeze read is allowed to fail, and only this one. `streak_freezes`
      arrives with a migration, and migrations reach production later than app
      builds do; between those two moments an unreadable freeze list means "no
      freezes", which is what every account has until then. The same exception,
      with the same reasoning, is written out in `use-mascot-room`.
    */
    const frozen = freezeRes.error
      ? []
      : (freezeRes.data ?? []).map((r) => r.used_on).filter((d): d is string => !!d);

    /* `streakFrom` with all three arguments — the freeze argument is the one
       these two call sites drifted on last time. Somebody whose day 40 was
       covered by a freeze saw "40 ngày" on their level card and was never
       granted `streak_30`. */
    const streak = logsRes.error
      ? null
      : streakFrom((logsRes.data ?? []).map((l) => l.date), localDateStr(), frozen).count;

    return {
      streak,
      workoutCount: workoutRes.error ? null : workoutRes.count ?? null,
      prCount: prRes.error ? null : prRes.count ?? null,
      mealCount: mealRes.error ? null : mealRes.count ?? null,
      /* `null` khi đọc hỏng, KHÔNG phải 0 — xem ghi chú ở `AwardSources`: một
         truy vấn hỏng không được đọc thành "chưa uống ngày nào". */
      waterDays: waterRes.error
        ? null
        : new Set((waterRes.data ?? []).map((r) => r.date).filter(Boolean)).size,
      sleepCount: sleepRes.error ? null : sleepRes.count ?? null,
      weighCount: weighRes.error ? null : weighRes.count ?? null,
      steps: todayRes.error ? null : todayRes.data?.steps ?? null,
    };
}

/**
 * Tiến độ hiện tại, cho màn huy chương vẽ "12 / 30" lên cái chưa mở.
 *
 * `staleTime` một phút: các con số này là tổng cộng dồn, không phải thứ nhảy
 * từng giây, và màn này không phải chỗ người ta ngồi nhìn chờ nó đổi.
 */
export function useAwardProgress() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['award_sources', user?.id],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: () => readAwardSources(user!.id),
  });
}

export function useCheckAwards() {
  const { user } = useAuth();
  const { lang } = useAppSettings();
  const queryClient = useQueryClient();
  const { data: existingAwards } = useAwards();
  /* Koa is told about a medal at the one moment the app is certain there is a
     new one — inside `grant`, after the insert came back without a duplicate
     error. Detecting it anywhere else would mean polling the awards list and
     diffing it, which is what the character used to have to do for everything
     and is why it could not see any of this. */
  const koaCtx = useKoaContext();
  const koaCtxRef = useRef(koaCtx);
  koaCtxRef.current = koaCtx;

  const grant = async (def: AwardDef, metadata: Record<string, unknown> = {}) => {
    const text = AWARD_TEXT[def.key];
    const { error } = await supabase.from('awards').insert({
      user_id: user!.id,
      award_type: def.type,
      award_key: def.key,
      // English is the canonical/history value; native renders by key
      title: text.title.en,
      description: text.desc.en,
      icon: def.icon,
      tier: def.tier,
      metadata: metadata as Json,
    });
    /*
      Already earned — on this device, on another one, or by the pass that ran a
      moment ago. Recognised by SQLSTATE rather than by the English words in
      PostgreSQL's message: see `isDuplicateAward`, and see `DailyLogRebuildError`
      and `WrongAccountError`, both of which are classes for the same reason.
    */
    if (error && !isDuplicateAward(error)) throw error;
    if (!error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Fire the confetti overlay in the user's language
      enqueueAward({
        title: text.title[lang],
        description: text.desc[lang],
        icon: def.icon,
        tier: def.tier,
        /* Khoá để modal tra được `type` và `requirement` — tức vẽ ra ĐÚNG tấm
           huy chương vừa nhận, cùng dáng và cùng con số với màn `/awards`, chứ
           không phải một cái đĩa tròn chung chung. */
        awardKey: def.key,
      });
      /* The medal's own tier is the app's existing answer to "how big was
         this", so the magnitude is read rather than invented. A personal
         record is called by its name because the reaction differs: Koa looks
         at the number first, then at the person. */
      emitKoa(
        {
          id: `award:${def.key}`,
          kind: def.type === 'pr' ? 'personal_record' : 'award_earned',
          magnitude: TIER_MAGNITUDE[def.tier] ?? 0.5,
          label: text.title[lang],
        },
        refreshKoaContext(koaCtxRef.current),
      );
    }
  };

  /*
    ── the four reads the medals are decided from ──

    Each answers `null` when it could not be read, and `null` never reaches a
    threshold comparison. Every one of these used to be destructured as
    `const { data: x } = …` with the `error` dropped on the floor, so a failed
    query became "there is none of that" — which is the same shape
    `daily-log-service` and `use-health-sync` were both corrected for, and it
    decides permanent history here.

    `use-mascot-room` runs the very same streak query for the number on screen
    and does `if (logs.error) throw logs.error`. The two are now consistent: the
    number and the medal come from one question asked one way.
  */
  const readSources = useCallback(() => readAwardSources(user!.id), [user?.id]);

  /** What the medal records about the moment it was earned. */
  const metadataFor = (def: AwardDef, s: AwardSources): Record<string, unknown> => {
    if (def.type === 'streak') return { streak: s.streak };
    if (def.key === 'steps_10k') return { steps: s.steps };
    if (def.type === 'volume_milestone') return { count: s.workoutCount };
    if (def.key === 'pr_5') return { count: s.prCount };
    return {};
  };

  /*
    ── this ran again on every render of Today, not on every focus ──

    `Today` wires it up as `useFocusEffect(useCallback(fn, [awardsReady,
    checkAndGrant]))`. `useFocusEffect` re-runs its effect whenever the callback
    identity changes while the screen is focused — and `checkAndGrant` was a
    plain `async () => {}` in a hook body, so it was a **new function on every
    render**.

    The dashboard re-renders often: a query settling, the mascot's held emotion
    expiring, a quest ticking over, the wallet arriving. Each of those started
    another full pass — four Supabase reads for streaks, workout counts, PRs and
    steps — and the `awardCheckInFlight` ref only stops them overlapping, not
    repeating. As soon as one finished the next render queued another.

    `useCallback` makes the identity change when the inputs do, which is what
    the dependency list in Today was written believing all along.

    `grant` stays a plain function: it is called from inside this one, never
    from an effect, so its identity is nobody's dependency. `koaCtxRef` is a ref
    for the same reason it was already a ref — the context object is new each
    render and listing it here would put the loop straight back.
  */
  const checkAndGrant = useCallback(async () => {
    if (!user || !existingAwards) return;
    const earned = new Set(existingAwards.map((a) => a.award_key));

    /*
      ── read everything, decide once, then grant each medal on its own ──

      This used to be four reads and four grant loops braided together inside a
      single `try`, which meant one insert failing took every award after it
      with it — silently, because the `catch` below has to swallow (an award
      must never break the dashboard). Awards are independent facts about a
      person: nothing about a refused streak medal says anything about whether
      they have logged their first workout.

      So the reads happen, `awardsToGrant` decides, and each grant stands alone.
      A source that could not be read arrives as `null` and is not compared
      against anything — `null` is "not known", never "not enough".
    */
    let sources: Awaited<ReturnType<typeof readSources>>;
    try {
      sources = await readSources();
    } catch {
      /* Nothing was read, so nothing can be decided. The next focus tries again. */
      return;
    }

    const outcome = await grantAll(awardsToGrant(sources, earned), (def) =>
      grant(def, metadataFor(def, sources)),
    );
    const granted = outcome.granted.length > 0;

    if (granted) {
      queryClient.invalidateQueries({ queryKey: ['awards', user.id] });
      queryClient.invalidateQueries({ queryKey: ['awards_recent', user.id] });
    }
    // `grant` closes over `lang` and `user`, both of which are dependencies
    // here; `queryClient` is stable for the life of the provider.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, existingAwards, lang, queryClient]);

  return { checkAndGrant, ready: !!existingAwards };
}

/** Monday of the current week — the rule lives in `lib/local-date.ts`, shared
 *  with the weekly review and the goals screen, which had three copies between
 *  them and one of the three was wrong every Sunday. */
function getWeekStart(): string {
  return localDateStr(weekStartOf());
}

export function useWeeklyChallenges() {
  const { user } = useAuth();
  const weekStart = getWeekStart();
  return useQuery({
    queryKey: ['weekly-challenges', user?.id, weekStart],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('weekly_challenges')
        /* `reward_tier` is read by the Koa room, which prints what a finished
           challenge already paid. Without it the room cannot tell a bronze from
           a platinum and would have to guess a flat number — which is how the
           duplicate 40-coin claim got there in the first place. */
        .select(
          'id, challenge_key, title, description, icon, current_value, target_value, completed, reward_tier',
        )
        .eq('user_id', user!.id)
        .eq('week_start', weekStart)
        .order('created_at');
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * Challenge rotation — structure/thresholds only. Display text lives in
 * gamification-i18n (CHALLENGE_TEXT) keyed by `key`; English strings are
 * written to the DB as canonical/history values.
 */
const CHALLENGE_POOL = [
  { key: 'workouts_5', icon: 'dumbbell', target: 5, tier: 'silver' },
  { key: 'workouts_3', icon: 'dumbbell', target: 3, tier: 'bronze' },
  { key: 'protein_7', icon: 'beef', target: 7, tier: 'gold' },
  { key: 'steps_50k', icon: 'footprints', target: 50000, tier: 'silver' },
  { key: 'sleep_7', icon: 'moon', target: 7, tier: 'silver' },
  { key: 'log_7', icon: 'target', target: 7, tier: 'gold' },
  { key: 'calories_5', icon: 'target', target: 5, tier: 'silver' },
  { key: 'water_7', icon: 'droplets', target: 7, tier: 'silver' },
];

/** Pick 3 challenges for a given week (deterministic, same as web) */
function pickChallengesForWeek(weekStart: string) {
  const seed = weekStart.replace(/-/g, '');
  const num = parseInt(seed, 10) % CHALLENGE_POOL.length;
  const picked: (typeof CHALLENGE_POOL)[number][] = [];
  for (let i = 0; i < 3; i++) {
    picked.push(CHALLENGE_POOL[(num + i) % CHALLENGE_POOL.length]);
  }
  return picked;
}

/**
 * Seed this week's challenges if none exist — without this the native
 * app showed "no challenges" forever unless the web app ran first.
 */
export function useInitWeeklyChallenges() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const weekStart = getWeekStart();

  return useMutation({
    mutationFn: async () => {
      if (!user) return;
      const { count } = await supabase
        .from('weekly_challenges')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('week_start', weekStart);
      if ((count ?? 0) > 0) return;

      const rows = pickChallengesForWeek(weekStart).map((c) => {
        const t = CHALLENGE_TEXT[c.key];
        return {
          user_id: user.id,
          week_start: weekStart,
          challenge_key: c.key,
          // English canonical for the shared DB; native renders by key
          title: t.title.en,
          description: t.desc.en,
          icon: c.icon,
          target_value: c.target,
          current_value: 0,
          reward_title: t.reward.en,
          reward_tier: c.tier,
        };
      });
      const { error } = await supabase.from('weekly_challenges').insert(rows);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['weekly-challenges'] }),
  });
}

/** Recompute challenge progress from this week's logs (port of the web hook) */
export function useUpdateChallengeProgress() {
  const { user } = useAuth();
  const { lang } = useAppSettings();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!user) return;
      const weekStart = getWeekStart();

      const { data: challenges } = await supabase
        .from('weekly_challenges')
        .select('*')
        .eq('user_id', user.id)
        .eq('week_start', weekStart)
        .eq('completed', false);
      if (!challenges || challenges.length === 0) return;

      /*
        ── the challenges promised "your target" and measured somebody else's ──

        Three of them counted against a number typed into this file: sleep at
        360 minutes, protein at 100 g, water at 2,000 ml. But the descriptions
        the user reads are *"Đạt mục tiêu protein 7 ngày"*, *"Đạt mục tiêu nước
        7 ngày"*, *"Ngủ đủ giấc"* — their target, in their own words.

        So somebody whose profile says 8 hours of sleep, 150 g of protein and
        3,500 ml of water was told they had "hit their target" on a day they
        slept six hours, ate 100 g and drank two litres. Not a threshold that
        was merely generous: a claim about them that was not true, from the one
        table that already holds the right answer.

        `macroTargetsFor` exists precisely for this — its own header says a
        target computed twice is a target that will contradict itself — and this
        file had never imported it.
      */
      const { data: profile } = await supabase
        .from('profiles')
        .select('sleep_target_hours, water_target_ml, macro_protein_g')
        .eq('user_id', user.id)
        .maybeSingle();

      /* A profile that will not load is not a licence to invent a threshold, so
         these fall back to the same defaults every other screen uses. */
      const sleepTargetMin = Math.round((Number(profile?.sleep_target_hours) || 8) * 60);
      const waterTargetMl = Number(profile?.water_target_ml) || 2500;
      const proteinTargetG = macroTargetsFor(profile).protein;

      // parseLocalDate: a bare 'YYYY-MM-DD' parses as UTC midnight, which
      // localDateStr would render as Sunday in negative-offset timezones —
      // cutting the last day out of the challenge week
      const weekEnd = parseLocalDate(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);
      const weekEndStr = localDateStr(weekEnd);

      /**
       * Every challenge at once, then the celebrations in order.
       *
       * This was a `for … of` with two round trips inside it — a read to work
       * out where the challenge stands and a write to store it — so a week with
       * five active challenges spent ten sequential trips before the screen
       * moved. Nothing in one iteration is an input to any other: each reads its
       * own table and writes its own row.
       *
       * The celebrations are the reason the celebrating does not happen inside
       * the parallel work. Fired from in there they would pop in whatever order
       * the network happened to settle, and two arriving on the same frame stack
       * on top of each other. So each iteration *returns* what to celebrate and
       * the celebrating happens after, in the order the challenges were listed.
       *
       * ── and `allSettled`, which is a correction to my own last round ──
       *
       * This was `Promise.all`, and the round that added `confirmWrite` put a
       * throwing call inside the map without weighing what that does here. With
       * `Promise.all`, **one** challenge whose row cannot be written rejects the
       * whole batch: no challenge in that pass is paid, none is celebrated, and
       * the `.catch(() => {})` around this in Today swallows the reason. One bad
       * row taking four good ones with it, silently.
       *
       * `allSettled` keeps the blast radius at one challenge. The failure is not
       * ignored — it is re-thrown after the celebrations, so the mutation still
       * reports it and `onSuccess` does not run on a pass that half-worked — but
       * the four that succeeded have already been paid and announced by then.
       */
      const settled = await Promise.allSettled(
        challenges.map(async (ch) => {
        let newValue = 0;

        if (ch.challenge_key.startsWith('workouts_')) {
          const { count } = await supabase
            .from('workout_sessions')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .gte('date_time', localDayRangeISO(weekStart).start)
            .lt('date_time', localDayRangeISO(weekEndStr).start);
          newValue = count ?? 0;
        } else if (ch.challenge_key === 'log_7') {
          /*
            ── the third reader of "did this person log this day" ──

            `log_7` says *"Ghi log đầy đủ 7 ngày trong tuần"* and counted rows.
            A row is not that any more: `use-health-sync` upserts
            `{ user_id, date, steps }` for up to thirteen finished HealthKit
            days, and an upsert **creates** the row. So a phone counting steps
            in a pocket manufactures days — the same shape the streak was fixed
            for, in the one consumer the fix did not reach.

            Measured against PostgreSQL 16.13, an account that has never logged
            a meal, a workout, a night or a supplement, first sync on a Sunday:

                hàng daily_logs do đồng bộ bước chân tạo : 14
                streakFrom (LOGGED_DAY_FILTER)          : 0 ngày
                log_7      (không lọc gì)               : 7/7

            Seven of seven on a gold-tier challenge, paid through
            `claim_quest_reward`, for a week nobody logged anything in — while
            the streak, asking the same question of the same rows, said zero.

            So it asks the same question the same way. `LOGGED_DAY_FILTER` is
            the one definition of a logged day, and the note in
            `use-mascot-room` already says why it has to stay one: *"Both
            readers of the streak have to ask the same question, and this file
            and `use-extras` have already drifted apart twice."* This was the
            third reader.

            In the query rather than after it, for the same reason the streak
            reads do it there — and measured: a week somebody genuinely logged
            still counts 7/7, so the filter takes nothing from anyone.
          */
          const { data: logs } = await supabase
            .from('daily_logs')
            .select('date')
            .eq('user_id', user.id)
            .or(LOGGED_DAY_FILTER)
            .gte('date', weekStart)
            .lt('date', weekEndStr);
          newValue = logs?.length ?? 0;
        } else if (ch.challenge_key === 'steps_50k') {
          const { data: logs } = await supabase
            .from('daily_logs')
            .select('steps')
            .eq('user_id', user.id)
            .gte('date', weekStart)
            .lt('date', weekEndStr);
          newValue = (logs ?? []).reduce((sum, l) => sum + (l.steps ?? 0), 0);
        } else if (ch.challenge_key === 'sleep_7') {
          const { data: logs } = await supabase
            .from('daily_logs')
            .select('sleep_duration_min')
            .eq('user_id', user.id)
            .gte('date', weekStart)
            .lt('date', weekEndStr);
          newValue = (logs ?? []).filter((l) => (l.sleep_duration_min ?? 0) >= sleepTargetMin).length;
        } else if (ch.challenge_key === 'protein_7') {
          const { data: logs } = await supabase
            .from('daily_logs')
            .select('protein_g')
            .eq('user_id', user.id)
            .gte('date', weekStart)
            .lt('date', weekEndStr);
          newValue = (logs ?? []).filter((l) => (Number(l.protein_g) || 0) >= proteinTargetG).length;
        } else if (ch.challenge_key === 'calories_5') {
          const { data: logs } = await supabase
            .from('daily_logs')
            .select('kcal')
            .eq('user_id', user.id)
            .gte('date', weekStart)
            .lt('date', weekEndStr);
          newValue = (logs ?? []).filter((l) => (Number(l.kcal) || 0) > 500).length;
        } else if (ch.challenge_key === 'water_7') {
          const { data: logs } = await supabase
            .from('water_logs')
            .select('date, amount_ml')
            .eq('user_id', user.id)
            .gte('date', weekStart)
            .lt('date', weekEndStr);
          const byDate = new Map<string, number>();
          (logs ?? []).forEach((l) => {
            byDate.set(l.date, (byDate.get(l.date) ?? 0) + l.amount_ml);
          });
          newValue = [...byDate.values()].filter((v) => v >= waterTargetMl).length;
        }

        /* One reading of the pass, shared by the write, the payment and the
           celebration — see `lib/challenge-progress.ts`. Three separate
           opinions about "is this finished" is how the celebration came to be
           gated one condition weaker than the payment. */
        const step = challengeStep(ch, newValue);

        /*
          ── one branch: paid, named, and only then written down ──

          Two invariants meet here and both are about *ordering*.

          **Paid and announced in the same `if`.** The payment used to be gated
          on the transition and the celebration on the state alone. This runs
          from Today's `useFocusEffect`, so it re-ran on every return to the tab
          — and every already-finished challenge queued its confetti again, for
          the rest of the week. `tools/challenge-reward.mjs` holds the two
          together for that reason; the fix below must not split them.

          **Paid before the row is marked finished.** That is new, and it is the
          other way round from how it ran. `confirmWrite` wrote
          `completed: true` first and the payment came after, so a payment that
          failed — a dropped connection, the daily ceiling, anything — left the
          challenge marked complete in the database with nothing credited. And
          `justCompleted` is a *transition* (`completed && !was`), so the next
          pass reads it as long-finished and never comes back: the coins were
          gone permanently, for a challenge the app itself recorded as won.

          Reversed, both orders of failure recover, because the payment is the
          idempotent half — `challengeRefKey(tier, weekStart, key)` is fixed for
          the week and `UNIQUE(user_id, ref_key)` makes a repeat a no-op:

            · pay fails → the row stays unfinished → the next pass retries both
            · pay lands, write fails → `confirmWrite` throws before the award is
              returned, so the next pass pays again (no-op), writes, and
              celebrates once

          The idempotent step goes first. Same rule that puts the ledger insert
          before the inventory insert inside `buy_mascot_item`.
        */
        /* The queue's own parameter type, rather than an import of the shape
           from the component that renders it: `tools/layering.mjs` forbids a
           hook reaching into `components/` for a value, and this needs no new
           edge at all — `enqueueAward` is already imported here. */
        let award: Parameters<typeof enqueueAward>[0] | null = null;
        if (step.justCompleted) {
          const tier = ch.reward_tier ?? 'bronze';
          const reward = CHALLENGE_REWARD[tier] ?? CHALLENGE_REWARD.bronze;
          /* Same gate as every other reward, and now the same authority: the
             tier is already written into the ref_key, so the server reads it
             from there and prices it itself. It used to be sent as
             `p_amount`, which meant a caller could name any tier's key and any
             price up to 300 — see 20260819120000. */
          const { error: payError } = await supabase.rpc('claim_quest_reward', {
            p_ref_key: challengeRefKey(tier, weekStart, ch.challenge_key),
            p_reason: `challenge ${ch.challenge_key}`,
          });
          if (payError && !payError.message.includes('duplicate')) throw payError;

          /* Named here, inside the branch that has already established there is
             a reward to name. `reward_title` is nullable, and a challenge
             without one is still paid and still written — it simply has nothing
             to put on a card. */
          if (ch.reward_title) {
            const t = CHALLENGE_TEXT[ch.challenge_key];
            const doneLabel = lang === 'vi' ? 'Hoàn thành thử thách' : 'Challenge complete';
            award = {
              title: t ? t.reward[lang] : ch.reward_title,
              description: `${doneLabel}: ${t ? t.title[lang] : ch.title}`,
              icon: ch.icon ?? 'trophy',
              tier: ch.reward_tier ?? 'bronze',
            };
          }
        }

        /*
          Write only when something moved.

          This now runs whenever Today comes into focus, not only when the
          Challenges screen is opened, so most runs find nothing changed. An
          unconditional update makes every one of those three writes for no
          reason — and it rewrites `completed_at` on each pass, quietly moving
          the moment a challenge was finished.

          ── and this write in particular has to be confirmed ──

          It is the one whose silent no-op *causes another bug*. If the row is
          not updated, `completed` stays false in the database, so the next
          focus pass reads the challenge as freshly finished — pays again
          (harmless, the ledger is idempotent on `ref_key`) and **celebrates
          again**, which is the repeat this file was corrected for.
        */
        if (!step.unchanged) {
          await confirmWrite(
            supabase
              .from('weekly_challenges')
              .update({
                current_value: step.value,
                completed: step.completed,
                /* Write-once. It used to be cleared whenever the challenge
                   dipped back below its target, which threw away the only
                   record of when it was won — and with it the guard that stops
                   the celebration replaying when the condition comes back. */
                ...(step.completed && !ch.completed_at
                  ? { completed_at: new Date().toISOString() }
                  : {}),
              })
              .eq('id', ch.id),
            'Không cập nhật được tiến trình thử thách',
          );
        }

        return award;
        }),
      );

      /* In the order the challenges were listed, and only the ones that got
         that far — see the note on `allSettled` above. */
      for (const r of settled) {
        if (r.status === 'fulfilled' && r.value) enqueueAward(r.value);
      }

      /* Reported after the successful ones have been paid and announced. The
         first failure is enough: they are all the same kind of failure, and a
         mutation reports one error, not a list. */
      const failed = settled.find((r) => r.status === 'rejected');
      if (failed && failed.status === 'rejected') throw failed.reason;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['weekly-challenges'] });
      // a completion moved the wallet, and the buddy's XP is derived from it
      queryClient.invalidateQueries({ queryKey: ['mascot_wallet', user?.id] });
    },
  });
}

export function useGroceryItems() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['grocery_items', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('grocery_items')
        .select('id, name, quantity, checked, category')
        .eq('user_id', user!.id)
        .order('checked')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useGroceryMutations() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['grocery_items', user?.id] });

  /**
   * Add a line to the list, optionally with how much of it.
   *
   * Takes a bare name as well as `{ name, quantity }`, because the two call
   * sites that type a name by hand have nothing to say about quantity and
   * should not have to say `{ name }` to say nothing. The meal plan does have
   * something to say — it knows the grams — and `quantity` is a free-text
   * column, so "400g" goes in as written rather than as a number needing a unit
   * stored beside it.
   */
  const add = useMutation({
    mutationFn: async (input: string | { name: string; quantity?: string }) => {
      if (!user) throw new Error('Not signed in');
      const { name, quantity } = typeof input === 'string' ? { name: input, quantity: undefined } : input;
      const { error } = await supabase
        .from('grocery_items')
        .insert({ user_id: user.id, name, quantity: quantity ?? null, checked: false });
      if (error) throw error;
    },
    onSuccess: () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      invalidate();
    },
  });

  const toggle = useMutation({
    mutationFn: async ({ id, checked }: { id: string; checked: boolean }) => {
      await confirmWrite(
        supabase.from('grocery_items').update({ checked }).eq('id', id),
        'Không cập nhật được danh sách đi chợ',
      );
    },
    onSuccess: () => {
      Haptics.selectionAsync();
      invalidate();
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await confirmWrite(
        supabase.from('grocery_items').delete().eq('id', id),
        'Không cập nhật được danh sách đi chợ',
      );
    },
    onSuccess: invalidate,
  });

  return { add, toggle, remove };
}
