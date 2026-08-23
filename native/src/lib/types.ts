/**
 * The readiness contract, and nothing else any more.
 *
 * ── what was in here, and why it went ──
 *
 * This file was "ASCND – Core Types": twelve declarations covering the profile,
 * the daily log, a workout session, sleep, nudges, the weekly review. Nine of
 * them were imported by nothing at all, and they described a database the app
 * does not have — `WorkoutSession` named its fields `dateTime`,
 * `sessionRPE_1_10` and `computed.volumeLoad`, where the real columns are
 * `date_time`, `session_rpe` and `volume_load`.
 *
 * That is the failure mode of a description with no consumer: nothing breaks
 * when it drifts, so nothing stops it drifting, and it stays the first thing
 * anybody opening this repository for "what is a workout session" will find.
 * `BiometricSample` had gone one step further — `use-biometrics.ts` declares its
 * own, so there were two types of that name for one table and the app used the
 * other one.
 *
 * What is left is the three the readiness engine actually imports. They are
 * kept true by `tsc`, which is the only thing that ever keeps a type true.
 *
 * The real shapes live where they are used: `hooks/use-fitness-data.ts` for a
 * logged set, `lib/personal-record.ts` for a parsed one, and
 * `integrations/supabase/types.ts` for the tables themselves — that last one
 * generated from the schema rather than written beside it.
 */

export interface ReadinessInput {
  hrv_today?: number | null;
  rhr_today?: number;
  sleep_min_lastnight: number;
  sleep_target_min: number;
  sleep_debt_7d_min: number;
  training_load_7d: number;
  training_load_28d: number;
  /**
   * How many days the 28-day load figure actually covers.
   *
   * Optional, and omitting it means "the whole window" — the behaviour before
   * this existed. It matters for anybody newer than a month: dividing their
   * load by 28 days when only 7 of them happened made a perfectly even training
   * week read as a fourfold spike.
   */
  training_days_28d?: number;
  soreness_today?: number;
  illness_flag: boolean;
  pain_flag_max?: number;
  hrv_history_28d: number[];
  rhr_history_28d: number[];
}

export interface ReadinessResult {
  score: number;
  status: 'green' | 'yellow' | 'red';
  /** Human prose (Vietnamese) — kept for reference/AI; UI renders via tokens */
  explain: string;
  recommendation: string;
  /** Language-neutral tokens the UI localizes at render (render-by-key) */
  explainToken: string;
  recommendationKey: string;
  subscores: {
    /* Optional because "not measured" is a real answer for both of these, and
       a different one from a low score. HRV needs 5 readings of history before
       it means anything; sleep needs a night that was actually recorded. */
    hrv?: number;
    rhr?: number;
    sleep?: number;
    load?: number;
  };
  /**
   * Acute:chronic workload ratio, or `null` when there is no chronic base to
   * compare against.
   *
   * ── why this became nullable ──
   *
   * It was `number`, and `getACWR(0, 0, …)` returns **0**. So somebody who had
   * never logged a session got the same stored value as somebody who trained
   * hard for a month and then took a complete rest week. Those are opposite
   * situations — one is "nothing is known", the other is "well rested" — and
   * the app could not tell them apart because a missing measurement had been
   * given a numeric value.
   *
   * `null` is now reserved for the first. Zero keeps its real meaning: a week
   * with no training *against a baseline that exists*.
   */
  acwr: number | null;
  /**
   * How much of the score is actually measured.
   *
   * The engine renormalises over whatever dimensions are present, which is
   * right — but it meant a 72 built from sleep alone rendered identically to a
   * 72 built from HRV, resting heart rate, sleep and training load. The number
   * carried no trace of how thin it was, and a thin number that looks confident
   * is the definition of false precision.
   */
  confidence: ReadinessConfidence;
}

/**
 * How many independent dimensions the readiness score rests on.
 *
 * Not a probability and not a percentage — a count, banded. The engine has four
 * possible inputs (HRV, resting heart rate, sleep, training load) and drops the
 * ones it cannot measure; this reports how many survived, so a screen can say
 * "based on one thing" rather than presenting one thing as four.
 */
export type ReadinessConfidence = 'high' | 'medium' | 'low';

