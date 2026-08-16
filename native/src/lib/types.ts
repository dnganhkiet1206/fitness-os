// ASCND – Core Types

export interface UserProfile {
  id: string;
  name: string;
  dob: string;
  sex: string;
  height_cm: number;
  weight_kg: number;
  units: { weight: 'kg' | 'lb'; height: 'cm' | 'in' };
  goal: 'bulk' | 'cut' | 'maintain' | 'recomp' | 'strength' | 'endurance';
  activity_level: 'sedentary' | 'light' | 'moderate' | 'high' | 'athlete';
  tdee_target_kcal: number;
  macro_targets: { protein_g: number; carbs_g: number; fat_g: number; fiber_g: number };
  sleep_targets: { hours: number; bedtime: string; waketime: string };
}

export interface DailyLog {
  id: string;
  userId: string;
  date: string;
  nutritionSummary: { kcal: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g: number };
  activitySummary: { steps: number; active_minutes: number; active_kcal: number };
  sleepSummary: { duration_min: number; quality_1_10: number };
  readiness: { score_0_100: number; status: 'green' | 'yellow' | 'red'; explain: string };
}

export interface BiometricSample {
  id: string;
  userId: string;
  dateTime: string;
  source: 'wearable' | 'camera_rppg' | 'manual';
  metrics: {
    hr_bpm?: number;
    hrv_rmssd_ms?: number;
    spo2_pct?: number;
    vo2max_mlkgmin?: number;
    resp_rate_rpm?: number;
  };
  confidence_0_1: number;
  notes?: string;
}

export interface WorkoutSession {
  id: string;
  userId: string;
  dateTime: string;
  templateId?: string;
  templateName?: string;
  sessionRPE_1_10: number;
  painFlags: { bodyPart: string; pain_0_10: number }[];
  sets: { exerciseId: string; exerciseName: string; setIndex: number; weight: number; reps: number; rpe?: number }[];
  computed: { volumeLoad: number; prDetected: boolean };
}

export interface SleepLog {
  id: string;
  userId: string;
  bedtime: string;
  waketime: string;
  quality_1_10: number;
  sleepStages?: { light_min: number; deep_min: number; rem_min: number };
}

export interface HabitNudge {
  id: string;
  userId: string;
  type: 'sleep' | 'hydration' | 'protein' | 'steps' | 'recovery';
  message: string;
  priority: 'low' | 'medium' | 'high';
  enabled: boolean;
  frequencyCapPerDay: number;
}

export interface WeeklyReview {
  id: string;
  userId: string;
  weekStartDate: string;
  stats: {
    avg_kcal: number;
    avg_protein_g: number;
    workout_completion_pct: number;
    avg_sleep_min: number;
    readiness_avg: number;
  };
  insights: string[];
  recommendations: string[];
}

export interface WearableSource {
  id: string;
  userId: string;
  provider: 'apple_health' | 'google_fit' | 'oura' | 'whoop' | 'other';
  connected: boolean;
  lastSync?: string;
}

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

export type ReadinessStatus = 'green' | 'yellow' | 'red';
