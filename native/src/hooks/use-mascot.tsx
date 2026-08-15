import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useSyncExternalStore } from 'react';

import { useI18n } from '@/hooks/use-app-settings';
import { useAuth } from '@/hooks/use-auth';
import { useDailyLog, useProfile, useTodayMeals } from '@/hooks/useTodayData';
import { useTodayWater } from '@/hooks/use-water';
import { supabase } from '@/integrations/supabase/client';
import { seeded } from '@/lib/bandit';
import { KOA_LINE_KEY } from '@/lib/koa-decide';
import { useKoaReaction } from '@/lib/koa-stage';
import { localDateStr } from '@/lib/local-date';
import { GAP_FROM, mascotLine, type MascotThing } from '@/lib/mascot-message';
import { habitFor, mayPraise, rankQuests, settleStale, usePersonalModel } from '@/lib/personal-model';
import { lateHour } from '@/lib/user-rhythm';
import { DEFAULT_MASCOT_ID, getMascot, isUnlocked, MASCOTS } from '@/lib/mascots';

const ENABLED_KEY = 'ascnd_mascot_enabled';
const SELECTED_KEY = 'ascnd_mascot_selected';

/** Lifetime counters that drive character unlocks */
export function useUnlockStats() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['mascot_unlock_stats', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [w, m] = await Promise.all([
        supabase
          .from('workout_sessions')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user!.id),
        supabase
          .from('meal_entries')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user!.id),
      ]);
      if (w.error) throw w.error;
      if (m.error) throw m.error;
      return { workouts: w.count ?? 0, meals: m.count ?? 0 };
    },
  });
}

// Module-level store so every mounted instance (Today's mascot, the
// Settings picker, the unlock celebration) sees changes immediately —
// per-component useState copies would go stale across screens.
let settingsState = { enabled: true, selectedId: DEFAULT_MASCOT_ID };
const settingsListeners = new Set<() => void>();
let settingsHydrated = false;

function patchSettings(patch: Partial<typeof settingsState>) {
  settingsState = { ...settingsState, ...patch };
  settingsListeners.forEach((l) => l());
}

async function hydrateSettings() {
  if (settingsHydrated) return;
  settingsHydrated = true;
  try {
    const [e, s] = await Promise.all([
      AsyncStorage.getItem(ENABLED_KEY),
      AsyncStorage.getItem(SELECTED_KEY),
    ]);
    patchSettings({
      enabled: e != null ? e === '1' : true,
      selectedId: s || DEFAULT_MASCOT_ID,
    });
  } catch {
    // keep defaults
  }
}

export function useMascotSettings() {
  const snap = useSyncExternalStore(
    (cb) => {
      settingsListeners.add(cb);
      return () => settingsListeners.delete(cb);
    },
    () => settingsState,
  );

  useEffect(() => {
    hydrateSettings();
  }, []);

  const setEnabled = (v: boolean) => {
    patchSettings({ enabled: v });
    AsyncStorage.setItem(ENABLED_KEY, v ? '1' : '0').catch(() => {});
  };
  const setSelectedId = (id: string) => {
    patchSettings({ selectedId: id });
    AsyncStorage.setItem(SELECTED_KEY, id).catch(() => {});
  };

  return { ...snap, setEnabled, setSelectedId };
}

/**
 * What Koa says today.
 *
 * The decision is `mascotLine` in `lib/mascot-message.ts` — a pure function, so
 * the voice can be exercised across a whole matrix of days and hours without a
 * renderer (`tools/mascot-voice.mjs`). This hook only reads the day and turns
 * the decision into words.
 *
 * `null` hides the bubble, and it is returned for two different reasons: the
 * day could not be read at all, and there is genuinely nothing to say. Both are
 * better than a sentence — see the note in `mascot-message.ts` for what the old
 * ladder did with an unreadable day.
 */
export interface MascotSay {
  text: string | null;
  /** what is being asked for, or null — the widget reports it once it is drawn */
  gap: MascotThing | null;
  /**
   * This sentence is a reaction to something that just happened, not the day's
   * summary.
   *
   * The widget records what it draws — an ask feeds the bandit, the "all done"
   * line marks praise as spent for the day. A celebration is neither, and
   * without this flag it was being filed as praise: one medal in the afternoon
   * and the real end-of-day line never appeared.
   */
  reaction: boolean;
}

export function useMascotMessage(): MascotSay {
  const i18n = useI18n();
  const { data: log, isSuccess: logOk } = useDailyLog();
  const { data: meals, isSuccess: mealsOk } = useTodayMeals();
  const { data: waterMl, isSuccess: waterOk } = useTodayWater();
  const { data: profile } = useProfile();
  const personal = usePersonalModel();
  const today = localDateStr();

  /*
    ── one draw a day, not one a render ──

    Thompson sampling picks by drawing from each belief, so calling it twice
    gives two different answers — and a sentence that reshuffles itself every
    time React re-renders is not personalisation, it is a slot machine. The
    generator is seeded from the date, so the draw is fixed for the day and
    genuinely new tomorrow. It also depends on the beliefs themselves, so
    finishing something re-ranks what is left, which is the one moment a change
    mid-day is expected rather than jarring.
  */
  const order = useMemo(
    () => rankQuests(seeded(daySeed(today))).filter(isMascotThing),
    [today, personal.arms],
  );

  /* Yesterday's unanswered ask is a miss, and a learner that only ever records
     its successes will convince itself everything works. */
  useEffect(() => {
    settleStale(today);
  }, [today]);

  const line = useMemo(() => {
    /* Every field goes to `null` together unless all three reads succeeded.
       Half a day is not a day: a failed meals query with a good water query
       would otherwise have Koa asking for the meal you already logged. */
    const read = logOk && mealsOk && waterOk;
    const waterTarget = Number(profile?.water_target_ml) || 2500;

    /*
      ── the hour Koa is allowed to ask, from this person's own clock ──

      `GAP_FROM` is four numbers somebody typed for an imagined day: ask about
      sleep from six, a meal from eleven, water from two, a workout from four.
      Somebody on nights trains at ten in the evening and was being asked at
      four in the afternoon; somebody who eats at one was asked at eleven. Every
      one of those asks is *wrong at the moment it is made*, and that is the
      specific way a companion becomes a nag — not by asking too often, but by
      asking for something you were never going to have done yet.

      The app has known better for a while and nothing consumed it. `isLate` and
      `lateHour` were written for exactly this question, tested by
      `tools/personalize.mjs`, and had **no caller in the app at all**. This is
      the caller: the typed number becomes a floor, and the learned hour plus its
      own spread moves it later for the people it is wrong for.

      Nothing changes for somebody new. `habit()` returns `null` below six
      observations or under 0.6 agreement, and `lateHour(null, floor)` is the
      floor — so a stranger gets precisely the behaviour that shipped.
    */
    const dueFrom: Partial<Record<MascotThing, number>> = {};
    for (const thing of MASCOT_THINGS) {
      dueFrom[thing] = lateHour(habitFor(thing), GAP_FROM[thing]);
    }

    return mascotLine(
      {
        hour: new Date().getHours(),
        sleepMin: read ? Number(log?.sleep_duration_min) || 0 : null,
        meals: read ? meals?.length ?? 0 : null,
        waterPct: read ? ((waterMl ?? 0) / waterTarget) * 100 : null,
        workouts: read ? Number(log?.workout_count ?? 0) : null,
      },
      order,
      dueFrom,
    );
    /* `personal.hours` is listed because `dueFrom` above is read from it. The
       store is subscribed, so learning a new hour re-renders — but a memo that
       does not name it would keep serving the sentence computed from the old
       clock until some unrelated field happened to change. A model that learns
       and a screen that never re-reads it are the same as not learning. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [log, meals, waterMl, profile, logOk, mealsOk, waterOk, order, personal.hours]);

  /* A live reaction outranks the day's summary sentence: something just
     happened, and it is more interesting than a running total. It returns to
     the summary by itself when the reaction's hold expires. */
  const reaction = useKoaReaction();
  const reactionLine =
    reaction && reaction.decision.say
      ? ((i18n as unknown as Record<string, string>)[KOA_LINE_KEY[reaction.decision.say]] ?? null)
      : null;

  const text = useMemo(() => {

    const WIN: Record<MascotThing, string> = {
      sleep: i18n.nMascotWinSleep,
      meal: i18n.nMascotWinMeal,
      water: i18n.nMascotWinWater,
      workout: i18n.nMascotWinWorkout,
    };
    const GAP: Record<MascotThing, string> = {
      sleep: i18n.nMascotGapSleep,
      meal: i18n.nMascotGapMeal,
      water: i18n.nMascotGapWater,
      workout: i18n.nMascotGapWorkout,
    };
    /* The long-form ask, used only when there is nothing to acknowledge — it
       explains why the thing is worth logging, which is the right amount of
       words when it is the whole message. */
    const ASK: Record<MascotThing, string> = {
      sleep: i18n.nMascotSleep,
      meal: i18n.nMascotMeal,
      water: i18n.nMascotWater,
      workout: i18n.nMascotWorkout,
    };

    switch (line.kind) {
      case 'silent':
        return null;
      case 'ask':
        return ASK[line.gap];
      case 'notice':
        return i18n.nMascotThen.replace('{win}', WIN[line.win]).replace('{gap}', GAP[line.gap]);
      case 'praise':
        /* Once a day, not once a render. Finishing everything by two in the
           afternoon used to mean being congratulated on every launch until
           midnight, which is the sound a machine makes rather than praise. */
        return mayPraise(today) ? i18n.nMascotPraise : null;
    }
  }, [i18n, line, today]);


  /* The gap travels with the sentence instead of being recorded here.
     Composing a sentence is not the same as somebody reading one, and this hook
     runs anywhere the mascot is touched at all — including inside the error card,
     which draws no bubble. Reporting from here taught the model that asks nobody
     saw had failed. `mascot.tsx` reports it, because that is where it appears. */
  return useMemo(
    () => ({
      text: reactionLine ?? text,
      /* A reaction is not an ask, so it must not be recorded as one — the
         bandit learns from what Koa *requested*, and a celebration requests
         nothing. */
      gap: reactionLine ? null : line.kind === 'ask' || line.kind === 'notice' ? line.gap : null,
      reaction: reactionLine != null,
    }),
    [reactionLine, text, line],
  );
}

/**
 * A number for a date, so the day's Thompson draw is fixed for the day.
 *
 * Any spreading hash would do; this is the classic FNV-ish string fold. What
 * matters is only that it is *stable* — the same date must give the same
 * ranking, or Koa changes his mind every time the screen re-renders.
 */
function daySeed(date: string): number {
  let h = 2166136261;
  for (let i = 0; i < date.length; i++) {
    h ^= date.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/* The bandit ranks all five quests; Koa only talks about four of them. Steps
   have no sentence, so they are filtered out rather than given one. */
const MASCOT_THINGS: MascotThing[] = ['sleep', 'meal', 'water', 'workout'];
const isMascotThing = (q: string): q is MascotThing =>
  (MASCOT_THINGS as string[]).includes(q);

/** happy | neutral | tired — what the figure mirrors, distinct from what it says. */
export type MascotMood = 'happy' | 'neutral' | 'tired';

/**
 * ── an unread day is not an empty day ──
 *
 * This was the one emotional input in the app with no readiness gate on it.
 * Every other one has had one for a while — `useDailyQuests.ready`,
 * `useMascotMessage.read`, `useKoaContext.emptyToday`, `streakAtRisk` — and
 * this one read `data` straight off two queries.
 *
 * While those queries are in flight, or after either has failed, `log` and
 * `meals` are `undefined`. `meals?.length ?? 0` is then 0 and
 * `log?.workout_count ?? 0` is 0 — not "unknown", but a confident *nothing*.
 * So any launch after midday returned `'tired'`, which `baseEmotion` combines
 * with a zero streak into **`sad`**, which `presenceMotion('sad')` draws as
 * `floatPt: 0, droopDeg: 10`: a character slumped, motionless, visibly
 * unhappy — because the network had not answered yet.
 *
 * It got worse rather than better with the last round of work: making the body
 * follow the emotion honestly means a wrong emotion is now plainly visible
 * instead of being a small change of face.
 *
 * `'neutral'` is the truthful answer to "how is their day going" when the day
 * has not been read. It is also what the figure already does at rest, so the
 * transition into the real mood is a settle rather than a snap.
 */
export function useMascotMood(): MascotMood {
  const { data: log, isSuccess: logRead } = useDailyLog();
  const { data: meals, isSuccess: mealsRead } = useTodayMeals();

  return useMemo(() => {
    if (!logRead || !mealsRead) return 'neutral';
    const hour = new Date().getHours();
    const mealCount = meals?.length ?? 0;
    const workedOut = Number(log?.workout_count ?? 0) > 0;
    if (mealCount > 0 && workedOut) return 'happy';
    if ((hour >= 12 && mealCount === 0) || (hour >= 18 && !workedOut)) return 'tired';
    return 'neutral';
  }, [log, meals, logRead, mealsRead]);
}

/**
 * Who the character is — and nothing about the day.
 *
 * ── the loop this exists to break ──
 *
 * `useMascot()` below is four query subscriptions deep: the profile, today's
 * log, today's meals, today's water, plus the unlock counts. That is right for
 * the home-screen companion, whose whole job is to have an opinion about your
 * day. It is catastrophic for `LoadFailed` — the card the app shows *when a
 * query has failed*.
 *
 *   1. the profile read fails, so the root gate renders `LoadFailed`;
 *   2. `LoadFailed` called `useMascot()`, which mounted a **new observer** on
 *      the failed profile query;
 *   3. React Query refetches a stale query when an observer mounts, so
 *      `isLoading` went true and `isError` went false;
 *   4. the gate's readiness test flipped back to "still loading" and returned
 *      `null`, unmounting the card and its observer;
 *   5. the refetch failed, and step 1 began again.
 *
 * Against a server that fails only `profiles`, the app oscillates between blank
 * and a flash of the error card for ever — three attempts every three seconds,
 * and nothing a person can read. `tools/live.mjs` found it as twenty-five blank
 * routes; every static rule in `tools/` was green.
 *
 * The rule this leaves behind: **anything that renders because a read failed
 * must not itself read.** That is what this hook is for. It reads the settings
 * store and nothing else, and it resolves the character against zero unlock
 * progress — so a locked pick falls back to the default rather than making a
 * request to find out.
 */
export function useMascotIdentity() {
  const settings = useMascotSettings();
  const selected = getMascot(settings.selectedId);
  return {
    enabled: settings.enabled,
    mascot: isUnlocked(selected, { workouts: 0, meals: 0 })
      ? selected
      : getMascot(DEFAULT_MASCOT_ID),
  };
}

export function useMascot() {
  const settings = useMascotSettings();
  const { data: stats } = useUnlockStats();
  const say = useMascotMessage();
  const mood = useMascotMood();

  const unlockStats = stats ?? { workouts: 0, meals: 0 };
  const selected = getMascot(settings.selectedId);
  // If the chosen character is somehow locked (fresh install), fall back
  const mascot = isUnlocked(selected, unlockStats) ? selected : getMascot(DEFAULT_MASCOT_ID);

  const catalog = MASCOTS.map((m) => ({
    ...m,
    unlocked: isUnlocked(m, unlockStats),
  }));

  return {
    ...settings,
    mascot,
    catalog,
    unlockStats,
    message: say.text,
    messageGap: say.gap,
    messageIsReaction: say.reaction,
    mood,
  };
}
