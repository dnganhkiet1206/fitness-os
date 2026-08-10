import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Plus, Trash2 } from 'lucide-react-native';
import { useMemo } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { PressScale } from '@/components/ascnd/press-scale';
import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { LineChart } from '@/components/ascnd/line-chart';
import { Screen } from '@/components/ascnd/screen';
import { colors, radius, spacing, type } from '@/constants/ascnd';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { useBiometricHistory, useDeleteBiometricSample, type BiometricSample } from '@/hooks/use-biometrics';

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
  const { lang } = useAppSettings();
  const vi = lang === 'vi';
  const remove = useDeleteBiometricSample();

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

  /* The query orders oldest-first so the charts draw left to right; the list
     wants the opposite. A copy, because the array belongs to react-query's
     cache and reversing it in place would flip every chart on the screen. */
  const rows = useMemo(() => [...(history ?? [])].reverse(), [history]);

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

      {/*
        The readings themselves, and the way to take one back.

        ── why a list had to exist before a delete could ──

        This screen drew charts and nothing else, so a mistyped reading was
        permanent. That is not a cosmetic gap: HRV is the largest term in the
        readiness score and it is scored against a 28-day baseline, so entering
        450 where 45 was meant drags the app's headline number for four weeks —
        and because the score still lands between 0 and 100, nothing on any
        screen looks wrong. The person just quietly stops recognising themselves
        in it.

        Newest first, because the reading somebody wants to undo is almost
        always the one they just entered.
      */}
      {rows.length > 0 ? (
        <View style={styles.logSection}>
          <Text style={styles.logTitle}>{vi ? 'Các lần đo' : 'Readings'}</Text>
          {rows.map((s) => (
            <GlassCard key={s.id} style={styles.logRow}>
              <View style={styles.logBody}>
                <Text style={styles.logWhen}>{s.date_time.replace('T', ' ').slice(0, 16)}</Text>
                <Text style={styles.logVals} numberOfLines={1}>
                  {summarise(s, vi)}
                </Text>
              </View>
              <PressScale
                accessibilityRole="button"
                accessibilityLabel={vi ? 'Xoá lần đo này' : 'Delete this reading'}
                hitSlop={8}
                style={styles.logDelete}
                disabled={remove.isPending}
                onPress={() => {
                  Haptics.selectionAsync();
                  Alert.alert(
                    vi ? 'Xoá lần đo này?' : 'Delete this reading?',
                    vi
                      ? 'Điểm sẵn sàng của ngày đó và của hôm nay sẽ được tính lại.'
                      : "That day's readiness and today's will be recomputed.",
                    [
                      { text: vi ? 'Huỷ' : 'Cancel', style: 'cancel' },
                      {
                        text: vi ? 'Xoá' : 'Delete',
                        style: 'destructive',
                        onPress: () => remove.mutate({ id: s.id, date_time: s.date_time }),
                      },
                    ],
                  );
                }}>
                <Icon icon={Trash2} size={16} color={colors.mutedForeground} />
              </PressScale>
            </GlassCard>
          ))}
        </View>
      ) : null}

      <Text style={styles.disclaimer}>{i18n.biometricsDisclaimer1}</Text>
    </Screen>
  );
}

/** One reading, in one line, showing only what was actually measured. */
function summarise(s: BiometricSample, vi: boolean): string {
  const bits: string[] = [];
  if (s.hr_bpm != null) bits.push(`${vi ? 'Nhịp nghỉ' : 'RHR'} ${s.hr_bpm}`);
  if (s.hrv_sdnn_ms != null) bits.push(`SDNN ${s.hrv_sdnn_ms}ms`);
  if (s.hrv_rmssd_ms != null) bits.push(`RMSSD ${s.hrv_rmssd_ms}ms`);
  if (s.spo2_pct != null) bits.push(`SpO₂ ${s.spo2_pct}%`);
  if (s.resp_rate_rpm != null) bits.push(`${vi ? 'Thở' : 'Resp'} ${s.resp_rate_rpm}`);
  if (s.vo2max_mlkgmin != null) bits.push(`VO₂max ${s.vo2max_mlkgmin}`);
  return bits.join(' · ') || (vi ? 'Không có giá trị' : 'No values');
}

const styles = StyleSheet.create({
  logSection: { gap: spacing.sm, marginTop: spacing.xs },
  logTitle: {
    ...type.caption,
    color: colors.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 1.6,
  },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  logBody: { flex: 1, gap: 2 },
  logWhen: { ...type.footnote, color: colors.foreground },
  logVals: { ...type.caption, color: colors.mutedForeground },
  logDelete: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
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
