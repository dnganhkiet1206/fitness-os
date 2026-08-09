import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Plus } from 'lucide-react-native';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PressScale } from '@/components/ascnd/press-scale';
import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { LineChart } from '@/components/ascnd/line-chart';
import { Screen } from '@/components/ascnd/screen';
import { colors, radius, spacing, type } from '@/constants/ascnd';
import { useI18n } from '@/hooks/use-app-settings';
import { useBiometricHistory, type BiometricSample } from '@/hooks/use-biometrics';

type MetricKey = 'hr' | 'hrvSdnn' | 'hrv' | 'spo2' | 'vo2max' | 'resp';

interface MetricDef {
  key: MetricKey;
  label: string;
  unit: string;
  color: string;
  range: [number, number];
  extract: (s: BiometricSample) => number | null;
}

const STATUS = { good: colors.readinessGreen, warn: colors.readinessYellow, bad: colors.readinessRed };

function statusOf(v: number, [lo, hi]: [number, number]): keyof typeof STATUS {
  if (v >= lo && v <= hi) return 'good';
  const margin = (hi - lo) * 0.15;
  if (v >= lo - margin && v <= hi + margin) return 'warn';
  return 'bad';
}

export default function BiometricsScreen() {
  const i18n = useI18n();
  const { data: history } = useBiometricHistory(14);

  /*
    ── two HRV metrics, and only the ones you actually have ──

    SDNN is what an Apple Watch publishes; RMSSD is what most straps report and
    what the manual entry field asks for. They are different quantities and do
    not convert into each other, so for one person the two series sit at
    different heights — drawn as one line they read as a dramatic swing on the
    days the source changed, which is a story about the device rather than about
    the body.

    Every other card on this screen renders whether or not it has readings and
    shows `—`, which is fine for a metric the app expects and has not seen yet.
    It is not fine here: splitting HRV in two would otherwise hand *everybody* a
    permanently empty second card, and a blank card labelled with a metric you
    have never heard of is worse than the honest bug it replaced.

    So the HRV cards are filtered to the ones with data. Somebody using one
    source sees exactly one HRV card, as before, and never learns there was a
    choice. Before any reading exists at all, RMSSD stands — it is what the
    manual entry screen writes, so it is the one a first reading will land in.
  */
  const hrvKinds = useMemo(() => {
    const hasSdnn = (history ?? []).some((s) => s.hrv_sdnn_ms != null);
    const hasRmssd = (history ?? []).some((s) => s.hrv_rmssd_ms != null);
    if (!hasSdnn && !hasRmssd) return { sdnn: false, rmssd: true };
    return { sdnn: hasSdnn, rmssd: hasRmssd };
  }, [history]);

  const metrics: MetricDef[] = [
    { key: 'hr', label: i18n.biometricsHeartRate, unit: 'bpm', color: '#e6486e', range: [50, 100], extract: (s) => s.hr_bpm },
    ...(hrvKinds.sdnn
      ? [{ key: 'hrvSdnn' as const, label: 'HRV · SDNN', unit: 'ms', color: colors.readinessGreen, range: [20, 100] as [number, number], extract: (s: BiometricSample) => s.hrv_sdnn_ms }]
      : []),
    ...(hrvKinds.rmssd
      ? [{ key: 'hrv' as const, label: hrvKinds.sdnn ? 'HRV · RMSSD' : 'HRV', unit: 'ms', color: colors.metricPurple, range: [20, 100] as [number, number], extract: (s: BiometricSample) => s.hrv_rmssd_ms }]
      : []),
    { key: 'spo2', label: 'SpO₂', unit: '%', color: colors.metricBlue, range: [95, 100], extract: (s) => s.spo2_pct },
    { key: 'vo2max', label: 'VO₂max', unit: 'ml/kg', color: colors.metricOrange, range: [30, 60], extract: (s) => s.vo2max_mlkgmin },
    { key: 'resp', label: i18n.biometricsBreathRate, unit: 'rpm', color: colors.metricPurple, range: [12, 20], extract: (s) => s.resp_rate_rpm },
  ];

  const series = useMemo(() => {
    const map = new Map<MetricKey, { date: string; value: number }[]>();
    for (const m of metrics) {
      const pts = (history ?? [])
        .map((s) => ({ date: s.date_time, value: m.extract(s) }))
        .filter((p): p is { date: string; value: number } => p.value != null);
      map.set(m.key, pts);
    }
    return map;
  }, [history]);

  const hasAny = (history ?? []).length > 0;

  return (
    <Screen back
      title={i18n.biometricsTitle}
      headerRight={
        <PressScale
          accessibilityRole="button"
          accessibilityLabel={i18n.a11yAdd}
          hitSlop={8}
          style={styles.logBtn}
          onPress={() => {
            Haptics.selectionAsync();
            router.push('/log-biometrics');
          }}>
          <Icon icon={Plus} size={22} color={colors.primary} />
        </PressScale>
      }>
      {!hasAny ? (
        <GlassCard>
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>{i18n.biometricsNoData}</Text>
            <Text style={styles.emptyMsg}>{i18n.biometricsNoDataMsg}</Text>
            <PressScale
              style={styles.emptyBtn}
              onPress={() => router.push('/log-biometrics')}>
              <Text style={styles.emptyBtnText}>{i18n.biometricsManual}</Text>
            </PressScale>
          </View>
        </GlassCard>
      ) : (
        metrics.map((m) => {
          const pts = series.get(m.key) ?? [];
          const latest = pts.length > 0 ? pts[pts.length - 1].value : null;
          const st = latest != null ? statusOf(latest, m.range) : null;
          return (
            <GlassCard key={m.key}>
              <View style={styles.metricHead}>
                <View style={styles.metricTitleRow}>
                  {st && <View style={[styles.statusDot, { backgroundColor: STATUS[st] }]} />}
                  <Text style={styles.metricLabel}>{m.label}</Text>
                </View>
                <View style={styles.metricValueRow}>
                  <Text style={[styles.metricValue, { color: m.color }]}>
                    {latest != null ? Math.round(latest * 10) / 10 : '—'}
                  </Text>
                  <Text style={styles.metricUnit}>{m.unit}</Text>
                </View>
              </View>
              {pts.length >= 2 && (
                <View style={styles.chart}>
                  <LineChart points={pts} color={m.color} height={90} unit={m.unit} />
                </View>
              )}
            </GlassCard>
          );
        })
      )}

      <Text style={styles.disclaimer}>{i18n.biometricsDisclaimer1}</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  logBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logBtnText: { fontSize: 22, color: colors.primary, lineHeight: 26 },
  empty: { alignItems: 'center', paddingVertical: spacing.lg, gap: spacing.sm },
  emptyTitle: { ...type.body, color: colors.foreground, fontWeight: '600' },
  emptyMsg: { ...type.footnote, color: colors.mutedForeground, textAlign: 'center' },
  emptyBtn: {
    marginTop: spacing.sm,
    height: 44,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyBtnText: { ...type.headline, color: colors.primaryForeground },
  metricHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  metricTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  metricLabel: { ...type.headline, color: colors.foreground },
  metricValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  metricValue: { ...type.title, ...type.mono },
  metricUnit: { ...type.footnote, color: colors.mutedForeground },
  chart: { marginTop: spacing.sm },
  disclaimer: { ...type.caption, color: colors.mutedForeground, textAlign: 'center', marginTop: spacing.xs, lineHeight: 16 },
});
