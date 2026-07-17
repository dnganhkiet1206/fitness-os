import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Camera, Medal, Plus, Ruler, Scale, Sparkles, Swords, Target } from 'lucide-react-native';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { LineChart, MultiLineChart } from '@/components/ascnd/line-chart';
import { Screen } from '@/components/ascnd/screen';
import { colors, radius, spacing } from '@/constants/ascnd';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { useBodyMeasurements, useWeightHistory } from '@/hooks/use-fitness-data';
import { useProgressPhotos } from '@/hooks/use-progress-photos';
import { useProfile } from '@/hooks/useTodayData';
import { getLocale } from '@/lib/i18n';

type Tab = 'weight' | 'measurements' | 'photos';

/** BMI category — same thresholds/colours as the web Progress page */
function bmiCategory(v: number, vi: boolean) {
  if (v < 18.5) return { label: vi ? 'Thiếu cân' : 'Underweight', color: colors.metricBlue };
  if (v < 25) return { label: vi ? 'Bình thường' : 'Normal', color: colors.readinessGreen };
  if (v < 30) return { label: vi ? 'Thừa cân' : 'Overweight', color: colors.readinessYellow };
  return { label: vi ? 'Béo phì' : 'Obese', color: colors.readinessRed };
}

export default function ProgressScreen() {
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const vi = lang === 'vi';
  const [tab, setTab] = useState<Tab>('weight');

  const { data: profile } = useProfile();
  const { data: weight } = useWeightHistory(90);
  const { data: photos } = useProgressPhotos();
  const { data: measurements } = useBodyMeasurements();

  const weightData = weight ?? [];
  const currentWeight = weightData.length > 0 ? weightData[weightData.length - 1].value : null;
  const startWeight = weightData.length > 0 ? weightData[0].value : null;
  const weightDelta = currentWeight != null && startWeight != null ? currentWeight - startWeight : null;
  const deltaGood =
    weightDelta != null &&
    ((profile?.goal === 'bulk' && weightDelta > 0) || (profile?.goal === 'cut' && weightDelta < 0));

  const heightM = profile?.height_cm ? Number(profile.height_cm) / 100 : null;
  const bmi = currentWeight != null && heightM ? currentWeight / (heightM * heightM) : null;
  const cat = bmi != null ? bmiCategory(bmi, vi) : null;
  const bmiPct = bmi != null ? Math.max(0, Math.min(100, ((bmi - 15) / 25) * 100)) : 0;

  const tabs: { key: Tab; label: string; icon: typeof Scale }[] = [
    { key: 'weight', label: i18n.progressWeight, icon: Scale },
    { key: 'measurements', label: i18n.progressMeasurements, icon: Ruler },
    { key: 'photos', label: i18n.progressPhotos, icon: Camera },
  ];

  // Real body_measurements column names (the old short keys never matched a column)
  const MEASURES: { k: string; l: string }[] = [
    { k: 'neck_cm', l: i18n.measureNeck }, { k: 'shoulders_cm', l: i18n.measureShoulders },
    { k: 'chest_cm', l: i18n.measureChest }, { k: 'waist_cm', l: i18n.measureWaist },
    { k: 'hips_cm', l: i18n.measureHips }, { k: 'bicep_left_cm', l: i18n.measureBicepL },
    { k: 'bicep_right_cm', l: i18n.measureBicepR }, { k: 'thigh_left_cm', l: i18n.measureThighL },
    { k: 'thigh_right_cm', l: i18n.measureThighR }, { k: 'calf_left_cm', l: i18n.measureCalfL },
    { k: 'calf_right_cm', l: i18n.measureCalfR }, { k: 'body_fat_pct', l: i18n.measureBodyFat },
  ];

  const measurement = measurements && measurements.length > 0 ? measurements[measurements.length - 1] : null;
  // Web history table: last 10 entries, newest first
  const historyRows = (measurements ?? []).slice(-10).reverse();
  const shortLabel = (l: string) => l.replace(/\s*\(.*\)$/, '');
  const HISTORY_COLS: { k: string; l: string }[] = [
    { k: 'waist_cm', l: shortLabel(i18n.measureWaist) },
    { k: 'chest_cm', l: shortLabel(i18n.measureChest) },
    { k: 'bicep_left_cm', l: shortLabel(i18n.measureBicepL) },
    { k: 'thigh_left_cm', l: shortLabel(i18n.measureThighL) },
    { k: 'body_fat_pct', l: 'BF%' },
  ];

  // Web measurement-trend chart: 4 lines on a shared scale, same colours
  const seriesOf = (k: string) =>
    (measurements ?? []).map((row) => {
      const raw = (row as Record<string, unknown>)[k];
      return raw != null ? Number(raw) : null;
    });
  const trendSeries = [
    { label: i18n.measureWaist, color: colors.readinessYellow, values: seriesOf('waist_cm') },
    { label: i18n.measureChest, color: colors.metricBlue, values: seriesOf('chest_cm') },
    { label: i18n.measureBicepL, color: colors.metricPurple, values: seriesOf('bicep_left_cm') },
    { label: i18n.measureThighL, color: colors.metricCyan, values: seriesOf('thigh_left_cm') },
  ];

  return (
    <Screen
      title={i18n.progressTitle}
      headerRight={
        <View style={styles.headerButtons}>
          {[
            { icon: Sparkles, route: '/weekly-review' as const },
            { icon: Target, route: '/smart-goals' as const },
            { icon: Swords, route: '/challenges' as const },
            { icon: Medal, route: '/awards' as const },
          ].map((b) => (
            <Pressable
              key={b.route}
              hitSlop={8}
              style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
              onPress={() => { Haptics.selectionAsync(); router.push(b.route); }}>
              <Icon icon={b.icon} size={17} color={colors.mutedForeground} />
            </Pressable>
          ))}
        </View>
      }>
      {/* Segmented tabs (web TabsList) */}
      <View style={styles.tabBar}>
        {tabs.map((t) => (
          <Pressable
            key={t.key}
            style={[styles.tab, tab === t.key && styles.tabActive]}
            onPress={() => { Haptics.selectionAsync(); setTab(t.key); }}>
            <Icon icon={t.icon} size={13} color={tab === t.key ? colors.foreground : colors.mutedForeground} />
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      {tab === 'weight' && (
        <>
          {/* Stat tiles: current / change / records */}
          <View style={styles.tileRow}>
            {[
              { label: i18n.progressCurrent, value: currentWeight != null ? `${currentWeight}kg` : '—', color: colors.foreground },
              {
                label: i18n.progressChange,
                value: weightDelta != null ? `${weightDelta > 0 ? '+' : ''}${weightDelta.toFixed(1)}kg` : '—',
                color: weightDelta == null ? colors.foreground : deltaGood ? colors.readinessGreen : colors.foreground,
              },
              { label: i18n.progressRecords, value: `${weightData.length}`, color: colors.foreground },
            ].map((c) => (
              <GlassCard key={c.label} style={styles.tile}>
                <Text style={styles.tileLabel}>{c.label}</Text>
                <Text style={[styles.tileValue, { color: c.color }]}>{c.value}</Text>
              </GlassCard>
            ))}
          </View>

          {/* BMI card (web layout: badge, big mono number, 4-zone scale) */}
          <GlassCard style={styles.bmiCard}>
            <View style={styles.bmiHead}>
              <Text style={styles.microTitle}>{vi ? 'Chỉ số BMI' : 'BMI Index'}</Text>
              {cat && (
                <View style={[styles.bmiBadge, { backgroundColor: `${cat.color}1a` }]}>
                  <Text style={[styles.bmiBadgeText, { color: cat.color }]}>{cat.label}</Text>
                </View>
              )}
            </View>
            {bmi != null && cat ? (
              <>
                <View style={styles.bmiValueRow}>
                  <Text style={[styles.bmiValue, { color: cat.color }]}>{bmi.toFixed(1)}</Text>
                  <Text style={styles.bmiUnit}>kg/m²</Text>
                </View>
                <View>
                  <View style={styles.bmiScale}>
                    <View style={[styles.bmiSeg, { flex: 1, backgroundColor: 'rgba(62,134,234,0.4)' }]} />
                    <View style={[styles.bmiSeg, { flex: 2.6, backgroundColor: 'rgba(32,182,132,0.4)' }]} />
                    <View style={[styles.bmiSeg, { flex: 2, backgroundColor: 'rgba(232,186,48,0.4)' }]} />
                    <View style={[styles.bmiSeg, { flex: 4, backgroundColor: 'rgba(220,40,40,0.3)' }]} />
                    <View style={[styles.bmiDot, { left: `${bmiPct}%`, backgroundColor: cat.color }]} />
                  </View>
                  <View style={styles.bmiTicks}>
                    {['15', '18.5', '25', '30', '40'].map((tick) => (
                      <Text key={tick} style={styles.bmiTick}>{tick}</Text>
                    ))}
                  </View>
                </View>
                <Text style={styles.bmiInfo}>
                  {vi ? 'Cân nặng' : 'Weight'}: <Text style={styles.bmiInfoStrong}>{currentWeight}kg</Text>
                  {'  ·  '}
                  {vi ? 'Chiều cao' : 'Height'}: <Text style={styles.bmiInfoStrong}>{profile?.height_cm}cm</Text>
                </Text>
              </>
            ) : (
              <Text style={styles.emptyText}>
                {vi ? 'Cần cân nặng và chiều cao để tính BMI' : 'Weight & height needed to calculate BMI'}
              </Text>
            )}
          </GlassCard>

          {/* Weight chart */}
          <GlassCard style={styles.chartCard}>
            <Text style={styles.microTitle}>{i18n.progressWeightChart}</Text>
            <LineChart points={weightData} color={colors.readinessGreen} height={180} unit="kg" emptyLabel={i18n.nNotEnoughData} />
          </GlassCard>
        </>
      )}

      {tab === 'measurements' && (
        <>
          {/* Web: right-aligned "Add measurement" button opening the input dialog */}
          <Pressable
            style={({ pressed }) => [styles.addBtn, pressed && styles.pressed]}
            onPress={() => { Haptics.selectionAsync(); router.push('/log-measurement'); }}>
            <Icon icon={Plus} size={13} color={colors.primaryForeground} strokeWidth={2.5} />
            <Text style={styles.addBtnText}>{i18n.progressAddMeasurement}</Text>
          </Pressable>

          {/* Web: multi-line measurement trend (waist / chest / bicep / thigh) */}
          {(measurements ?? []).length > 0 && (
            <GlassCard style={styles.chartCard}>
              <Text style={styles.microTitle}>{i18n.progressMeasurementTrend}</Text>
              <MultiLineChart series={trendSeries} height={200} emptyLabel={i18n.nNotEnoughData} />
            </GlassCard>
          )}

          {measurement ? (
            <GlassCard style={styles.chartCard}>
              <Text style={styles.microTitle}>{i18n.progressMeasurements}</Text>
              <View style={styles.measureGrid}>
                {MEASURES.map((m) => {
                  const raw = (measurement as Record<string, unknown>)[m.k];
                  const val = raw != null ? Number(raw) : null;
                  return (
                    <View key={m.k} style={styles.measureCell}>
                      <Text style={styles.measureLabel} numberOfLines={1}>{m.l}</Text>
                      <Text style={styles.measureValue}>{val != null && val > 0 ? val : '—'}</Text>
                    </View>
                  );
                })}
              </View>
            </GlassCard>
          ) : (
            <GlassCard style={styles.chartCard}>
              <Text style={styles.emptyText}>{i18n.progressNoMeasurements}</Text>
            </GlassCard>
          )}

          {/* Web: measurement history table (last 10, newest first) */}
          {historyRows.length > 0 && (
            <GlassCard style={styles.chartCard}>
              <Text style={styles.microTitle}>{i18n.progressMeasurementHistory}</Text>
              <View>
                <View style={[styles.historyRow, styles.historyHead]}>
                  <Text style={[styles.historyHeadText, styles.historyDateCol]}>{i18n.progressDate}</Text>
                  {HISTORY_COLS.map((c) => (
                    <Text key={c.k} style={[styles.historyHeadText, styles.historyCol]} numberOfLines={1}>{c.l}</Text>
                  ))}
                </View>
                {historyRows.map((row) => (
                  <View key={row.id} style={styles.historyRow}>
                    <Text style={[styles.historyDate, styles.historyDateCol]}>
                      {new Date(row.date).toLocaleDateString(getLocale(lang), { day: 'numeric', month: 'short' })}
                    </Text>
                    {HISTORY_COLS.map((c) => {
                      const raw = (row as Record<string, unknown>)[c.k];
                      return (
                        <Text key={c.k} style={[styles.historyValue, styles.historyCol]}>
                          {raw != null ? Number(raw) : '—'}
                        </Text>
                      );
                    })}
                  </View>
                ))}
              </View>
            </GlassCard>
          )}
        </>
      )}

      {tab === 'photos' && (
        <>
          <Pressable
            style={({ pressed }) => [styles.photoCta, pressed && styles.pressed]}
            onPress={() => { Haptics.selectionAsync(); router.push('/progress-photos'); }}>
            <Icon icon={Camera} size={14} color={colors.primaryForeground} />
            <Text style={styles.photoCtaText}>{i18n.nPhotoAdd}</Text>
          </Pressable>
          {photos && photos.length > 0 ? (
            <View style={styles.photoGrid}>
              {photos.slice(0, 12).map((p) => (
                <View key={p.id} style={styles.photoCell}>
                  <Image source={{ uri: p.signedUrl }} style={styles.photo} />
                </View>
              ))}
            </View>
          ) : (
            <GlassCard style={styles.chartCard}>
              <Text style={styles.emptyText}>{i18n.progressNoPhotos}</Text>
            </GlassCard>
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerButtons: { flexDirection: 'row', gap: spacing.sm },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  pressed: { opacity: 0.85, transform: [{ scale: 0.95 }] },

  microTitle: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 2.4,
    color: colors.mutedForeground,
  },

  // Segmented tabs (web TabsList bg-secondary/60)
  tabBar: {
    flexDirection: 'row',
    backgroundColor: 'rgba(24,24,27,0.6)',
    borderRadius: radius.sm,
    padding: 3,
    gap: 3,
  },
  tab: {
    flex: 1,
    height: 34,
    borderRadius: radius.sm - 3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  tabActive: { backgroundColor: colors.accent },
  tabText: { fontSize: 12, fontWeight: '500', color: colors.mutedForeground },
  tabTextActive: { color: colors.foreground },

  // Stat tiles
  tileRow: { flexDirection: 'row', gap: spacing.sm },
  tile: { flex: 1, alignItems: 'center', gap: 3, padding: spacing.sm + 4 },
  tileLabel: { fontSize: 9, textTransform: 'uppercase', letterSpacing: 1.4, color: colors.mutedForeground },
  tileValue: { fontSize: 18, fontFamily: 'Menlo', fontWeight: '700', fontVariant: ['tabular-nums'] },

  // BMI card
  bmiCard: { gap: spacing.md },
  bmiHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bmiBadge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.full },
  bmiBadgeText: { fontSize: 10, fontWeight: '500' },
  bmiValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  bmiValue: { fontSize: 36, fontFamily: 'Menlo', fontWeight: '700', letterSpacing: -0.5, fontVariant: ['tabular-nums'] },
  bmiUnit: { fontSize: 12, color: colors.mutedForeground },
  bmiScale: { height: 8, borderRadius: 4, flexDirection: 'row', overflow: 'visible', backgroundColor: 'rgba(24,24,27,0.4)' },
  bmiSeg: { height: '100%' },
  bmiDot: {
    position: 'absolute',
    top: -3,
    width: 14,
    height: 14,
    borderRadius: 7,
    marginLeft: -7,
    borderWidth: 2,
    borderColor: colors.background,
  },
  bmiTicks: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  bmiTick: { fontSize: 9, fontFamily: 'Menlo', color: colors.mutedForeground },
  bmiInfo: { fontSize: 10, color: colors.mutedForeground },
  bmiInfoStrong: { fontFamily: 'Menlo', color: colors.foreground },

  chartCard: { gap: spacing.md },
  emptyText: { fontSize: 12, color: colors.mutedForeground, textAlign: 'center', paddingVertical: spacing.md, lineHeight: 18 },

  // Measurements
  measureGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  measureCell: {
    width: '31%',
    backgroundColor: 'rgba(24,24,27,0.2)',
    borderRadius: radius.sm,
    padding: spacing.sm + 2,
    gap: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(43,43,49,0.2)',
  },
  measureLabel: { fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.8, color: colors.mutedForeground },
  measureValue: { fontSize: 15, fontFamily: 'Menlo', fontWeight: '600', color: colors.foreground, fontVariant: ['tabular-nums'] },

  // Measurements: add button (web: size-sm rounded-xl, right-aligned)
  addBtn: {
    alignSelf: 'flex-end',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
  },
  addBtnText: { fontSize: 12, fontWeight: '600', color: colors.primaryForeground },

  // Measurement history table
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(43,43,49,0.3)',
  },
  historyHead: { paddingVertical: 8 },
  historyHeadText: { fontSize: 10, fontWeight: '500', color: colors.mutedForeground, textAlign: 'right' },
  historyDateCol: { flex: 1.3, textAlign: 'left' },
  historyCol: { flex: 1 },
  historyDate: { fontSize: 11, color: colors.mutedForeground },
  historyValue: { fontSize: 11, fontFamily: 'Menlo', color: colors.foreground, textAlign: 'right', fontVariant: ['tabular-nums'] },

  // Photos
  photoCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
  },
  photoCtaText: { fontSize: 13, fontWeight: '600', color: colors.primaryForeground },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  photoCell: { width: '31.5%', borderRadius: radius.sm, overflow: 'hidden' },
  photo: { width: '100%', aspectRatio: 0.8, backgroundColor: colors.secondary },
});
