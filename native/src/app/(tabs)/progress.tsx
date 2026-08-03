import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Camera, ChevronRight, Medal, Plus, Ruler, Scale, Sparkles, Swords, Target } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { LineChart, MultiLineChart } from '@/components/ascnd/line-chart';
import { Screen } from '@/components/ascnd/screen';
import { WeightChanges } from '@/components/ascnd/weight-changes';
import { WeightGoalDialog } from '@/components/ascnd/weight-goal-dialog';
import { colors, radius, spacing } from '@/constants/ascnd';
import { rise } from '@/lib/entrance';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { useBodyMeasurements, useWeightHistory } from '@/hooks/use-fitness-data';
import { useProgressPhotos } from '@/hooks/use-progress-photos';
import { useUnits } from '@/hooks/use-units';
import { useProfile } from '@/hooks/useTodayData';
import { useWeightGoal } from '@/hooks/use-weight-goal';
import { getLocale } from '@/lib/i18n';
import { parseLocalDate } from '@/lib/local-date';
import { convertLength, displayLength, displayWeight, formatHeight, weightLabel } from '@/lib/units';
import { LoadFailed } from '@/components/ascnd/load-failed';
import { WeightLogList } from '@/components/ascnd/weight-log-list';

type Tab = 'weight' | 'measurements' | 'photos';

/**
 * The BMI scale, in one place.
 *
 * Thresholds and colours are the WHO bands the web Progress page already used.
 * They now live in a single table because four things have to agree about them
 * — the badge, the number's category, the widths of the coloured bar, and the
 * legend under it — and four hand-written copies is how they drift apart.
 *
 * `to` is the upper bound of the band. `BMI_MIN`/`BMI_MAX` are only the ends of
 * the drawn bar, not medical limits: a BMI of 12 or 55 still reads Underweight
 * or Obese, its dot just parks at the end of the track.
 *
 * ── why the widths are computed ──
 *
 * Each segment's flex is its own width *in BMI units*, so the bar is a linear
 * ruler from 15 to 40 and the marker — placed at `(bmi − 15) / 25` — lands
 * exactly on a band's edge when the BMI is on that edge. The old code hard-coded
 * `flex: 1` for the first band where the maths wanted 3.5/2.5 = 1.4, which made
 * the 18.5 boundary sit ~3.6% left of where the dot crossed it: a BMI of 18.4
 * could be drawn inside the green. Deriving the widths makes that class of
 * mismatch impossible.
 */
const BMI_MIN = 15;
const BMI_MAX = 40;

const BMI_ZONES = [
  {
    to: 18.5,
    vi: 'Thiếu cân',
    en: 'Underweight',
    range: '< 18.5',
    color: colors.metricBlue,
    fill: 'rgba(59,166,255,0.4)',
  },
  {
    to: 25,
    vi: 'Bình thường',
    en: 'Normal',
    range: '18.5 – 24.9',
    color: colors.readinessGreen,
    fill: 'rgba(43,245,168,0.4)',
  },
  {
    to: 30,
    vi: 'Thừa cân',
    en: 'Overweight',
    range: '25 – 29.9',
    color: colors.readinessYellow,
    fill: 'rgba(255,217,61,0.4)',
  },
  {
    to: BMI_MAX,
    vi: 'Béo phì',
    en: 'Obese',
    range: '≥ 30',
    color: colors.readinessRed,
    fill: 'rgba(255,59,92,0.3)',
  },
] as const;

/** How wide each band is on the 15–40 track, in BMI units */
const zoneSpan = (i: number) => BMI_ZONES[i].to - (i === 0 ? BMI_MIN : BMI_ZONES[i - 1].to);

/** Where a BMI sits along the track, 0–100 — clamped at both ends */
const bmiPos = (v: number) => Math.max(0, Math.min(100, ((v - BMI_MIN) / (BMI_MAX - BMI_MIN)) * 100));

/** Which band a BMI falls in. The last one is open-ended, so it has no test. */
function bmiZoneIndex(v: number) {
  for (let i = 0; i < BMI_ZONES.length - 1; i++) if (v < BMI_ZONES[i].to) return i;
  return BMI_ZONES.length - 1;
}

function bmiCategory(v: number, vi: boolean) {
  const z = BMI_ZONES[bmiZoneIndex(v)];
  return { label: vi ? z.vi : z.en, color: z.color };
}

export default function ProgressScreen() {
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const vi = lang === 'vi';
  const [tab, setTab] = useState<Tab>('weight');
  const [goalOpen, setGoalOpen] = useState(false);

  const { data: profile } = useProfile();

  /**
   * One retry for the tab, as on Nutrition.
   *
   * Every segment here reads through the same connection, so repairing only the
   * query that raised its hand would fix a corner of the page. This is the
   * pull-to-refresh gesture as a button — one behaviour to learn, not two.
   */
  const queryClient = useQueryClient();
  const [retrying, setRetrying] = useState(false);
  const retry = useCallback(async () => {
    setRetrying(true);
    await queryClient.invalidateQueries();
    setRetrying(false);
  }, [queryClient]);
  const { data: weight, isError: weightFailed } = useWeightHistory(90);
  /**
   * Every weigh-in, for the changes card's "All Time" row and its 90-day one.
   *
   * A separate query from the chart's 90 days rather than widening that one:
   * the chart is a 90-day chart by design, and ten years of points would both
   * change what it shows and cost more to draw. Cached under its own key.
   */
  const { data: weightAll } = useWeightHistory(3650);
  const { data: photos, isError: photosFailed } = useProgressPhotos();
  const { data: measurements, isError: measurementsFailed } = useBodyMeasurements();

  const { weight: wUnit, height: lHUnit } = useUnits();
  const wl = weightLabel(wUnit);
  // Stored kg; chart + tiles show the user's unit (BMI stays metric)
  const weightData = (weight ?? []).map((d) => ({ ...d, value: displayWeight(d.value, wUnit) }));
  const allWeight = (weightAll ?? []).map((d) => ({ ...d, value: displayWeight(d.value, wUnit) }));
  const currentWeight = weightData.length > 0 ? weightData[weightData.length - 1].value : null;
  const startWeight = weightData.length > 0 ? weightData[0].value : null;
  const weightDelta = currentWeight != null && startWeight != null ? currentWeight - startWeight : null;
  const deltaGood =
    weightDelta != null &&
    ((profile?.goal === 'bulk' && weightDelta > 0) || (profile?.goal === 'cut' && weightDelta < 0));

  const currentKg = (weight ?? []).length > 0 ? (weight ?? [])[(weight ?? []).length - 1].value : null;

  /**
   * Target weight — stored in kg, shown in whatever unit the chart is in.
   * The sheet does the reverse conversion when it saves.
   */
  const { goalKg, setGoalKg } = useWeightGoal();
  const goalDisplay = goalKg != null ? displayWeight(goalKg, wUnit) : null;
  const heightM = profile?.height_cm ? Number(profile.height_cm) / 100 : null;
  const bmi = currentKg != null && heightM ? currentKg / (heightM * heightM) : null;
  const cat = bmi != null ? bmiCategory(bmi, vi) : null;
  const bmiZone = bmi != null ? bmiZoneIndex(bmi) : -1;
  const bmiPct = bmi != null ? bmiPos(bmi) : 0;

  const tabs: { key: Tab; label: string; icon: typeof Scale }[] = [
    { key: 'weight', label: i18n.progressWeight, icon: Scale },
    { key: 'measurements', label: i18n.progressMeasurements, icon: Ruler },
    { key: 'photos', label: i18n.progressPhotos, icon: Camera },
  ];

  // Circumference labels carry "(cm)"; swap to the user's length unit.
  // A measurement value in the display unit (cm columns convert; % stays).
  const lbl = (s: string) => (lHUnit === 'in' ? s.replace('(cm)', '(in)') : s);
  const mval = (k: string, cm: number) => (k === 'body_fat_pct' ? cm : displayLength(cm, lHUnit));

  // Real body_measurements column names (the old short keys never matched a column)
  const MEASURES: { k: string; l: string }[] = [
    { k: 'neck_cm', l: lbl(i18n.measureNeck) }, { k: 'shoulders_cm', l: lbl(i18n.measureShoulders) },
    { k: 'chest_cm', l: lbl(i18n.measureChest) }, { k: 'waist_cm', l: lbl(i18n.measureWaist) },
    { k: 'hips_cm', l: lbl(i18n.measureHips) }, { k: 'bicep_left_cm', l: lbl(i18n.measureBicepL) },
    { k: 'bicep_right_cm', l: lbl(i18n.measureBicepR) }, { k: 'thigh_left_cm', l: lbl(i18n.measureThighL) },
    { k: 'thigh_right_cm', l: lbl(i18n.measureThighR) }, { k: 'calf_left_cm', l: lbl(i18n.measureCalfL) },
    { k: 'calf_right_cm', l: lbl(i18n.measureCalfR) }, { k: 'body_fat_pct', l: i18n.measureBodyFat },
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

  // Web measurement-trend chart: 4 lines on a shared scale, same colours.
  // All series here are circumference (_cm) → convert to the display unit.
  const seriesOf = (k: string) =>
    (measurements ?? []).map((row) => {
      const raw = (row as Record<string, unknown>)[k];
      return raw != null ? convertLength(Number(raw), lHUnit) : null;
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
            { icon: Sparkles, route: '/weekly-review' as const, label: i18n.nWeeklyReview },
            { icon: Target, route: '/smart-goals' as const, label: i18n.navSmartGoals },
            { icon: Swords, route: '/challenges' as const, label: i18n.nChallenges },
            { icon: Medal, route: '/awards' as const, label: i18n.nAwards },
          ].map((b) => (
            <Pressable
              key={b.route}
              accessibilityRole="button"
              accessibilityLabel={b.label}
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

      {/*
        `—` and `0 records` and "not enough data" are all true of an account
        with no weights in it, and all false of one the app could not read.
        The reading is the same either way, and the thing a person does about
        it — go and log a weight they already logged — is wrong in one case.
      */}
      {tab === 'weight' && weightFailed && (
        <LoadFailed i18n={i18n} onRetry={retry} busy={retrying} />
      )}
      {tab === 'weight' && !weightFailed && (
        <>
          {/* Stat tiles: current / change / records */}
          <Animated.View style={styles.tileRow} entering={rise(0)}>
            {[
              { label: i18n.progressCurrent, value: currentWeight != null ? `${currentWeight}${wl}` : '—', color: colors.foreground },
              {
                label: i18n.progressChange,
                value: weightDelta != null ? `${weightDelta > 0 ? '+' : ''}${weightDelta.toFixed(1)}${wl}` : '—',
                color: weightDelta == null ? colors.foreground : deltaGood ? colors.readinessGreen : colors.foreground,
              },
              { label: i18n.progressRecords, value: `${weightData.length}`, color: colors.foreground },
            ].map((c) => (
              <GlassCard key={c.label} style={styles.tile}>
                <Text style={styles.tileLabel}>{c.label}</Text>
                <Text style={[styles.tileValue, { color: c.color }]}>{c.value}</Text>
              </GlassCard>
            ))}
          </Animated.View>

          {/* BMI card (web layout: badge, big mono number, 4-zone scale) */}
          <Animated.View entering={rise(1)}>
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
                {/* The number stays white so it reads as a measurement; the
                    badge, the marker and the legend carry the colour. */}
                <View style={styles.bmiValueRow}>
                  <Text style={styles.bmiValue}>{bmi.toFixed(1)}</Text>
                  <Text style={styles.bmiUnit}>kg/m²</Text>
                </View>
                <View>
                  <View style={styles.bmiScale}>
                    {BMI_ZONES.map((z, i) => (
                      <View key={z.en} style={[styles.bmiSeg, { flex: zoneSpan(i), backgroundColor: z.fill }]} />
                    ))}
                    <View style={[styles.bmiDot, { left: `${bmiPct}%`, backgroundColor: cat.color }]} />
                  </View>
                  {/* Boundary numbers sit at the boundaries — each one is placed
                      at its own position on the track, not spread evenly. */}
                  <View style={styles.bmiTicks}>
                    {[BMI_MIN, ...BMI_ZONES.map((z) => z.to)].map((tick, i, arr) => (
                      <Text
                        key={tick}
                        style={[
                          styles.bmiTick,
                          { left: `${bmiPos(tick)}%` },
                          i === 0 && styles.bmiTickFirst,
                          i === arr.length - 1 && styles.bmiTickLast,
                        ]}>
                        {tick}
                      </Text>
                    ))}
                  </View>
                </View>

                {/* What each colour on the bar actually means, with its range —
                    the bar alone never said where one band ends. */}
                <View style={styles.bmiLegend}>
                  {BMI_ZONES.map((z, i) => {
                    const on = i === bmiZone;
                    return (
                      <View key={z.en} style={styles.legendRow}>
                        <View style={[styles.legendDot, { backgroundColor: z.color, opacity: on ? 1 : 0.55 }]} />
                        <Text style={[styles.legendName, on && styles.legendNameOn]} numberOfLines={1}>
                          {vi ? z.vi : z.en}
                        </Text>
                        <Text style={[styles.legendRange, on && styles.legendRangeOn]}>{z.range}</Text>
                      </View>
                    );
                  })}
                </View>
                <Text style={styles.bmiInfo}>
                  {vi ? 'Cân nặng' : 'Weight'}: <Text style={styles.bmiInfoStrong}>{currentWeight}{wl}</Text>
                  {'  ·  '}
                  {vi ? 'Chiều cao' : 'Height'}:{' '}
                  <Text style={styles.bmiInfoStrong}>
                    {profile?.height_cm != null ? formatHeight(Number(profile.height_cm), lHUnit) : '—'}
                  </Text>
                </Text>
              </>
            ) : (
              <Text style={styles.emptyText}>
                {vi ? 'Cần cân nặng và chiều cao để tính BMI' : 'Weight & height needed to calculate BMI'}
              </Text>
            )}
          </GlassCard>
          </Animated.View>

          {/* Weight chart, with the target drawn across it */}
          <Animated.View entering={rise(2)}>
          <GlassCard style={styles.chartCard}>
            <View style={styles.chartHead}>
              <Text style={styles.microTitle}>{i18n.progressWeightChart}</Text>
              {/* How far off the target is, in the same unit as the chart.
                  Only shown once there is both a target and a weight to
                  compare it against — otherwise there is nothing to say. */}
              {goalDisplay != null && currentWeight != null ? (
                <Text style={styles.goalToGo}>
                  {Math.abs(currentWeight - goalDisplay) < 0.05
                    ? i18n.nWeightGoalReached
                    : i18n.nWeightGoalToGo.replace(
                        '{x}',
                        `${Math.abs(currentWeight - goalDisplay).toFixed(1)}${wl}`,
                      )}
                </Text>
              ) : null}
            </View>
            <LineChart
              points={weightData}
              color={colors.readinessGreen}
              height={180}
              unit={wl}
              emptyLabel={i18n.nNotEnoughData}
              goal={goalDisplay}
              goalLabel={i18n.nWeightGoal}
            />
            {/*
              One button, one sheet. The row used to be a stepper; a target
              weight is a number people arrive already knowing, and stepping
              to it from the current weight is a lot of taps for something
              they could type.
            */}
            <Pressable
              style={({ pressed }) => [styles.goalRow, pressed && styles.pressed]}
              onPress={() => {
                Haptics.selectionAsync();
                setGoalOpen(true);
              }}>
              <Icon icon={Target} size={14} color={colors.primary} />
              <Text style={styles.goalLabel}>{i18n.nWeightGoalTitle}</Text>
              <Text style={goalDisplay == null ? styles.goalUnset : styles.goalValue}>
                {goalDisplay == null
                  ? i18n.nWeightGoalSet
                  : `${goalDisplay.toFixed(1)}${wl}`}
              </Text>
              <Icon icon={ChevronRight} size={15} color={colors.mutedForeground} />
            </Pressable>
          </GlassCard>
          </Animated.View>

          <WeightGoalDialog
            visible={goalOpen}
            goalKg={goalKg}
            currentKg={currentKg}
            unit={wUnit}
            i18n={i18n}
            onSave={setGoalKg}
            onClose={() => setGoalOpen(false)}
          />

          {/* The chart says what shape the trend is; this says whether you are
              up or down over each window, which is what people weigh
              themselves to find out. */}
          <Animated.View entering={rise(3)}>
            <WeightChanges points={allWeight} unit={wl} goal={profile?.goal} i18n={i18n} />
          </Animated.View>

          {/*
            The numbers behind the line, and the only way to remove one.
            `useLogWeight` upserts on (user_id, date), so today can be corrected
            by logging again — no earlier day can, and a wrong one sets the
            chart's scale and the BMI band for every day around it.

            Already in the display unit: `weightData` converts once above, and
            converting again here is how two figures on one screen come to
            disagree by a rounding step.
          */}
          <Animated.View entering={rise(4)}>
            <WeightLogList points={weightData} unit={wl} i18n={i18n} lang={lang} />
          </Animated.View>
        </>
      )}

      {tab === 'measurements' && measurementsFailed && (
        <LoadFailed i18n={i18n} onRetry={retry} busy={retrying} />
      )}
      {tab === 'measurements' && !measurementsFailed && (
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
            <Animated.View entering={rise(0)}>
            <GlassCard style={styles.chartCard}>
              <Text style={styles.microTitle}>{i18n.progressMeasurementTrend}</Text>
              <MultiLineChart series={trendSeries} height={200} emptyLabel={i18n.nNotEnoughData} />
            </GlassCard>
            </Animated.View>
          )}

          {measurement ? (
            <Animated.View entering={rise(1)}>
            <GlassCard style={styles.chartCard}>
              <Text style={styles.microTitle}>{i18n.progressMeasurements}</Text>
              <View style={styles.measureGrid}>
                {MEASURES.map((m) => {
                  const raw = (measurement as Record<string, unknown>)[m.k];
                  const val = raw != null ? mval(m.k, Number(raw)) : null;
                  return (
                    <View key={m.k} style={styles.measureCell}>
                      <Text style={styles.measureLabel} numberOfLines={1}>{m.l}</Text>
                      <Text style={styles.measureValue}>{val != null && val > 0 ? val : '—'}</Text>
                    </View>
                  );
                })}
              </View>
            </GlassCard>
            </Animated.View>
          ) : (
            <Animated.View entering={rise(1)}>
            <GlassCard style={styles.chartCard}>
              <Text style={styles.emptyText}>{i18n.progressNoMeasurements}</Text>
            </GlassCard>
            </Animated.View>
          )}

          {/* Web: measurement history table (last 10, newest first) */}
          {historyRows.length > 0 && (
            <Animated.View entering={rise(2)}>
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
                      {parseLocalDate(row.date).toLocaleDateString(getLocale(lang), { day: 'numeric', month: 'short' })}
                    </Text>
                    {HISTORY_COLS.map((c) => {
                      const raw = (row as Record<string, unknown>)[c.k];
                      return (
                        <Text key={c.k} style={[styles.historyValue, styles.historyCol]}>
                          {raw != null ? mval(c.k, Number(raw)) : '—'}
                        </Text>
                      );
                    })}
                  </View>
                ))}
              </View>
            </GlassCard>
            </Animated.View>
          )}
        </>
      )}

      {tab === 'photos' && photosFailed && (
        <LoadFailed i18n={i18n} onRetry={retry} busy={retrying} />
      )}
      {tab === 'photos' && !photosFailed && (
        <>
          <Pressable
            style={({ pressed }) => [styles.photoCta, pressed && styles.pressed]}
            onPress={() => { Haptics.selectionAsync(); router.push('/progress-photos'); }}>
            <Icon icon={Camera} size={14} color={colors.primaryForeground} />
            <Text style={styles.photoCtaText}>{i18n.nPhotoAdd}</Text>
          </Pressable>
          {photos && photos.length > 0 ? (
            <Animated.View style={styles.photoGrid} entering={rise(0)}>
              {photos.slice(0, 12).map((p) => (
                <View key={p.id} style={styles.photoCell}>
                  <Image source={{ uri: p.signedUrl }} style={styles.photo} />
                </View>
              ))}
            </Animated.View>
          ) : (
            <Animated.View entering={rise(0)}>
            <GlassCard style={styles.chartCard}>
              <Text style={styles.emptyText}>{i18n.progressNoPhotos}</Text>
            </GlassCard>
            </Animated.View>
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

  // Weight-chart goal
  chartHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  goalToGo: { fontSize: 11, color: colors.mutedForeground, fontVariant: ['tabular-nums'] },
  goalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md - 4,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: 'rgba(24,24,27,0.3)',
  },
  goalLabel: { flex: 1, fontSize: 13, color: colors.foreground },
  goalValue: { fontSize: 13, fontWeight: '700', color: colors.foreground, fontVariant: ['tabular-nums'] },
  goalUnset: { fontSize: 12, fontWeight: '600', color: colors.primary },

  // BMI card
  bmiCard: { gap: spacing.md },
  bmiHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bmiBadge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.full },
  bmiBadgeText: { fontSize: 10, fontWeight: '500' },
  bmiValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  bmiValue: {
    fontSize: 36,
    fontFamily: 'Menlo',
    fontWeight: '700',
    letterSpacing: -0.5,
    color: colors.foreground,
    fontVariant: ['tabular-nums'],
  },
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
  // Ticks are absolutely placed at their own BMI position on the 15–40 track.
  // The box is a fixed 36 wide, pulled back half its width so the text centres
  // on the boundary; the two ends anchor flush instead so they cannot clip.
  bmiTicks: { height: 13, marginTop: 6 },
  bmiTick: {
    position: 'absolute',
    width: 36,
    marginLeft: -18,
    textAlign: 'center',
    fontSize: 9,
    fontFamily: 'Menlo',
    color: colors.mutedForeground,
  },
  bmiTickFirst: { marginLeft: 0, textAlign: 'left' },
  bmiTickLast: { marginLeft: -36, textAlign: 'right' },

  // Legend: colour, band name, and the range it covers
  bmiLegend: { gap: 5 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendName: { flex: 1, fontSize: 11, color: colors.mutedForeground },
  legendNameOn: { color: colors.foreground, fontWeight: '600' },
  legendRange: {
    fontSize: 11,
    fontFamily: 'Menlo',
    color: colors.mutedForeground,
    fontVariant: ['tabular-nums'],
  },
  legendRangeOn: { color: colors.foreground },
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
