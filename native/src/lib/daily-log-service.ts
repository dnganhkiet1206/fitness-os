import { supabase } from '@/integrations/supabase/client';
import { localDayRangeISO } from './local-date';
import { computeReadiness } from './readiness-engine';
import type { ReadinessInput } from './types';

/**
 * Rebuild one day's `daily_logs` row from everything it is derived from.
 *
 * ── the reads run together ──
 *
 * There are eleven of them and they used to run one after another, each waiting
 * on the last for no reason: none of them takes an input from any other. On a
 * phone at a hundred-and-fifty milliseconds a round trip that is most of two
 * seconds, and every caller `await`s this before touching the query cache — so
 * deleting a food from the diary, saving a workout, logging sleep, all of them
 * sat there looking broken while eleven independent queries queued politely.
 *
 * They are one `Promise.all` now. The wall time is the slowest single query
 * rather than the sum of all of them, and nothing else about the computation
 * changes: everything that reads these results still runs after all of them
 * have landed, in the same order, on the same values.
 *
 * The upsert stays where it is. It genuinely depends on all eleven.
 */
/**
 * How long a night actually was.
 *
 * ── two sources, two levels of precision ──
 *
 * A night somebody typed in has bedtime and waketime and nothing else, and for
 * that the span between them *is* the answer — people report the hours they
 * slept, not the hours they lay there.
 *
 * A night from HealthKit knows better. It records the awake stretches inside
 * the night, so `asleep_min` excludes them, and the two figures can differ by
 * an hour or more for somebody who reads in bed. Sleep is 0.30 of the readiness
 * score, the same weight as HRV, so crediting time-in-bed as recovery is not a
 * rounding difference — it is the score being wrong in the direction that
 * flatters you.
 *
 * Used by both readers of `sleep_logs` in this file: the night itself and the
 * seven-day debt. Two copies of this would disagree the first time either was
 * touched, and the symptom would be a sleep debt that contradicts the sleep
 * figure printed above it.
 */
export function asleepMinutes(sleep: {
  bedtime: string;
  waketime: string;
  asleep_min?: number | null;
}): number {
  if (sleep.asleep_min != null && sleep.asleep_min > 0) return Math.round(sleep.asleep_min);
  const bed = new Date(sleep.bedtime).getTime();
  const wake = new Date(sleep.waketime).getTime();
  /*
    Never negative.

    The sheet that writes these rows now refuses an impossible span, but this
    function also reads rows written before that check existed, and rows from
    HealthKit. A reversed pair used to come through here as a negative number
    and go straight into `daily_logs.sleep_duration_min`, where it fed the
    readiness score and — through the seven-day mean — invented sleep debt for a
    week. Zero says "no sleep recorded", which is what a nonsense span means.
  */
  return Math.max(0, Math.round((wake - bed) / 60000));
}

export async function recomputeDailyLog(userId: string, date: string) {
  // Local-day window as UTC instants for timestamptz columns
  const day = localDayRangeISO(date);

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 28);
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  /*
    ── a day it could not read is a day it must not write ──

    Every one of these results used to be destructured as `{ data: x }` with the
    `error` beside it dropped on the floor, and every consumer below reads
    `x ?? 0` or `x ?? []`. So a failed query did not fail: it became *"there is
    none of that"*, and the rebuilt row was written to `daily_logs` with the
    missing parts zeroed — and `daily_logs` is what the dashboard, the readiness
    score and the coach all read. A transient failure therefore did not produce
    an error; it produced a wrong day, persisted, that nothing would ever
    correct.

    That is how a real bug reached a person: logged sleep and biometrics not
    appearing on the dashboard. Four of these selects name columns added by
    `20260809120000_health_provenance.sql` — `asleep_min` and `hrv_sdnn_ms` —
    and against a database where that migration has not been applied they fail
    every single time. The insert succeeded, the rebuild "succeeded", and the
    day was stored as one with no sleep in it.

    Refusing to write is the only safe answer. A rebuild that throws leaves the
    previous row intact and surfaces through the caller's `onError`, which is a
    visible problem with a real cause; a rebuild that guesses leaves a quiet
    wrong number in the one table everything trusts.
  */
  const [
    mealsRes,
    workoutsRes,
    sleepsRes,
    supplementsRes,
    intakesRes,
    bioRes,
    profileRes,
    bioHistoryRes,
    load7dRes,
    load28dRes,
    sleepLogs7dRes,
  ] = await Promise.all([
    // 1. Nutrition from meal_entries
    supabase
      .from('meal_entries')
      .select('total_kcal, total_protein_g, total_carbs_g, total_fat_g, total_fiber_g')
      .eq('user_id', userId)
      .gte('date_time', day.start)
      .lt('date_time', day.end),
    // 2. Training from workout_sessions
    supabase
      .from('workout_sessions')
      .select('volume_load')
      .eq('user_id', userId)
      .gte('date_time', day.start)
      .lt('date_time', day.end),
    // 3. Sleep from sleep_logs (sleep ending on this date)
    supabase
      .from('sleep_logs')
      .select('bedtime, waketime, quality, light_min, deep_min, rem_min, asleep_min')
      .eq('user_id', userId)
      .gte('waketime', day.start)
      .lt('waketime', day.end)
      .limit(1)
      .order('waketime', { ascending: false }),
    // 4. Supplements adherence — planned, then taken
    supabase.from('supplements').select('id').eq('user_id', userId),
    supabase
      .from('supplement_intake_logs')
      .select('id')
      .eq('user_id', userId)
      .eq('taken', true)
      .gte('date_time', day.start)
      .lt('date_time', day.end),
    // 5. Readiness inputs: today's biometrics, the sleep target, and history
    supabase
      .from('biometric_samples')
      .select('hr_bpm, hrv_rmssd_ms, hrv_sdnn_ms')
      .eq('user_id', userId)
      .gte('date_time', day.start)
      .lt('date_time', day.end)
      .order('date_time', { ascending: false })
      .limit(1),
    supabase.from('profiles').select('sleep_target_hours').eq('user_id', userId).single(),
    supabase
      .from('biometric_samples')
      .select('hrv_rmssd_ms, hrv_sdnn_ms, hr_bpm, date_time')
      .eq('user_id', userId)
      .gte('date_time', thirtyDaysAgo.toISOString())
      .order('date_time', { ascending: true }),
    supabase
      .from('workout_sessions')
      .select('volume_load')
      .eq('user_id', userId)
      .gte('date_time', sevenDaysAgo.toISOString()),
    supabase
      /* `date_time` travels with the load because the ratio needs to know how
         many days it is averaging over — see `training_days_28d`. */
      .from('workout_sessions')
      .select('volume_load, date_time')
      .eq('user_id', userId)
      .gte('date_time', thirtyDaysAgo.toISOString()),
    supabase
      .from('sleep_logs')
      .select('bedtime, waketime, asleep_min')
      .eq('user_id', userId)
      .gte('waketime', sevenDaysAgo.toISOString()),
  ]);

  /*
    `profiles` is queried with `.single()`, which reports "no rows" as an error
    (PGRST116). Somebody who has not finished onboarding legitimately has no
    profile row, and the sleep target below already has a default — so that one
    case is not a failure. Everything else is.
  */
  const failed = (
    [
      ['meal_entries', mealsRes],
      ['workout_sessions', workoutsRes],
      ['sleep_logs', sleepsRes],
      ['supplements', supplementsRes],
      ['supplement_intake_logs', intakesRes],
      ['biometric_samples', bioRes],
      ['biometric_samples (28d)', bioHistoryRes],
      ['workout_sessions (7d)', load7dRes],
      ['workout_sessions (28d)', load28dRes],
      ['sleep_logs (7d)', sleepLogs7dRes],
    ] as const
  ).filter(([, r]) => r.error);

  if (failed.length > 0) {
    throw new Error(
      `Không dựng lại được ngày ${date}: không đọc được ` +
        failed.map(([name, r]) => `${name} (${r.error?.message})`).join('; '),
    );
  }

  const profile = profileRes.error ? null : profileRes.data;

  /* Past the guard every one of these succeeded, so the rest of the function
     reads exactly as it did before this check existed. */
  const meals = mealsRes.data;
  const workouts = workoutsRes.data;
  const sleeps = sleepsRes.data;
  const supplements = supplementsRes.data;
  const intakes = intakesRes.data;
  const bio = bioRes.data;
  const bioHistory = bioHistoryRes.data;
  const load7d = load7dRes.data;
  const load28d = load28dRes.data;
  const sleepLogs7d = sleepLogs7dRes.data;

  /* Oldest session in the window → how many days the chronic average spans.
     No sessions means no span, which `computeLoadScore` reads as "no training
     to score" rather than "trained too little". */
  const oldestWorkout = (load28d ?? []).reduce<number | null>((oldest, w) => {
    const t = Date.parse(String((w as { date_time?: string }).date_time ?? ''));
    return Number.isFinite(t) && (oldest === null || t < oldest) ? t : oldest;
  }, null);
  const trainingDays28d =
    oldestWorkout === null ? 0 : Math.min(28, Math.ceil((Date.now() - oldestWorkout) / 86_400_000) + 1);

  const kcal = meals?.reduce((s, m) => s + Number(m.total_kcal), 0) ?? 0;
  const protein_g = meals?.reduce((s, m) => s + Number(m.total_protein_g), 0) ?? 0;
  const carbs_g = meals?.reduce((s, m) => s + Number(m.total_carbs_g), 0) ?? 0;
  const fat_g = meals?.reduce((s, m) => s + Number(m.total_fat_g), 0) ?? 0;
  const fiber_g = meals?.reduce((s, m) => s + Number(m.total_fiber_g), 0) ?? 0;

  const workout_count = workouts?.length ?? 0;
  const volume_load = workouts?.reduce((s, w) => s + Number(w.volume_load), 0) ?? 0;

  const sleep = sleeps?.[0];
  let sleep_duration_min = 0;
  let sleep_quality = 0;
  if (sleep) {
    sleep_duration_min = asleepMinutes(sleep);
    sleep_quality = sleep.quality ?? 5;
  }

  const supplement_planned = supplements?.length ?? 0;
  const supplement_taken = intakes?.length ?? 0;

  let readiness_score: number | null = null;
  let readiness_status: string | null = null;
  let readiness_explain = '';
  let readiness_recommendation = '';
  let acwr: number | null = null;

  const sleepTargetMin = (profile?.sleep_target_hours ?? 8) * 60;

  /*
    ── one HRV metric, never two ──

    SDNN and RMSSD are different quantities. Apple publishes SDNN; straps people
    read by hand mostly report RMSSD. Both used to land in one column, so the
    28-day baseline could be two populations at once — which inflates its MAD,
    flattens the robust z-score toward zero and stops real changes in recovery
    moving the number. HRV is 0.30 of the readiness score, the largest term.

    So today's reading picks the family, and the baseline is built from that
    family alone. A person who switches devices simply starts a new baseline
    rather than being scored against somebody else's units.
  */
  const todaySdnn = bio?.[0]?.hrv_sdnn_ms != null ? Number(bio[0].hrv_sdnn_ms) : null;
  const todayRmssd = bio?.[0]?.hrv_rmssd_ms != null ? Number(bio[0].hrv_rmssd_ms) : null;
  const usingSdnn = todaySdnn != null;
  const hrvToday = usingSdnn ? todaySdnn : todayRmssd;
  const hrvHistory = (bioHistory ?? [])
    .map(b => (usingSdnn ? b.hrv_sdnn_ms : b.hrv_rmssd_ms))
    .filter((v): v is number => v != null)
    .map(Number);
  const rhrHistory = (bioHistory ?? []).filter(b => b.hr_bpm != null).map(b => Number(b.hr_bpm));

  const trainingLoad7d = load7d?.reduce((s, w) => s + Number(w.volume_load), 0) ?? 0;
  const trainingLoad28d = load28d?.reduce((s, w) => s + Number(w.volume_load), 0) ?? 0;

  let sleepDebt7d = 0;
  if (sleepLogs7d && sleepLogs7d.length > 0) {
    const totalSleep = sleepLogs7d.reduce((s, sl) => s + asleepMinutes(sl), 0);
    const avgSleep = totalSleep / sleepLogs7d.length;
    sleepDebt7d = Math.max(0, sleepTargetMin - avgSleep);
  }

  // Check if enough data for readiness (at least 3 days of any logs)
  const hasEnoughData = (bioHistory && bioHistory.length >= 3) || (sleepLogs7d && sleepLogs7d.length >= 3);

  if (hasEnoughData) {
    const input: ReadinessInput = {
      hrv_today: hrvToday,
      rhr_today: bio?.[0]?.hr_bpm ? Number(bio[0].hr_bpm) : undefined,
      sleep_min_lastnight: sleep_duration_min,
      sleep_target_min: sleepTargetMin,
      sleep_debt_7d_min: sleepDebt7d,
      training_load_7d: trainingLoad7d,
      training_load_28d: trainingLoad28d,
      /*
        How much history that 28-day figure actually covers.

        Dividing by a flat 28 for somebody who started last week averages their
        training over three weeks that never happened, and the ratio reads as a
        fourfold spike for training perfectly evenly. Measured from the oldest
        session actually in the window.
      */
      training_days_28d: trainingDays28d,
      soreness_today: undefined,
      illness_flag: false,
      pain_flag_max: undefined,
      hrv_history_28d: hrvHistory,
      rhr_history_28d: rhrHistory,
    };

    /*
      `null` means not one of the four sub-scores could be measured — the gate
      above was satisfied by three biometric readings, which is enough to try
      and not enough to build a baseline from. Leaving the fields unset shows a
      blank gauge, which is what "we cannot tell you yet" looks like.
    */
    const result = computeReadiness(input);
    if (result) {
    readiness_score = result.score;
    readiness_status = result.status;
    // Store language-neutral tokens; the UI localizes them at render so the
    // readiness text follows the user's language, not the compute-time one.
    readiness_explain = result.explainToken;
    readiness_recommendation = result.recommendationKey;
    acwr = result.acwr;
    }
  }

  // 6. Upsert daily_log
  const { error } = await supabase
    .from('daily_logs')
    .upsert({
      user_id: userId,
      date,
      kcal,
      protein_g,
      carbs_g,
      fat_g,
      fiber_g,
      sleep_duration_min,
      sleep_quality,
      workout_count,
      volume_load,
      supplement_taken,
      supplement_planned,
      readiness_score,
      readiness_status,
      readiness_explain,
      readiness_recommendation,
      acwr,
    }, { onConflict: 'user_id,date' });

  /*
    ── the write refuses too, now ──

    This used to be `console.error(...)` and `return { error }`, and all sixteen
    call sites did `await recomputeDailyLog(...)` and threw the result away. So
    the half of this file's contract that the header states — *"a rebuild that
    throws leaves the previous row intact and surfaces through the caller's
    `onError`"* — held for the eleven **reads** above and not for the one
    **write** below them.

    What that cost: log a meal, `meal_entries` inserts fine, this upsert is
    refused (RLS, a dropped connection on the twelfth request of the sequence, a
    constraint). The mutation resolves, `onSuccess` fires, a green toast says
    saved, and the meal appears in the diary — while the calorie ring, the macro
    tiles, the readiness score and the day's quest all keep the numbers they had
    *before the meal*, for ever, until some later write for the same day happens
    to succeed. Nothing anywhere says so.

    A visible error is worse than a silent success exactly once — at the moment
    it appears. A quiet wrong number in the one table every other feature reads
    is worse every day after that.
  */
  if (error) {
    throw new Error(`Không lưu được ngày ${date}: ${error.message}`);
  }
}
