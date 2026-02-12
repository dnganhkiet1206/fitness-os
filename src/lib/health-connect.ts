/**
 * Health Data Integration Service
 * 
 * Abstracts Apple HealthKit (iOS) and Google Health Connect (Android)
 * using the @flomentumsolutions/capacitor-health-extended plugin.
 * 
 * On web, this module is a no-op and returns mock availability = false.
 */

import { Capacitor } from '@capacitor/core';

// Plugin types (loaded dynamically on native)
interface HealthSample {
  value: number;
  startDate: string;
  endDate: string;
  sourceName?: string;
}

interface HealthPlugin {
  isAvailable(): Promise<{ available: boolean }>;
  requestAuthorization(opts: { read: string[] }): Promise<void>;
  queryHeartRate(opts: { startDate: string; endDate: string }): Promise<{ data: HealthSample[] }>;
  queryLatestSample(opts: { sampleType: string }): Promise<{ value: number | null; startDate: string | null }>;
}

export interface SyncedBiometrics {
  hr_bpm: number | null;
  hrv_rmssd_ms: number | null;
  spo2_pct: number | null;
  vo2max_mlkgmin: number | null;
  resp_rate_rpm: number | null;
  source: string;
  date_time: string;
  confidence: number;
}

const HEALTH_PERMISSIONS = [
  'heartRate',
  'heartRateVariabilitySDNN',
  'oxygenSaturation',
  'vo2Max',
  'respiratoryRate',
];

let _plugin: HealthPlugin | null = null;

async function getPlugin(): Promise<HealthPlugin | null> {
  if (!Capacitor.isNativePlatform()) return null;
  if (_plugin) return _plugin;

  try {
    // Dynamic import – only resolves on native builds with the plugin installed
    // @ts-ignore - plugin only available in native builds
    const mod = await import(/* @vite-ignore */ '@flomentumsolutions/capacitor-health-extended');
    _plugin = mod.CapacitorHealth as unknown as HealthPlugin;
    return _plugin;
  } catch {
    console.warn('[HealthConnect] Plugin not available');
    return null;
  }
}

export async function isHealthAvailable(): Promise<boolean> {
  const plugin = await getPlugin();
  if (!plugin) return false;
  try {
    const { available } = await plugin.isAvailable();
    return available;
  } catch {
    return false;
  }
}

export async function requestHealthPermissions(): Promise<boolean> {
  const plugin = await getPlugin();
  if (!plugin) return false;
  try {
    await plugin.requestAuthorization({ read: HEALTH_PERMISSIONS });
    return true;
  } catch (e) {
    console.error('[HealthConnect] Permission denied', e);
    return false;
  }
}

async function queryLatest(plugin: HealthPlugin, sampleType: string): Promise<number | null> {
  try {
    const result = await plugin.queryLatestSample({ sampleType });
    return result.value;
  } catch {
    return null;
  }
}

export async function syncLatestBiometrics(): Promise<SyncedBiometrics | null> {
  const plugin = await getPlugin();
  if (!plugin) return null;

  const [hr, hrv, spo2, vo2, resp] = await Promise.all([
    queryLatest(plugin, 'heartRate'),
    queryLatest(plugin, 'heartRateVariabilitySDNN'),
    queryLatest(plugin, 'oxygenSaturation'),
    queryLatest(plugin, 'vo2Max'),
    queryLatest(plugin, 'respiratoryRate'),
  ]);

  // If no data at all, return null
  if (hr == null && hrv == null && spo2 == null && vo2 == null && resp == null) {
    return null;
  }

  const platform = Capacitor.getPlatform();
  const sourceName = platform === 'ios' ? 'apple_health' : 'health_connect';

  return {
    hr_bpm: hr,
    hrv_rmssd_ms: hrv,
    spo2_pct: spo2 != null ? spo2 * 100 : null, // HealthKit returns 0-1
    vo2max_mlkgmin: vo2,
    resp_rate_rpm: resp,
    source: sourceName,
    date_time: new Date().toISOString(),
    confidence: 0.95,
  };
}
