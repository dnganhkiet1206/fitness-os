import { supabase } from '@/integrations/supabase/client';
import { localDayRangeISO, localWindowISO } from './local-date';
import { chronicDays } from './training-card';
import { loadWindow, sessionLoad, type LoadSession } from './session-load';
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
/**
 * The day could not be rebuilt — but whatever was written *was* written.
 *
 * ── why this needs its own class ──
 *
 * `recomputeDailyLog` runs last, after the write it is summarising. So by the
 * time it fails, the meal is already deleted, the serving is already changed,
 * the workout is already saved. The row is gone from the server and it is not
 * coming back.
 *
 * Every one of those callers is an optimistic mutation whose `onError` restores
 * the pre-write snapshot. That is right when the *write* failed and actively
 * wrong when only the rebuild did: the user watches the food they deleted
 * reappear, with an error beside it, and then vanish again a moment later when
 * `onSettled` refetches. Three states, two of them lies.
 *
 * Making it a class rather than a message prefix is deliberate — `onError` has
 * to make a decision on it, and a decision keyed on the wording of an error
 * string breaks the first time somebody rewords the string, silently, in the
 * direction of restoring deleted rows again.
 */
export class DailyLogRebuildError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DailyLogRebuildError';
  }
}

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

/**
 * How many times a rebuild will re-read and try again after losing a race.
 *
 * Each loss means somebody else wrote a *complete* snapshot taken after our
 * reads started, so giving up leaves a correct row rather than a wrong one —
 * the bound exists to stop two devices ping-ponging, not to stop the day from
 * converging.
 */
const REBUILD_ATTEMPTS = 3;

/**
 * How far the two readiness windows reach back, in local calendar days,
 * counting the day being rebuilt as the last of them.
 *
 * Seven days is the acute window — this week's training, and the mean the sleep
 * debt is measured against. Twenty-eight is the chronic one — the training
 * baseline the acute load is a ratio *of*, and the population the HRV and
 * resting-heart-rate z-scores are taken against.
 *
 * Named rather than written twice as `- 7` and `- 28`: the pair below and the
 * `training_days_28d` the engine divides by have to describe the same span, and
 * a span typed in two places is a span that drifts.
 */
const ACUTE_DAYS = 7;
const CHRONIC_DAYS = 28;

/**
 * The columns this function owns — the projection.
 *
 * `daily_logs` is shared by column on purpose: `steps`, `active_kcal` and
 * `active_minutes` belong to the health sync and appear nowhere here, so a meal
 * cannot wipe the rings and a sync cannot wipe the readiness score. Naming the
 * set once means the give-up check below compares exactly what was written
 * rather than a list that drifts from `row`.
 */
const PROJECTION_COLUMNS =
  'kcal, protein_g, carbs_g, fat_g, fiber_g, sleep_duration_min, sleep_quality, ' +
  'workout_count, volume_load, supplement_taken, supplement_planned, ' +
  'readiness_score, readiness_status, readiness_explain, readiness_recommendation, acwr';

/**
 * Is the row on file already the projection we were going to write?
 *
 * Numbers are compared as numbers: `numeric` columns come back from PostgREST
 * as strings often enough that `===` on the raw values would answer "different"
 * for two identical days and turn a settled rebuild into an error.
 */
function projectionEquals(stored: Record<string, unknown>, computed: Record<string, unknown>): boolean {
  return PROJECTION_COLUMNS.split(',').map((c) => c.trim()).every((col) => {
    const a = stored[col];
    const b = computed[col];
    if (a == null || b == null) return a == null && b == null;
    if (typeof b === 'number') return Number(a) === b;
    return String(a) === String(b);
  });
}

export async function recomputeDailyLog(userId: string, date: string, attempt = 0) {
  // Local-day window as UTC instants for timestamptz columns
  const day = localDayRangeISO(date);

  /*
    ── the history windows belong to the DAY, not to the moment (BUG-106) ──

    These were `new Date()` minus seven and twenty-eight days, and every query
    below took one as a `gte` with no upper bound. Two consequences, both
    measured on PostgreSQL 16.13 with the real function, in all six timezones:

    **A day was scored against its own future.** Rebuilding a target twelve days
    old, the "seven-day" acute load held sessions dated six to twelve days
    *after* it, and the target day's own training was not inside the window at
    all. Adding five heavy sessions to the current week — with every row
    belonging to the target byte-identical — moved it:

        55 · yellow · yellow_reduce · acwr 0.09
        48 · red    · red_recover   · acwr 1.73

    A stored recommendation of *"chỉ phục hồi tích cực"* about a day whose HRV,
    resting pulse and sleep never changed.

    **And the gate opened on the future too.** For a day owning one night, with
    no history before it and a busy present, `hasEnoughData` was satisfied by
    the present's nights and the day stored `load:80 · acwr 1.14` built from
    sessions that had not happened yet.

    Chain AN measured all of it and the product answer is Model B: readiness is
    a day-owned training-capacity value, so the windows state history **as of
    D** — the `CHRONIC_DAYS`/`ACUTE_DAYS` local days ending with D itself, both
    ends closed. No row dated after D may reach any of the four queries below.

    Two things this deliberately does not change. The window still ends at the
    *end* of D, so a session logged later on the day being rebuilt still counts
    towards it — that row belongs to D. And today is still rebuilt alongside an
    edited past day, because today's own windows genuinely contain that day.
  */
  const acute = localWindowISO(date, ACUTE_DAYS);
  const chronic = localWindowISO(date, CHRONIC_DAYS);

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
  /*
    ── the version of the row this rebuild is allowed to replace ──

    Read **before** the sources, and on its own, which is the whole point.

    The first attempt at this put it inside the `Promise.all` below, on the
    reasoning that one more parallel request costs nothing. It answers nothing
    though: eleven concurrent requests settle in whatever order the network
    gives them, so the token can be fetched *after* the sources — and then it
    certifies a row that was written while this rebuild was already reading.
    Measured, with one copy of this function on a slow connection:

        [2] xong                       (ghi 1200)
        [trace] seen= {updated_at: …}  kcal= 500   ← đọc token SAU khi 2 đã ghi
        [trace] update touched [{id}]              ← và ghi đè
        cuối cùng: 500

    A guard that can be read after the thing it guards is not a guard. One
    sequential round trip buys the ordering: whatever the token says, every
    source read below happened after it, so a row that changed since is a row
    written by somebody whose reads were at least as fresh as ours.
  */
  const existingRes = await supabase
    .from('daily_logs')
    .select('id, updated_at')
    .eq('user_id', userId)
    .eq('date', date)
    .maybeSingle();
  if (existingRes.error) {
    throw new DailyLogRebuildError(
      `Không đọc được ngày ${date}: ${existingRes.error.message}`,
    );
  }

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
      .gte('date_time', chronic.start)
      .lt('date_time', chronic.end)
      .order('date_time', { ascending: true }),
    supabase
      /* `session_rpe` and `sets` rather than `volume_load` — see the note on
         `trainingLoad7d` below. Tonnage is still read further up for
         `daily_logs.volume_load`; this pair is the *internal* load. */
      .from('workout_sessions')
      .select('session_rpe, sets')
      .eq('user_id', userId)
      .gte('date_time', acute.start)
      .lt('date_time', acute.end),
    supabase
      /* `date_time` travels with the load because the ratio needs to know how
         many days it is averaging over — see `training_days_28d`. */
      .from('workout_sessions')
      .select('session_rpe, sets, date_time')
      .eq('user_id', userId)
      .gte('date_time', chronic.start)
      .lt('date_time', chronic.end),
    supabase
      .from('sleep_logs')
      .select('bedtime, waketime, asleep_min')
      .eq('user_id', userId)
      .gte('waketime', acute.start)
      .lt('waketime', acute.end),
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
    throw new DailyLogRebuildError(
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
  /* One rule, shared with the training card — which prints the two quantities
     this ratio compares, and so has to divide by the same span or the card
     disproves its own verdict.

     ── and only the sessions the sum actually contains ──

     The span has to describe the same set of sessions as the load, and since
     the load switched to the session-RPE method it no longer contains the
     unmeasurable ones. Passing every row here would divide a sum built from
     three weighted sessions by a span reaching back to a run four weeks ago —
     a chronic average deflated by days that contributed nothing, which reads
     as a spike and lands on the wrong side of the overreaching threshold.

     So the rows are filtered by the same test that builds the sum. */
  const measured28d = ((load28d ?? []) as (LoadSession & { date_time?: string | null })[]).filter(
    (row) => sessionLoad(row) != null,
  );
  const trainingDays28d = chronicDays(measured28d);

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

  /*
    ── training load is what the session cost, not what was lifted ──

    This summed `volume_load`, which is `Σ (weight × reps)`. That is a fine
    *external* measure of a barbell session and zero for everything else: a
    session of pull-ups, press-ups and dips came to 0, and so did every run
    imported from a watch (deliberately — a run has no tonnage).

    Zero then propagated. `scoreLoad` bails on `load28d <= 0`, so the readiness
    score silently lost its training dimension; `acwr` stayed null; and with it
    `overreaching` — which is the one condition that stops `suggestLoad` telling
    somebody to add weight — could never fire for them.

    `lib/session-load.ts` computes internal load by the session-RPE method
    instead: `RPE × total reps`, both of which this app has stored all along.
    Sessions it cannot measure return `null` and are dropped from **both** sides
    of the ratio rather than counted as zero-cost work.

    The acute:chronic bands in `readiness-engine` are untouched by the change of
    unit because ACWR is a *ratio* — scale both sides consistently and the value
    is identical. `tools/session-load.mjs` proves that by running it rather than
    asserting it here.
  */
  const trainingLoad7d = loadWindow((load7d ?? []) as LoadSession[]);
  const trainingLoad28d = loadWindow((load28d ?? []) as LoadSession[]);

  let sleepDebt7d = 0;
  if (sleepLogs7d && sleepLogs7d.length > 0) {
    const totalSleep = sleepLogs7d.reduce((s, sl) => s + asleepMinutes(sl), 0);
    const avgSleep = totalSleep / sleepLogs7d.length;
    sleepDebt7d = Math.max(0, sleepTargetMin - avgSleep);
  }

  /*
    ── the gate and the calculator have to mean the same thing (BUG-107) ──

    The comment here used to say *"at least 3 days of any logs"*, and the code
    said something narrower: only biometrics and sleep could open it. Training
    load is a fully scoreable dimension — `computeLoadScore` gives it a band and
    a weight like the other three — but it could not let anybody through.

    Measured on PostgreSQL 16.13 with the real engine: somebody who logs
    barbell sessions for a fortnight and nothing else has a perfectly measurable
    load and got **no readiness score at all**, and with it no `acwr` — which
    the training card and `suggestLoad` both read.

    `trainingLoad28d > 0` is not a fourth opinion about what counts. It is
    **the calculator's own predicate**, verbatim: `computeLoadScore` opens with
    `if (load28d <= 0) return null`. Reusing it is what makes the gate and the
    score agree on the population by construction rather than by coincidence —
    the gate can no longer refuse a dimension the engine would have scored, and
    it still cannot admit one the engine would refuse.

    Two things this deliberately does **not** admit:

      · **A watch-only workout.** `sessionLoad` returns `null` for an import
        with an empty `sets` array, so it contributes nothing to `loadWindow`
        and `trainingLoad28d` stays 0. A run still raises `workout_count` and
        still leaves the load ratio alone — Chain AD's semantics, untouched.
      · **A bare `daily_logs` row.** The sum is built from `workout_sessions`
        through `sessionLoad`, never from the projection, so a row that exists
        because the step sync wrote one cannot open this gate.

    No existing score moves: where the gate already passed, the input handed to
    the engine is byte-for-byte what it was.
  */
  const hasEnoughData =
    (bioHistory && bioHistory.length >= 3) ||
    (sleepLogs7d && sleepLogs7d.length >= 3) ||
    trainingLoad28d > 0;

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

  // 6. Write the day — but only over the row we actually read
  const row = {
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
  };

  /*
    ── this used to be one `upsert`, and two phones could lose a meal ──

    Everything above is eleven reads followed by arithmetic. That is a window,
    and it is not a small one: eleven round trips at a phone's latency is most
    of a second before the write even starts. Two writers inside it both read,
    both compute, and both write — and the second write is a *complete snapshot
    of an older world*, so it does not merge with the first, it replaces it.

    Measured by running this exact function twice against PostgreSQL 16.13, one
    copy on a slow connection:

        thuc_te_da_an | vong_calo_hien
                 1200 |            500

    Two meals eaten, the calorie ring showing one of them — permanently, because
    nothing rebuilds a day that nobody writes to again. Chain F found the same
    shape from the offline queue and fixed the queue; this is the other door
    into it, and it needs no queue at all: a foreground health sync and a meal
    logged at the same moment is enough.

    ── so the write states what it believed ──

    `existingRes` is the row as it was when the reads began. The update refuses
    unless it is still that row, and a refusal means somebody else wrote a
    snapshot taken *later than ours* — which is the better answer, and which we
    then go and read. Both orderings converge on the full total; neither can
    leave the older snapshot standing.

    `updated_at` is the token because a trigger moves it on every update, so it
    changes even when the derived numbers do not. It is sent back exactly as it
    was read, never through `new Date()`, because a round trip through
    milliseconds would not match a microsecond-precision column.
  */
  const seen = existingRes.data as { id: string; updated_at: string } | null;

  if (!seen) {
    const { error } = await supabase.from('daily_logs').insert(row);
    if (error) {
      /* 23505: somebody created the row between our read and our insert. Their
         snapshot is at least as fresh as ours, and re-reading settles it. */
      if (error.code === '23505' && attempt + 1 < REBUILD_ATTEMPTS) {
        return recomputeDailyLog(userId, date, attempt + 1);
      }
      throw new DailyLogRebuildError(`Không lưu được ngày ${date}: ${error.message}`);
    }
    return;
  }

  const { data: written, error } = await supabase
    .from('daily_logs')
    .update(row)
    .eq('id', seen.id)
    .eq('updated_at', seen.updated_at)
    .select('id');

  /*
    ── the write refuses too, now ──

    This used to be `console.error(...)` and `return { error }`, and all sixteen
    call sites did `await recomputeDailyLog(...)` and threw the result away. So
    the half of this file's contract that the header states — *"a rebuild that
    throws leaves the previous row intact and surfaces through the caller's
    `onError`"* — held for the eleven **reads** above and not for the one
    **write** below them.

    What that cost: log a meal, `meal_entries` inserts fine, this write is
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
    throw new DailyLogRebuildError(`Không lưu được ngày ${date}: ${error.message}`);
  }

  if (!written || written.length === 0) {
    /* Touched nothing: the row moved under us. Read the world again and write
       what it says now. */
    if (attempt + 1 < REBUILD_ATTEMPTS) {
      return recomputeDailyLog(userId, date, attempt + 1);
    }

    /*
      ── out of attempts, and "whoever won read later than we did" is not true ──

      That sentence used to stand here as the reason giving up was safe, and it
      rests on the winner having written a *projection*. Not every writer of
      this row does. `daily_logs` is deliberately shared by column — health sync
      owns `steps`, `active_kcal` and `active_minutes`, and `recomputeDailyLog`
      owns everything else — but the CAS token is `updated_at`, and the trigger
      that moves it is `BEFORE UPDATE ON daily_logs FOR EACH ROW`. So a
      steps-only upsert bumps the token while writing no projection at all.

      Three of those inside one rebuild's read window and this function returned
      **normally**, having written nothing. Measured against PostgreSQL 16.13
      with the real function and a steps writer running beside it:

          threw?    NO — resolved normally
          derived:  kcal 500        oracle: kcal 1200

      Silently, permanently, in the one table every other feature reads.

      So the row is read once more and the two cases are told apart. If it now
      holds the projection this rebuild was going to write, the day is correct
      and there is nothing left to do — that is the benign case, and it stays
      silent. Anything else is a rebuild that did not happen, and this file's
      whole contract is that such a thing says so.
    */
    const settled = await supabase
      .from('daily_logs')
      .select(PROJECTION_COLUMNS)
      .eq('id', seen.id)
      .maybeSingle();
    const stored = settled.data as Record<string, unknown> | null;
    if (!settled.error && stored && projectionEquals(stored, row)) return;
    throw new DailyLogRebuildError(
      `Không dựng lại được ngày ${date}: hàng bị ghi đè liên tục sau ${REBUILD_ATTEMPTS} lần thử`,
    );
  }
}
