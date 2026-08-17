/**
 * A finished day's step total, worked out from HealthKit's own per-day buckets.
 *
 * ── why this is a file and not a helper inside `health.ts` ──
 *
 * The same reason `curve.ts` and `water-scale.ts` sit apart from what uses
 * them: `health.ts` opens with `import { Platform } from 'react-native'` and a
 * guarded `require` of the HealthKit native module, so nothing in it can be
 * loaded in Node. Every decision here can be wrong in a way a person reading it
 * would not notice — which calendar day a bucket belongs to, whether a day with
 * no samples is a zero — and the only way to hold those still is to run them.
 *
 * `tools/health-sync.mjs` compiles this file and calls `dailyStepsFrom` for
 * real, in processes with `TZ` set, across four zones and both daylight-saving
 * transitions. The HealthKit query that produces the buckets cannot be run
 * here, and this file is deliberately the boundary where that stops mattering:
 * everything above it is Apple's, everything below it is arithmetic.
 */
import { localDateStr } from '@/lib/local-date';

/**
 * How far back a completed day may still be corrected.
 *
 * ── derived, not chosen ──
 *
 * The largest window any consumer of `daily_logs.steps` reads is the Steps
 * screen: `useStepsHistory(14)` draws a fourteen-bar chart, a seven-day mean and
 * a three-against-three trend from it. The weekly `steps_50k` challenge sums the
 * current week, which is at most seven. Readiness does not read steps at all —
 * `recomputeDailyLog` neither reads nor writes the column.
 *
 * So fourteen is the smallest number that makes every existing reader correct,
 * and one more would be a day nothing in the app can display.
 */
export const STEP_HISTORY_DAYS = 14;

/** One day as `queryStatisticsCollectionForQuantity` hands it back. */
export interface StepBucket {
  /** the bucket's own start — local midnight of the day it covers */
  startDate: Date | string;
  /** absent when HealthKit had nothing for that day, which is not the same as zero */
  sumQuantity?: { quantity: number } | null;
}

/**
 * Completed local days, from HealthKit's own per-day buckets.
 *
 * ── why this is a separate, pure function ──
 *
 * It is the only part of the step path that can be executed anywhere but an
 * iPhone, and it is where every decision that can be wrong lives: which
 * calendar day a bucket belongs to, whether a day with no samples is a zero,
 * and whether today is included. `tools/health-sync.mjs` runs this for real
 * across four timezones and a daylight-saving boundary — the HealthKit query
 * above it cannot be run here, and pretending otherwise would be worse than
 * saying so.
 *
 * ── three rules, each of which was a way to get it wrong ──
 *
 * **The day comes from the bucket's own start, through `localDateStr`.** The
 * bucket is anchored at local midnight and `localDateStr` reads a `Date` in
 * local time, so the two agree by construction. `toISOString().slice(0, 10)`
 * would be the UTC date — the class Chain A found in six places and
 * `tools/day-window.mjs` now forbids.
 *
 * **A bucket with no sum is skipped, not written as 0.** HealthKit returns no
 * `sumQuantity` for a day it holds nothing for — the phone was off, Health was
 * not yet granted, the account is younger than the window. Writing zero there
 * would state that somebody did not move on a day nobody measured, and it would
 * also flip `useStepsAvailable` — which asks `.not('steps','is',null)` — to
 * "this account has a step source" on the strength of a day that proves the
 * opposite.
 *
 * **Today is dropped.** Today's row is written from `getTodaySteps()`, whose
 * window ends *now* rather than at midnight, and one writer per row is what
 * keeps the two from racing inside a single sync. This function exists for the
 * days that are finished.
 */
export function dailyStepsFrom(
  buckets: readonly StepBucket[],
  today: string,
): { date: string; steps: number }[] {
  const out = new Map<string, number>();
  for (const b of buckets) {
    const q = b.sumQuantity?.quantity;
    if (q == null || !Number.isFinite(q)) continue;
    const d = new Date(b.startDate as string | Date);
    if (Number.isNaN(+d)) continue;
    const date = localDateStr(d);
    /* `>=`, so today and anything a wrong device clock put in the future are
       both out. A future-dated row would sit at the right-hand end of every
       chart for as long as it took the clock to catch up. */
    if (date >= today) continue;
    /* Buckets are one per day, but a Map rather than a push keeps that a
       property of the output instead of a hope about the input: two buckets
       landing on one local date — which is what a backwards DST hour would
       do — must produce one row, and the later one is the fuller one. */
    out.set(date, Math.round(q));
  }
  return [...out].map(([date, steps]) => ({ date, steps })).sort((a, b) => a.date.localeCompare(b.date));
}
