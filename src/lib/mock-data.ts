// Fitness OS – Mock Data for Dashboard
import type {
  UserProfile, DailyLog, BiometricSample, WorkoutSession,
  SleepLog, HabitNudge, WearableSource,
} from './types';
import { computeReadiness } from './readiness-engine';

export const mockUser: UserProfile = {
  id: 'u1',
  name: 'Alex Nguyen',
  dob: '1995-06-15',
  sex: 'male',
  height_cm: 178,
  weight_kg: 79.5,
  units: { weight: 'kg', height: 'cm' },
  goal: 'recomp',
  activity_level: 'high',
  tdee_target_kcal: 2650,
  macro_targets: { protein_g: 175, carbs_g: 280, fat_g: 85, fiber_g: 30 },
  sleep_targets: { hours: 8, bedtime: '23:00', waketime: '07:00' },
};

// 28 days of HRV + RHR history
const hrvHistory = [
  58, 62, 55, 60, 64, 57, 59, 63, 61, 58, 56, 65, 60, 62,
  59, 61, 64, 58, 63, 60, 57, 66, 62, 59, 61, 63, 55, 60,
];
const rhrHistory = [
  52, 51, 54, 53, 52, 55, 53, 51, 52, 54, 53, 50, 52, 53,
  54, 52, 51, 53, 52, 54, 53, 51, 52, 53, 55, 52, 53, 51,
];

// Today's biometrics
export const todayBiometrics: BiometricSample = {
  id: 'b1',
  userId: 'u1',
  dateTime: new Date().toISOString(),
  source: 'wearable',
  metrics: {
    hr_bpm: 53,
    hrv_rmssd_ms: 62,
    spo2_pct: 97,
    vo2max_mlkgmin: 44.2,
    resp_rate_rpm: 14,
  },
  confidence_0_1: 0.85,
};

// Compute today's readiness
const readinessInput = {
  hrv_today: 62,
  rhr_today: 53,
  sleep_min_lastnight: 438,
  sleep_target_min: 480,
  sleep_debt_7d_min: 25,
  training_load_7d: 12500,
  training_load_28d: 48000,
  soreness_today: 4,
  illness_flag: false,
  pain_flag_max: 2,
  hrv_history_28d: hrvHistory,
  rhr_history_28d: rhrHistory,
};

export const todayReadiness = computeReadiness(readinessInput);

export const todayDailyLog: DailyLog = {
  id: 'd1',
  userId: 'u1',
  date: new Date().toISOString().split('T')[0],
  nutritionSummary: { kcal: 1840, protein_g: 128, carbs_g: 185, fat_g: 62, fiber_g: 18 },
  activitySummary: { steps: 7240, active_minutes: 45, active_kcal: 380 },
  sleepSummary: { duration_min: 438, quality_1_10: 7 },
  readiness: { score_0_100: todayReadiness.score, status: todayReadiness.status, explain: todayReadiness.explain },
};

export const todaySleep: SleepLog = {
  id: 's1',
  userId: 'u1',
  bedtime: '2024-01-14T23:22:00',
  waketime: '2024-01-15T06:40:00',
  quality_1_10: 7,
  sleepStages: { light_min: 198, deep_min: 102, rem_min: 138 },
};

export const recentWorkouts: WorkoutSession[] = [
  {
    id: 'w1', userId: 'u1', dateTime: '2024-01-15T07:30:00',
    templateName: 'Push Day A',
    sessionRPE_1_10: 7,
    painFlags: [{ bodyPart: 'left shoulder', pain_0_10: 2 }],
    sets: [
      { exerciseId: 'e1', exerciseName: 'Bench Press', setIndex: 1, weight: 85, reps: 8, rpe: 7 },
      { exerciseId: 'e1', exerciseName: 'Bench Press', setIndex: 2, weight: 85, reps: 7, rpe: 8 },
      { exerciseId: 'e1', exerciseName: 'Bench Press', setIndex: 3, weight: 85, reps: 6, rpe: 9 },
      { exerciseId: 'e2', exerciseName: 'OHP', setIndex: 1, weight: 50, reps: 10, rpe: 7 },
      { exerciseId: 'e2', exerciseName: 'OHP', setIndex: 2, weight: 50, reps: 9, rpe: 8 },
    ],
    computed: { volumeLoad: 3710, prDetected: false },
  },
  {
    id: 'w2', userId: 'u1', dateTime: '2024-01-13T08:00:00',
    templateName: 'Pull Day A',
    sessionRPE_1_10: 8,
    painFlags: [],
    sets: [
      { exerciseId: 'e3', exerciseName: 'Deadlift', setIndex: 1, weight: 140, reps: 5, rpe: 8 },
      { exerciseId: 'e3', exerciseName: 'Deadlift', setIndex: 2, weight: 140, reps: 5, rpe: 9 },
      { exerciseId: 'e4', exerciseName: 'Barbell Row', setIndex: 1, weight: 70, reps: 10, rpe: 7 },
    ],
    computed: { volumeLoad: 2100, prDetected: true },
  },
];

export const activeNudges: HabitNudge[] = [
  { id: 'n1', userId: 'u1', type: 'sleep', message: 'Bedtime in 30 min — wind down to hit your 8h target.', priority: 'high', enabled: true, frequencyCapPerDay: 1 },
  { id: 'n2', userId: 'u1', type: 'protein', message: 'You\'re 47g short on protein. Add a high-protein snack.', priority: 'medium', enabled: true, frequencyCapPerDay: 2 },
  { id: 'n3', userId: 'u1', type: 'hydration', message: 'High activity today — aim for 3L+ water.', priority: 'low', enabled: true, frequencyCapPerDay: 3 },
  { id: 'n4', userId: 'u1', type: 'steps', message: 'Walk break — you\'ve been sitting for 90 min.', priority: 'medium', enabled: true, frequencyCapPerDay: 4 },
];

export const connectedWearables: WearableSource[] = [
  { id: 'ws1', userId: 'u1', provider: 'apple_health', connected: true, lastSync: '12 min ago' },
  { id: 'ws2', userId: 'u1', provider: 'oura', connected: false },
];

// Weekly readiness trend (last 7 days)
export const readinessTrend = [
  { day: 'Mon', score: 72, status: 'yellow' as const },
  { day: 'Tue', score: 68, status: 'yellow' as const },
  { day: 'Wed', score: 81, status: 'green' as const },
  { day: 'Thu', score: 76, status: 'green' as const },
  { day: 'Fri', score: 65, status: 'yellow' as const },
  { day: 'Sat', score: 85, status: 'green' as const },
  { day: 'Sun', score: todayReadiness.score, status: todayReadiness.status },
];

// Macro progress for today
export const macroProgress = {
  protein: { current: 128, target: 175 },
  carbs: { current: 185, target: 280 },
  fat: { current: 62, target: 85 },
  calories: { current: 1840, target: 2650 },
};
