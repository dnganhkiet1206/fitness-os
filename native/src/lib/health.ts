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
  'HKQuantityTypeIdentifierHeartRate',
  'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
  'HKQuantityTypeIdentifierOxygenSaturation',
  'HKQuantityTypeIdentifierRespiratoryRate',
] as const;

export interface HealthBiometrics {
  hr_bpm: number | null;
  hrv_rmssd_ms: number | null;
  spo2_pct: number | null;
  resp_rate_rpm: number | null;
  source: string;
  date_time: string;
  confidence: number;
}

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

/** Apple's Exercise ring — minutes at brisk-walk intensity or above. */
export function getTodayExerciseMinutes(): Promise<number | null> {
  return todayTotal('HKQuantityTypeIdentifierAppleExerciseTime', 'min');
}

async function latestQuantity(
  identifier:
    | 'HKQuantityTypeIdentifierHeartRate'
    | 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN'
    | 'HKQuantityTypeIdentifierOxygenSaturation'
    | 'HKQuantityTypeIdentifierRespiratoryRate',
  unit: string,
): Promise<number | null> {
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
    return samples[0]?.quantity ?? null;
  } catch {
    return null;
  }
}

export async function getLatestBiometrics(): Promise<HealthBiometrics | null> {
  if (!hk) return null;
  const [hr, hrv, spo2, resp] = await Promise.all([
    latestQuantity('HKQuantityTypeIdentifierHeartRate', 'count/min'),
    latestQuantity('HKQuantityTypeIdentifierHeartRateVariabilitySDNN', 'ms'),
    latestQuantity('HKQuantityTypeIdentifierOxygenSaturation', '%'),
    latestQuantity('HKQuantityTypeIdentifierRespiratoryRate', 'count/min'),
  ]);
  if (hr == null && hrv == null && spo2 == null && resp == null) return null;
  return {
    hr_bpm: hr != null ? Math.round(hr) : null,
    hrv_rmssd_ms: hrv != null ? Math.round(hrv) : null,
    // HealthKit reports SpO2 as a 0–1 fraction
    spo2_pct: spo2 != null ? Math.round(spo2 * 100) : null,
    resp_rate_rpm: resp != null ? Math.round(resp) : null,
    source: 'apple_health',
    date_time: new Date().toISOString(),
    confidence: 1,
  };
}
