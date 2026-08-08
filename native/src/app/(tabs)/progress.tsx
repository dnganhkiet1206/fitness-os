import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Camera, ChevronRight, Medal, Plus, Ruler, Scale, Sparkles, Swords, Target } from 'lucide-react-native';
import { useCallback, useEffect, useId, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { PressScale } from '@/components/ascnd/press-scale';
import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { LineChart, MultiLineChart } from '@/components/ascnd/line-chart';
import { Screen } from '@/components/ascnd/screen';
import { WeightChanges } from '@/components/ascnd/weight-changes';
import { WeightGoalDialog } from '@/components/ascnd/weight-goal-dialog';
import { colors, radius, spacing, type } from '@/constants/ascnd';
import { duration } from '@/constants/motion';
import { rise } from '@/lib/entrance';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { useBodyMeasurements, useWeightHistory } from '@/hooks/use-fitness-data';
import { useProgressPhotos } from '@/hooks/use-progress-photos';
import { useUnits } from '@/hooks/use-units';
import { useProfile } from '@/hooks/useTodayData';
import { useWeightGoal } from '@/hooks/use-weight-goal';
import { getLocale } from '@/lib/i18n';
import { localDaysAgoStr, parseLocalDate } from '@/lib/local-date';
import { convertLength, displayLength, displayWeight, formatHeight, weightLabel } from '@/lib/units';
import { LoadFailed } from '@/components/ascnd/load-failed';
import { WeightLogList } from '@/components/ascnd/weight-log-list';

type Tab = 'weight' | 'measurements' | 'photos';

/**
 * How far back the weight chart reaches.
 *
 * Week, month, year, everything. No "day" segment: a day holds at most one
 * weigh-in, so it would draw a single point and the chart would say there is
 * not enough data — an option that can only ever disappoint is worse than no
 * option.
 *
 * `days: null` means all of it, which is whatever `useWeightHistory(3650)`
 * returned; ten years is the practical limit of the query, not a claim.
 */
const RANGES = [
  { key: 'week', days: 7, label: 'nRangeWeek' },
  { key: 'month', days: 30, label: 'nRangeMonth' },
  { key: 'year', days: 365, label: 'nRangeYear' },
  { key: 'all', days: null, label: 'nRangeAll' },
] as const;

type RangeKey = (typeof RANGES)[number]['key'];

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
 * ── every position on the bar is derived, never written down ──
 *
 * The bar is a linear ruler from 15 to 40, so a colour boundary, a tick and the
 * marker all come out of `bmiPos`. The first version hard-coded `flex: 1` for
 * the opening band where the maths wanted 3.5/2.5 = 1.4, which put the 18.5
 * boundary ~3.6% left of where the dot crossed it — a BMI of 18.4 could be drawn
 * inside the green. One source for the geometry makes that impossible rather
 * than merely fixed.
 */
const BMI_MIN = 15;
const BMI_MAX = 40;

/**
 * The four bands, and why each one has its own opacity.
 *
 * They used to share 0.4 — except red, which was 0.3 for no recorded reason.
 * Equal alpha is not equal weight. Composited over `#070708` and measured as
 * WCAG relative luminance, the four came out:
 *
 *   blue 0.0576   green 0.1017   yellow 0.1065   red 0.0248
 *
 * a spread of **4.3×**. Yellow and green shouted, red all but disappeared, and
 * the bar read as four unrelated blocks because that is what it was. Nothing
 * about it was a decision; it was four numbers chosen one at a time.
 *
 * The opacities below are solved, not picked: each is the alpha that lands its
 * colour on a luminance of 0.085 over this background, so the spread is now
 * 1.05×. The bar reads as one object whose hue changes along it, which is what
 * a scale is.
 *
 * To re-check after any change to these or to `background`:
 *
 *     node -e "
 *     const hex=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
 *     const lin=c=>{c/=255;return c<=0.03928?c/12.92:((c+0.055)/1.055)**2.4};
 *     const L=([r,g,b])=>0.2126*lin(r)+0.7152*lin(g)+0.0722*lin(b);
 *     const bg=hex('#070708');
 *     for (const [c,a] of [['#3ba6ff',.49],['#2bf5a8',.36],['#ffd93d',.36],['#ff3b5c',.59]])
 *       console.log(c, L(hex(c).map((v,i)=>v*a+bg[i]*(1-a))).toFixed(4));"
 *
 * `color` is the full-strength hue and is unchanged — it carries the badge, the
 * marker and the legend dot, where it sits on its own and needs no help.
 */
const BMI_ZONES = [
  {
    to: 18.5,
    vi: 'Thiếu cân',
    en: 'Underweight',
    range: '< 18.5',
    color: colors.metricBlue,
    alpha: 0.49,
  },
  {
    to: 25,
    vi: 'Lành mạnh',
    en: 'Healthy',
    range: '18.5 – 24.9',
    color: colors.readinessGreen,
    alpha: 0.36,
  },
  {
    to: 30,
    vi: 'Thừa cân',
    en: 'Overweight',
    range: '25 – 29.9',
    color: colors.readinessYellow,
    alpha: 0.36,
  },
  {
    to: BMI_MAX,
    vi: 'Béo phì',
    en: 'Obese',
    range: '≥ 30',
    color: colors.readinessRed,
    alpha: 0.59,
  },
] as const;

/**
 * How far either side of a boundary the two colours blend, in BMI units.
 *
 * Zero would keep the four hard edges the bar had, which is honest and looks
 * like four buttons. A wide blend would be prettier and would smear where
 * "overweight" begins across two whole points of BMI.
 *
 * 0.9 leaves every band solid across most of its width — the narrowest,
 * underweight at 15–18.5, stays one flat colour for 74% of itself — while the
 * bar stops looking assembled. The thresholds themselves are not softened
 * anywhere it matters: the tick numbers, the legend ranges and the marker are
 * all still placed at the exact boundary.
 */
const BMI_BLEND = 0.9;
const BMI_BAR_H = 8;

/**
 * The gradient stops, built from the same `bmiPos` the ticks and the marker use.
 *
 * Not from hard-coded percentages. That is the mistake the note above records:
 * four segments at 25% each put the 18.5 boundary 3.6% left of where the dot
 * crossed it, so a BMI of 18.4 sat in the wrong colour. Deriving the stops from
 * `bmiPos` means the colour changes where the number says it does, and no later
 * edit to `BMI_MIN`/`BMI_MAX` can pull the two apart.
 *
 * Each band contributes two stops — one just inside each of its edges — and SVG
 * interpolates across the `2 × BMI_BLEND` gap between neighbours.
 */
function bmiStops() {
  const out: { at: number; color: string; alpha: number }[] = [];
  BMI_ZONES.forEach((z, i) => {
    const lo = i === 0 ? BMI_MIN : BMI_ZONES[i - 1].to;
    // The outer two edges are the ends of the track, so nothing is blended past
    // them — a bar that fades out at its own tips reads as unfinished.
    const from = i === 0 ? lo : lo + BMI_BLEND;
    const to = i === BMI_ZONES.length - 1 ? z.to : z.to - BMI_BLEND;
    out.push({ at: bmiPos(from), color: z.color, alpha: z.alpha });
    out.push({ at: bmiPos(to), color: z.color, alpha: z.alpha });
  });
  return out;
}

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

  /*
    The chart's own window, filtered from the full history rather than fetched.

    `weightData` stays the 90-day series every other number on this tab is
    defined against — the records count, the start weight, the log list. Moving
    those with the chart's range would mean "Start" changing meaning depending
    on which button was last pressed.
  */
  const [range, setRange] = useState<RangeKey>('all');

  /*
    The page holds still while the chart is being scrubbed.

    It cannot be done inside the chart. On iOS a ScrollView pans with a native
    gesture recogniser that never asks the JS responder system for permission,
    so a child refusing to yield the responder stops other JS responders and
    nothing else — the page kept scrolling out from under the reading.
  */
  const [scrubbing, setScrubbing] = useState(false);

  /*
    The sliding highlight behind the range buttons.

    Measured rather than assumed: the row is `flex: 1` segments inside a padded
    track, so its width is whatever the card leaves it. `pillW` is that width
    divided by the number of segments, and the pill translates by index.
  */
  const [rangeW, setRangeW] = useState(0);
  // The track's 2pt padding on each side, and nothing else — the segments are
  // flush, so a segment is exactly a quarter of what is left.
  const pillW = rangeW > 0 ? (rangeW - 4) / RANGES.length : 0;
  const rangeIdx = RANGES.findIndex((r) => r.key === range);
  // Starts where the current range is, not at zero. The default range is the
  // last segment, so a zero start made the pill slide the width of the control
  // on first render — an animation for a change that had not happened.
  const slide = useSharedValue(rangeIdx);
  useEffect(() => {
    slide.value = withTiming(rangeIdx, { duration: duration.move, easing: Easing.out(Easing.cubic) });
  }, [rangeIdx, slide]);
  const pill = useAnimatedStyle(() => ({ transform: [{ translateX: slide.value * pillW }] }));
  const rangeDays = RANGES.find((r) => r.key === range)?.days ?? null;
  const chartPoints =
    rangeDays == null
      ? allWeight
      : (() => {
          const from = localDaysAgoStr(rangeDays);
          return allWeight.filter((d) => d.date >= from);
        })();
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
  const [bmiW, setBmiW] = useState(0);
  const bmiGrad = `bmiScale-${useId()}`;

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
      contentScrollEnabled={!scrubbing}
      title={i18n.progressTitle}
      headerRight={
        <View style={styles.headerButtons}>
          {[
            { icon: Sparkles, route: '/weekly-review' as const, label: i18n.nWeeklyReview },
            { icon: Target, route: '/smart-goals' as const, label: i18n.navSmartGoals },
            { icon: Swords, route: '/challenges' as const, label: i18n.nChallenges },
            { icon: Medal, route: '/awards' as const, label: i18n.nAwards },
          ].map((b) => (
            <PressScale
              key={b.route}
              accessibilityRole="button"
              accessibilityLabel={b.label}
              hitSlop={8}
              style={styles.iconBtn}
              onPress={() => { Haptics.selectionAsync(); router.push(b.route); }}>
              <Icon icon={b.icon} size={17} color={colors.mutedForeground} />
            </PressScale>
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
                  {/*
                    One bar with a hue that changes along it, not four blocks.

                    Drawn in SVG rather than as flex children because the caps
                    have to be round and the marker has to escape upward: the
                    container carried `borderRadius: 4` and `overflow: 'visible'`
                    together, so the radius clipped nothing and both ends of the
                    bar were square. A rounded `<Rect>` inside the SVG rounds the
                    bar; the marker stays an ordinary view on top of it and can
                    still hang over the edge.

                    Width is measured rather than given as `100%` — an `<Svg>`
                    percentage resolves against the last laid-out frame, so the
                    first paint after a size change draws at the old width.
                  */}
                  <View style={styles.bmiScale} onLayout={(e) => setBmiW(e.nativeEvent.layout.width)}>
                    {bmiW > 0 ? (
                      <Svg width={bmiW} height={BMI_BAR_H}>
                        <Defs>
                          {/* `useId`: SVG ids are document-global, and this
                              screen already draws other gradients. */}
                          <LinearGradient id={bmiGrad} x1="0" y1="0" x2="1" y2="0">
                            {bmiStops().map((s, i) => (
                              <Stop
                                key={`${s.at}-${i}`}
                                offset={`${s.at}%`}
                                stopColor={s.color}
                                stopOpacity={s.alpha}
                              />
                            ))}
                          </LinearGradient>
                        </Defs>
                        <Rect
                          x={0}
                          y={0}
                          width={bmiW}
                          height={BMI_BAR_H}
                          rx={BMI_BAR_H / 2}
                          fill={`url(#${bmiGrad})`}
                        />
                      </Svg>
                    ) : null}
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
              points={chartPoints}
              color={colors.metricBeige}
              height={180}
              unit={wl}
              emptyLabel={i18n.nNotEnoughData}
              goal={goalDisplay}
              goalLabel={i18n.nWeightGoal}
              // The weight history is the one chart people read values off, so
              // it gets the axes; the biometric sparklines stay sparklines.
              grid
              ambient
              locale={getLocale(lang)}
              onScrubbing={setScrubbing}
            />

            {/*
              How far back the chart reaches.

              It filters `allWeight`, which the changes card already fetches, so
              switching range costs nothing — no query, no spinner, no chance of
              a range that fails to load. The other numbers in this card are
              unaffected on purpose: "how far to target" is about the newest
              reading, not about the window it happens to be drawn in.
            */}
            <View
              style={styles.rangeRow}
              onLayout={(e) => setRangeW(e.nativeEvent.layout.width)}>
              {/*
                One highlight that slides, not four backgrounds swapping.

                Swapping which segment is lit says the state changed; sliding
                the same lit thing across says *from what to what*, which on a
                four-way control is the only part worth animating. It sits
                behind the labels rather than being one of them, so nothing has
                to re-render for it to move.
              */}
              {rangeW > 0 ? <Animated.View style={[styles.rangePill, { width: pillW }, pill]} /> : null}
              {RANGES.map((r) => {
                const on = r.key === range;
                return (
                  <PressScale
                    key={r.key}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    style={styles.rangeBtn}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setRange(r.key);
                    }}>
                    <Text style={[styles.rangeText, on && styles.rangeTextOn]}>{i18n[r.label]}</Text>
                  </PressScale>
                );
              })}
            </View>

            {/*
              One button, one sheet. The row used to be a stepper; a target
              weight is a number people arrive already knowing, and stepping
              to it from the current weight is a lot of taps for something
              they could type.
            */}
            <PressScale
              style={styles.goalRow}
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
            </PressScale>
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
          <PressScale
            style={styles.addBtn}
            onPress={() => { Haptics.selectionAsync(); router.push('/log-measurement'); }}>
            <Icon icon={Plus} size={13} color={colors.primaryForeground} strokeWidth={2.5} />
            <Text style={styles.addBtnText}>{i18n.progressAddMeasurement}</Text>
          </PressScale>

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
          <PressScale
            style={styles.photoCta}
            onPress={() => { Haptics.selectionAsync(); router.push('/progress-photos'); }}>
            <Icon icon={Camera} size={14} color={colors.primaryForeground} />
            <Text style={styles.photoCtaText}>{i18n.nPhotoAdd}</Text>
          </PressScale>
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
  // No radius here: the rounded ends belong to the `<Rect>`, which is what
  // `overflow: 'visible'` — needed so the marker can hang above — always
  // prevented this container from clipping.
  rangeRow: {
    flexDirection: 'row',
    // No gap. The segments are flush and the pill is what separates them —
    // with a gap the pill's arithmetic has to account for `(n - 1)` of them,
    // and getting that subtly wrong is how it ends up 1.5px too wide and
    // 1.5px left of the last segment it is supposed to be sitting on.
    marginTop: spacing.sm,
    padding: 2,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(24,24,27,0.5)',
  },
  // 34pt tall inside a 4pt-padded row: the touch target is the full segment
  // width, and seven-plus points wide is well past the 44pt floor.
  rangeBtn: { flex: 1, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm - 2 },
  rangePill: {
    position: 'absolute',
    left: 2,
    top: 2,
    bottom: 2,
    borderRadius: radius.sm - 2,
    backgroundColor: 'rgba(255,255,255,0.09)',
  },
  rangeText: { ...type.footnote, color: colors.mutedForeground },
  rangeTextOn: { color: colors.foreground, fontWeight: '600' },
  bmiScale: { height: BMI_BAR_H, justifyContent: 'center', overflow: 'visible' },
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
