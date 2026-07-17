import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Plus } from 'lucide-react-native';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { LineChart } from '@/components/ascnd/line-chart';
import { Screen } from '@/components/ascnd/screen';
import { colors, radius, spacing, type } from '@/constants/ascnd';
import { useI18n } from '@/hooks/use-app-settings';
import { useBiometricHistory, type BiometricSample } from '@/hooks/use-biometrics';

type MetricKey = 'hr' | 'hrv' | 'spo2' | 'vo2max' | 'resp';

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

  const metrics: MetricDef[] = [
    { key: 'hr', label: i18n.biometricsHeartRate, unit: 'bpm', color: '#e6486e', range: [50, 100], extract: (s) => s.hr_bpm },
    { key: 'hrv', label: 'HRV', unit: 'ms', color: colors.readinessGreen, range: [20, 100], extract: (s) => s.hrv_rmssd_ms },
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
    <Screen
      title={i18n.biometricsTitle}
      headerRight={
        <Pressable
          hitSlop={8}
          style={({ pressed }) => [styles.logBtn, pressed && styles.pressed]}
          onPress={() => {
            Haptics.selectionAsync();
            router.push('/log-biometrics');
          }}>
          <Icon icon={Plus} size={22} color={colors.primary} />
        </Pressable>
      }>
      {!hasAny ? (
        <GlassCard>
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>{i18n.biometricsNoData}</Text>
            <Text style={styles.emptyMsg}>{i18n.biometricsNoDataMsg}</Text>
            <Pressable
              style={({ pressed }) => [styles.emptyBtn, pressed && styles.pressed]}
              onPress={() => router.push('/log-biometrics')}>
              <Text style={styles.emptyBtnText}>{i18n.biometricsManual}</Text>
            </Pressable>
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
  pressed: { opacity: 0.85, transform: [{ scale: 0.96 }] },
});
