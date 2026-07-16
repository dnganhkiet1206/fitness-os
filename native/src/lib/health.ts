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

const READ_TYPES = [
  'HKQuantityTypeIdentifierStepCount',
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

export async function getTodaySteps(): Promise<number | null> {
  if (!hk) return null;
  try {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const stats = await hk.queryStatisticsForQuantity(
      'HKQuantityTypeIdentifierStepCount',
      ['cumulativeSum'],
      { filter: { date: { startDate: start, endDate: new Date() } }, unit: 'count' },
    );
    const value = stats.sumQuantity?.quantity;
    return value != null ? Math.round(value) : null;
  } catch {
    return null;
  }
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
