/**
 * Apple HealthKit integration (steps, heart rate, HRV, SpO2, respiratory
 * rate). Write targets mirror the web app: biometric_samples inserts and
 * daily_logs.steps upserts.
 *
 * The native module (Nitro) only exists in a dev/production build — in
 * Expo Go or on web the guarded require fails and every function
 * degrades to "unavailable" instead of crashing.
 */
import { Platform } from 'react-native';

import { localDateStr } from '@/lib/local-date';
import { dailyStepsFrom, STEP_HISTORY_DAYS, type StepBucket } from '@/lib/step-days';

type HealthKitModule = typeof import('@kingstinct/react-native-healthkit');

let hk: HealthKitModule | null = null;
if (Platform.OS === 'ios') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    hk = require('@kingstinct/react-native-healthkit') as HealthKitModule;
    // Touch a synchronous API so a broken native install fails HERE, not later
    hk.isHealthDataAvailable();
  } catch {
    hk = null; // Expo Go / simulator without the module
  }
}

/*
  Active energy and exercise time are here because the Activity card's two
  outer rings were reading `daily_logs.active_kcal` and `active_minutes`,
  columns that existed in the schema and were written by nothing anywhere in
  the app. They are Apple's Move and Exercise rings, they come from the same
  place the step count already came from, and asking for two more read
  permissions in the same prompt costs nothing.
*/
const READ_TYPES = [
  'HKQuantityTypeIdentifierStepCount',
  'HKQuantityTypeIdentifierActiveEnergyBurned',
  'HKQuantityTypeIdentifierAppleExerciseTime',
  /*
    Resting heart rate, not heart rate.

    `hr_bpm` is a resting-heart-rate column — the manual entry field above it is
    labelled "Nhịp tim nghỉ (bpm)" and `readiness-engine` scores it as `rhr`,
    named "Nhịp tim nghỉ" on the card. This path read
    `HKQuantityTypeIdentifierHeartRate`, which is the most recent *instantaneous*
    reading: sync after walking up stairs and the app recorded a resting heart
    rate of 110, then scored the day against it at a weight of 0.20 — 0.25 when
    HRV is missing.

    `RestingHeartRate` is a separate type that watchOS computes once a day from
    periods of inactivity, which is the quantity this column was always for.
  */
  'HKQuantityTypeIdentifierRestingHeartRate',
  'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
  'HKQuantityTypeIdentifierOxygenSaturation',
  'HKQuantityTypeIdentifierRespiratoryRate',
  /*
    Sleep and workouts, which the app had features for and no source of.

    The sleep screen, the readiness score's 30%-weighted sleep term, the
    assistant's briefing and the nightly insight all read `sleep_duration_min`,
    and the only writer was a person typing it in the morning. The watch on
    their wrist had already recorded it, staged, to the minute.
  */
  'HKCategoryTypeIdentifierSleepAnalysis',
  'HKWorkoutTypeIdentifier',
] as const;

export interface HealthBiometrics {
  hr_bpm: number | null;
  /**
   * SDNN, not RMSSD — and the name matters here more than names usually do.
   *
   * This used to be called `hrv_rmssd_ms` and was written into a column of that
   * name, alongside values people typed into a field labelled "HRV RMSSD".
   * Apple publishes only SDNN through HealthKit; SDNN and RMSSD are different
   * quantities that do not convert into each other. Mixed in one column they
   * produced a bimodal 28-day baseline for a readiness term weighted at 0.30 —
   * see the migration `20260809120000_health_provenance.sql`.
   */
  hrv_sdnn_ms: number | null;
  spo2_pct: number | null;
  resp_rate_rpm: number | null;
  source: string;
  /** when the newest contributing reading was taken — not when the sync ran */
  date_time: string;
  /**
   * HealthKit's identity for that reading, `hk:<uuid>`.
   *
   * The same role `external_id` plays for sleep and workouts since
   * `20260809120000_health_provenance.sql`: re-importing a reading already
   * stored is an update of one row rather than a second copy of it. This table
   * was the one the provenance migration missed.
   */
  external_id: string | null;
  confidence: number;
}

/** What this app calls data that came from Apple Health. One string, one place. */
export const APPLE_SOURCE = 'apple_health';

export function isHealthKitAvailable(): boolean {
  try {
    return hk?.isHealthDataAvailable() ?? false;
  } catch {
    return false;
  }
}

export async function requestHealthPermissions(): Promise<boolean> {
  if (!hk) return false;
  try {
    return await hk.requestAuthorization({ toRead: [...READ_TYPES] });
  } catch {
    return false;
  }
}

/**
 * Has this person already been through the Health permission sheet?
 *
 * ── what it is for ──
 *
 * Reading Health on app open, without ever putting a permission sheet in front
 * of somebody who did not ask for one. iOS shows that sheet **once**; spending
 * it at a moment the person did not choose is spending it badly, and a "no"
 * given to a sheet that appeared out of nowhere cannot be asked again from
 * inside the app — only from Settings, which nobody goes to.
 *
 * So: `requestHealthPermissions` is for a button somebody pressed. This is for
 * everything else.
 *
 * ── what it does not tell you ──
 *
 * Not whether they said yes. Apple deliberately refuses to answer that for
 * *read* access — telling an app "you may not read this" leaks the fact that
 * the data exists, so `authorizationStatusFor` is only meaningful for writing.
 * `HKAuthorizationRequestStatus.unnecessary` means only "asking again would
 * show nothing new".
 *
 * That is enough here, and the distinction is already handled downstream: a
 * sync that comes back with nothing is treated as nothing to write. Reading
 * zero types after a denial costs one cheap local query and writes nothing.
 */
export async function healthAlreadyAsked(): Promise<boolean> {
  if (!hk) return false;
  try {
    const status = await hk.getRequestStatusForAuthorization({ toRead: [...READ_TYPES] });
    return status === hk.AuthorizationRequestStatus.unnecessary;
  } catch {
    return false;
  }
}

/**
 * Today's total of a cumulative quantity, in the unit asked for.
 *
 * Steps, active energy and exercise time are the same query three times over —
 * sum everything recorded since local midnight — and they were about to become
 * three copies of it. The window is built with `setHours(0,0,0,0)` on a real
 * `Date`, so it is midnight where the phone is, not midnight UTC.
 *
 * `null` and `0` are kept apart all the way up: null means Health had nothing
 * to say (no permission, no module, a query that threw), zero means it says
 * you have not moved. The card shows different things for those two, so
 * collapsing them here would be deciding that question in the wrong place.
 */
async function todayTotal(
  identifier:
    | 'HKQuantityTypeIdentifierStepCount'
    | 'HKQuantityTypeIdentifierActiveEnergyBurned'
    | 'HKQuantityTypeIdentifierAppleExerciseTime',
  unit: string,
): Promise<number | null> {
  if (!hk) return null;
  try {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const stats = await hk.queryStatisticsForQuantity(
      identifier,
      ['cumulativeSum'],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { filter: { date: { startDate: start, endDate: new Date() } }, unit: unit as any },
    );
    const value = stats.sumQuantity?.quantity;
    return value != null ? Math.round(value) : null;
  } catch {
    return null;
  }
}

export function getTodaySteps(): Promise<number | null> {
  return todayTotal('HKQuantityTypeIdentifierStepCount', 'count');
}

/** Apple's Move ring — active calories only, not the resting burn. */
export function getTodayActiveEnergy(): Promise<number | null> {
  return todayTotal('HKQuantityTypeIdentifierActiveEnergyBurned', 'kcal');
}

/**
 * The last `STEP_HISTORY_DAYS` of finished days, as HealthKit counts them.
 *
 * One query, not fourteen. `queryStatisticsCollectionForQuantity` is Apple's
 * bucketing API: anchored at local midnight with a one-day interval, it returns
 * one `cumulativeSum` per calendar day, computed by the same aggregation
 * `todayTotal` already uses for today. That matters more than the saving — a
 * chart whose last bar is summed one way and whose other thirteen are summed
 * another is a chart comparing two different quantities.
 *
 * Interval arithmetic is HealthKit's, which means it is the device's calendar's.
 * The two days a year that are 23 or 25 hours long are therefore Apple's
 * problem rather than this file's, which is the right place for them: a
 * hand-rolled `+ 864e5` is exactly how the app got DST wrong before
 * (`lib/local-date.ts`, `weekDates`).
 */
export async function getDailyStepHistory(): Promise<{ date: string; steps: number }[]> {
  if (!hk) return [];
  try {
    const anchor = new Date();
    anchor.setHours(0, 0, 0, 0);
    const start = new Date(anchor);
    start.setDate(start.getDate() - (STEP_HISTORY_DAYS - 1));
    const buckets = await hk.queryStatisticsCollectionForQuantity(
      'HKQuantityTypeIdentifierStepCount',
      ['cumulativeSum'],
      anchor,
      { day: 1 },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { filter: { date: { startDate: start, endDate: new Date() } }, unit: 'count' as any },
    );
    return dailyStepsFrom(buckets as readonly StepBucket[], localDateStr());
  } catch {
    /* Same contract as every other reader here: unavailable is an empty answer,
       not a thrown sync. The day's own steps still land through `getTodaySteps`. */
    return [];
  }
}

/** Apple's Exercise ring — minutes at brisk-walk intensity or above. */
export function getTodayExerciseMinutes(): Promise<number | null> {
  return todayTotal('HKQuantityTypeIdentifierAppleExerciseTime', 'min');
}

/**
 * A reading, with the two things about it that are not its value.
 *
 * ── why the timestamp had to start travelling ──
 *
 * This returned `samples[0]?.quantity` and dropped the rest of the sample on
 * the floor. `getLatestBiometrics` then stamped the row `date_time: new
 * Date().toISOString()` — **the moment of the sync**, not the moment of the
 * reading — and the window this function searches is *seven days*.
 *
 * So a resting heart rate the watch computed on Tuesday, synced on Friday
 * afternoon, was written as a reading taken on Friday afternoon. Two things
 * downstream believe that date:
 *
 *   - `daily-log-service` picks today's biometrics with `localDayRangeISO` and
 *     takes the newest, so a stale reading is scored as today's — and resting
 *     HR carries 0.20 of the readiness score, 0.25 when HRV is absent;
 *   - `hrv_history_28d` and `rhr_history_28d` are the 28-day baselines the two
 *     largest terms are z-scored against, and every value in them sat at a
 *     sync time rather than where the reading actually happened.
 *
 * The sample knows its own `startDate` and its own `uuid` — `BaseSample` in
 * `@kingstinct/react-native-healthkit` carries both. Neither had to be
 * derived; they only had to be kept.
 */
interface Reading {
  value: number;
  /** when the reading was taken, from the sample itself */
  at: string;
  /** HealthKit's identity for this sample, so re-importing is a no-op */
  uuid: string;
}

async function latestQuantity(
  identifier:
    | 'HKQuantityTypeIdentifierRestingHeartRate'
    | 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN'
    | 'HKQuantityTypeIdentifierOxygenSaturation'
    | 'HKQuantityTypeIdentifierRespiratoryRate',
  unit: string,
): Promise<Reading | null> {
  if (!hk) return null;
  try {
    const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    const samples = await hk.queryQuantitySamples(identifier, {
      filter: { date: { startDate: weekAgo } },
      limit: 1,
      ascending: false,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      unit: unit as any,
    });
    const s = samples[0];
    if (s == null || s.quantity == null) return null;
    /* `startDate` crosses a native bridge and arrives as a `Date` or as the
       string one serialises to, depending on the runtime. Both go through
       `new Date`; an unparseable one falls back to now, which is what the whole
       file used to do unconditionally. */
    const at = new Date(s.startDate as unknown as string | Date);
    return {
      value: s.quantity,
      at: Number.isNaN(+at) ? new Date().toISOString() : at.toISOString(),
      uuid: String(s.uuid ?? ''),
    };
  } catch {
    return null;
  }
}

/**
 * SpO₂ as a percentage, whichever way the unit came back.
 *
 * ── this is a guard, not a conversion ──
 *
 * The old line was `Math.round(spo2 * 100)` under a comment asserting that
 * HealthKit reports a 0–1 fraction. That is what `HKUnit.percent()` documents,
 * and it is also contradicted by reports of the same unit returning 61.0 for
 * 61% — and this code does not touch `HKUnit` directly anyway, it passes the
 * string `'%'` through a bridge whose mapping is its own business.
 *
 * I could not confirm which it is here, and guessing costs a factor of a
 * hundred: 0.97 written as an SpO₂ of 1%, or 97 written as 9700%. Both would
 * sail past every type in this file.
 *
 * So it is decided by the value instead, which needs no documentation to be
 * true: blood oxygen is a fraction between about 0.7 and 1.0, or a percentage
 * between 70 and 100. The two ranges do not overlap and nothing real lands
 * between them, so a reading identifies its own unit. Anything outside both is
 * not a saturation reading and is dropped rather than clamped into looking like
 * one.
 */
function asPercent(v: number): number | null {
  if (v > 1 && v <= 100) return Math.round(v);
  if (v > 0 && v <= 1) return Math.round(v * 100);
  return null;
}

export async function getLatestBiometrics(): Promise<HealthBiometrics | null> {
  if (!hk) return null;
  const [hr, hrv, spo2, resp] = await Promise.all([
    latestQuantity('HKQuantityTypeIdentifierRestingHeartRate', 'count/min'),
    latestQuantity('HKQuantityTypeIdentifierHeartRateVariabilitySDNN', 'ms'),
    latestQuantity('HKQuantityTypeIdentifierOxygenSaturation', '%'),
    latestQuantity('HKQuantityTypeIdentifierRespiratoryRate', 'count/min'),
  ]);
  const readings = [hr, hrv, spo2, resp].filter((r): r is Reading => r != null);
  if (readings.length === 0) return null;

  /*
    ── the row is stamped and named by its newest contributing reading ──

    Four metrics, four samples, four different moments, one row. The honest
    "as of" for that row is the most recent of them: it is the point after
    which nothing in the row is new, which is exactly the question
    `daily-log-service` asks when it looks for *today's* biometrics.

    That same sample's `uuid` becomes the row's identity. It is deterministic
    for a given set of readings, so a sync that finds nothing new upserts onto
    the row it already wrote instead of adding another — and the moment any one
    metric updates, the newest sample changes, the id changes, and the new
    reading becomes a new row rather than overwriting the old one.

    Without it, every foreground of the day inserted another copy of the same
    two numbers: Apple computes resting heart rate once a day and HRV SDNN a
    handful of times, while `useAutoHealthSync` runs every fifteen minutes the
    app is looked at. Those copies are not inert — they are the 28-day baseline
    the readiness score's two largest terms are z-scored against, and a baseline
    made mostly of one repeated value has almost no median absolute deviation.
    A small MAD is a divisor.
  */
  const newest = readings.reduce((a, b) => (+new Date(b.at) > +new Date(a.at) ? b : a));

  return {
    hr_bpm: hr != null ? Math.round(hr.value) : null,
    hrv_sdnn_ms: hrv != null ? Math.round(hrv.value) : null,
    spo2_pct: spo2 != null ? asPercent(spo2.value) : null,
    resp_rate_rpm: resp != null ? Math.round(resp.value) : null,
    source: APPLE_SOURCE,
    date_time: newest.at,
    /* Empty only if HealthKit handed back a sample with no uuid, which it does
       not do — but an empty string must never become the id of a row, because
       every such row would then collide with every other. `null` means "no
       identity", and the unique constraint lets those repeat. */
    external_id: newest.uuid ? `hk:${newest.uuid}` : null,
    confidence: 1,
  };
}

/** One night, as the watch recorded it. */
export interface HealthSleep {
  /** identifies the night for idempotent re-import */
  external_id: string;
  bedtime: string;
  waketime: string;
  asleep_min: number;
  deep_min: number | null;
  light_min: number | null;
  rem_min: number | null;
}

/**
 * Last night, assembled from HealthKit's sleep stages.
 *
 * ── why the samples have to be stitched ──
 *
 * HealthKit does not store "a night". It stores a run of short category
 * samples, each one a stage with a start and an end — core, deep, REM, awake,
 * and on older data a single `asleepUnspecified`. A night is a *cluster* of
 * those, and the app has to decide where one night ends and the next begins.
 *
 * The rule here is a gap: samples more than `NIGHT_GAP_MIN` apart belong to
 * different sleeps. That is what separates last night from an afternoon nap,
 * and it is why this cannot be "take everything since yesterday and add it up".
 *
 * ── in bed is not asleep ──
 *
 * `inBed` and `awake` are excluded from the total. Counting them is the classic
 * way a sleep figure comes out an hour too generous — somebody who reads in bed
 * for forty minutes did not sleep for forty minutes, and the readiness score
 * weights sleep at 0.30, so the error goes straight into the headline number.
 *
 * Bedtime is the first sample of the cluster including `inBed`, because when
 * you got into bed is a real thing the screen shows; the *duration* is only the
 * asleep stages.
 */
const NIGHT_GAP_MIN = 90;

export async function getLastNightSleep(): Promise<HealthSleep | null> {
  if (!hk) return null;
  try {
    /* 36 hours back: enough to catch a night that started before midnight the
       previous day, without reaching into the night before that. */
    const since = new Date(Date.now() - 36 * 3600 * 1000);
    const samples = await hk.queryCategorySamples('HKCategoryTypeIdentifierSleepAnalysis', {
      filter: { date: { startDate: since, endDate: new Date() } },
      limit: 0,
      ascending: true,
    });
    if (!samples.length) return null;

    /* The last cluster: walk back from the newest sample while the gap to the
       one before it is smaller than a nap's worth of silence. */
    const sorted = [...samples].sort((a, b) => +new Date(a.startDate) - +new Date(b.startDate));
    let start = sorted.length - 1;
    while (start > 0) {
      const gapMs = +new Date(sorted[start].startDate) - +new Date(sorted[start - 1].endDate);
      if (gapMs > NIGHT_GAP_MIN * 60 * 1000) break;
      start--;
    }
    const night = sorted.slice(start);

    const minutes = (s: { startDate: Date | string; endDate: Date | string }) =>
      (+new Date(s.endDate) - +new Date(s.startDate)) / 60000;

    let asleep = 0;
    let deep = 0;
    let light = 0;
    let rem = 0;
    for (const s of night) {
      const v = Number(s.value);
      const m = minutes(s);
      // 0 inBed, 1 asleepUnspecified, 2 awake, 3 core, 4 deep, 5 REM
      if (v === 2 || v === 0) continue;
      asleep += m;
      if (v === 4) deep += m;
      else if (v === 3) light += m;
      else if (v === 5) rem += m;
    }
    if (asleep < 1) return null;

    const bedtime = new Date(night[0].startDate).toISOString();
    const waketime = new Date(night[night.length - 1].endDate).toISOString();
    return {
      /* The night's own boundaries, so re-running the sync recognises a night
         it has already written even though HealthKit hands back a different
         set of sample uuids each time it is asked. */
      external_id: `sleep:${bedtime}`,
      bedtime,
      waketime,
      asleep_min: Math.round(asleep),
      /* Staged sleep only exists on newer watches. Zero across all three means
         the night came back unstaged, and writing three zeros would claim the
         person got no deep sleep rather than that nothing measured it. */
      deep_min: deep + light + rem > 0 ? Math.round(deep) : null,
      light_min: deep + light + rem > 0 ? Math.round(light) : null,
      rem_min: deep + light + rem > 0 ? Math.round(rem) : null,
    };
  } catch {
    return null;
  }
}

/** A session the watch recorded, in the shape `workout_sessions` stores. */
export interface HealthWorkout {
  external_id: string;
  date_time: string;
  minutes: number;
  kcal: number | null;
  /** Apple's activity type number, resolved to a name by the caller */
  activity_type: number;
}

/**
 * Apple's activity numbers for the kinds people here actually record.
 *
 * Not all eighty. The rest fall through to a generic name, which is honest —
 * "Buổi tập" beside a duration and a calorie figure says everything the card
 * needs, and eighty translated strings for archery and curling would be eighty
 * strings nobody reads.
 */
const ACTIVITY_NAMES: Record<number, { vi: string; en: string }> = {
  13: { vi: 'Đạp xe', en: 'Cycling' },
  16: { vi: 'Máy elliptical', en: 'Elliptical' },
  20: { vi: 'Tập chức năng', en: 'Functional strength' },
  24: { vi: 'Đi bộ đường dài', en: 'Hiking' },
  35: { vi: 'Chèo thuyền', en: 'Rowing' },
  37: { vi: 'Chạy bộ', en: 'Running' },
  44: { vi: 'Leo cầu thang', en: 'Stair climbing' },
  46: { vi: 'Bơi', en: 'Swimming' },
  50: { vi: 'Tập tạ', en: 'Strength training' },
  52: { vi: 'Đi bộ', en: 'Walking' },
  59: { vi: 'Tập core', en: 'Core training' },
  63: { vi: 'HIIT', en: 'HIIT' },
  3000: { vi: 'Buổi tập', en: 'Workout' },
};

export function activityName(type: number, vi: boolean): string {
  const hit = ACTIVITY_NAMES[type] ?? ACTIVITY_NAMES[3000];
  return vi ? hit.vi : hit.en;
}

/**
 * Workouts the watch recorded, newest first.
 *
 * ── these are not the same object as a logged session ──
 *
 * `workout_sessions` in this app is a strength record: sets, reps, load, and a
 * `volume_load` that feeds ACWR. A watch's "Outdoor Run" has a duration and a
 * calorie total and no sets at all, so it cannot fill those fields and must not
 * pretend to.
 *
 * It is still worth importing, because two things in the app ask a question a
 * run answers: `daysSinceWorkout` — which drives the assistant's "you have not
 * trained in 2 days" — and `workout_count`. Both were saying no when the answer
 * was yes.
 *
 * So an imported session carries `volume_load: 0`, and that is deliberate
 * rather than a gap: ACWR sums volume, so a zero-volume row moves the count and
 * leaves the load ratio exactly where it was. A run genuinely does not add
 * tonnage to a lifting programme, and inventing a number for it would corrupt
 * the one metric on that screen that is meant to be trustworthy.
 */
export async function getRecentWorkouts(days = 7): Promise<HealthWorkout[]> {
  if (!hk) return [];
  try {
    const since = new Date(Date.now() - days * 24 * 3600 * 1000);
    const samples = await hk.queryWorkoutSamples({
      filter: { date: { startDate: since, endDate: new Date() } },
      limit: 0,
      ascending: false,
    });
    return samples
      .map((w) => {
        const minutes = Math.round(Number(w.duration?.quantity ?? 0) / 60);
        const kcal = w.totalEnergyBurned?.quantity;
        return {
          external_id: `hk:${w.uuid}`,
          date_time: new Date(w.startDate).toISOString(),
          minutes,
          kcal: kcal != null ? Math.round(Number(kcal)) : null,
          activity_type: Number(w.workoutActivityType),
        };
      })
      /* A tap on the wrong button produces a nine-second workout. Importing it
         makes "you trained today" true on a day nobody trained. */
      .filter((w) => w.minutes >= 5);
  } catch {
    return [];
  }
}
