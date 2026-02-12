/**
 * Health Data Integration Service (Web-compatible)
 * 
 * Provides wearable sync abstraction. On native (Capacitor) it uses
 * Apple HealthKit / Health Connect. On web it's a no-op placeholder
 * that returns unavailable — the sync button won't show on web.
 * 
 * Auto-sync: When available, syncs latest data on app open.
 */

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

function isNativePlatform(): boolean {
  try {
    // Check if Capacitor native bridge is available
    return !!(window as any)?.Capacitor?.isNativePlatform?.();
  } catch {
    return false;
  }
}

function getPlatform(): string {
  try {
    return (window as any)?.Capacitor?.getPlatform?.() ?? 'web';
  } catch {
    return 'web';
  }
}

async function getNativePlugin(): Promise<any | null> {
  if (!isNativePlatform()) return null;
  try {
    // Dynamic import only on native — won't execute on web
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore - module only available in native Capacitor builds
    const mod = await (Function('return import("@flomentumsolutions/capacitor-health-extended")')());
    return mod.CapacitorHealth ?? null;
  } catch {
    console.warn('[HealthSync] Native plugin not available');
    return null;
  }
}

export async function isHealthAvailable(): Promise<boolean> {
  const plugin = await getNativePlugin();
  if (!plugin) return false;
  try {
    const { available } = await plugin.isAvailable();
    return available;
  } catch {
    return false;
  }
}

export async function requestHealthPermissions(): Promise<boolean> {
  const plugin = await getNativePlugin();
  if (!plugin) return false;
  try {
    await plugin.requestAuthorization({
      read: ['heartRate', 'heartRateVariabilitySDNN', 'oxygenSaturation', 'vo2Max', 'respiratoryRate'],
    });
    return true;
  } catch (e) {
    console.error('[HealthSync] Permission denied', e);
    return false;
  }
}

async function queryLatest(plugin: any, sampleType: string): Promise<number | null> {
  try {
    const result = await plugin.queryLatestSample({ sampleType });
    return result.value;
  } catch {
    return null;
  }
}

export async function syncLatestBiometrics(): Promise<SyncedBiometrics | null> {
  const plugin = await getNativePlugin();
  if (!plugin) return null;

  const [hr, hrv, spo2, vo2, resp] = await Promise.all([
    queryLatest(plugin, 'heartRate'),
    queryLatest(plugin, 'heartRateVariabilitySDNN'),
    queryLatest(plugin, 'oxygenSaturation'),
    queryLatest(plugin, 'vo2Max'),
    queryLatest(plugin, 'respiratoryRate'),
  ]);

  if (hr == null && hrv == null && spo2 == null && vo2 == null && resp == null) {
    return null;
  }

  const platform = getPlatform();

  return {
    hr_bpm: hr,
    hrv_rmssd_ms: hrv,
    spo2_pct: spo2 != null ? spo2 * 100 : null,
    vo2max_mlkgmin: vo2,
    resp_rate_rpm: resp,
    source: platform === 'ios' ? 'apple_health' : 'health_connect',
    date_time: new Date().toISOString(),
    confidence: 0.95,
  };
}
