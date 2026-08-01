import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Droplets, Flame, Footprints, Moon, Star, Sunrise, type LucideIcon } from 'lucide-react-native';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

import { GlassCard } from '@/components/ascnd/glass-card';
import { CarbIcon, FatIcon, FiberIcon, ProteinIcon } from '@/components/ascnd/macro-icons';
import { Icon } from '@/components/ascnd/icon';
import { ProgressBar } from '@/components/ascnd/progress-bar';
import { colors, radius, spacing } from '@/constants/ascnd';
import { useI18n } from '@/hooks/use-app-settings';
import { useVolumeUnit } from '@/hooks/use-volume-unit';
import { displayVolume, volumeLabel } from '@/lib/units';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const TRACK = '#17171c';

/** The web's card micro-title: 12px semibold uppercase, wide tracking */
export function MicroTitle({ children }: { children: React.ReactNode }) {
  return <Text style={styles.microTitle}>{children}</Text>;
}

/**
 * 100pt progress ring with icon + mono value in the middle (web pattern).
 *
 * ── going past 100% ──
 *
 * `over` is how far the value went past the target, as a percentage of it, and
 * it is drawn the way Apple's Move ring draws it: a second lap **on the same
 * stroke**, from twelve o'clock, overlapping the ring already there.
 *
 * The first version put it on a smaller concentric radius instead. That is
 * legible, and it is a different idea — it reads as a second, separate
 * measurement rather than as one measurement that kept going. Overlapping is
 * what says "round again".
 *
 * Which raises the problem the shadow solves: laid directly over a ring of the
 * same colour, the lap is invisible. So dark arcs are drawn a few degrees
 * *longer* than the lap and underneath it, and what shows past the coloured
 * cap is a shadow cast onto the ring below. It is the only depth cue available
 * — `react-native-svg` declares the filter primitives but leaves them
 * unimplemented on native, so `feDropShadow` renders nothing.
 *
 * Two of them, at different lengths and opacities, because one is a hard-edged
 * dark crescent: a real shadow has no outline. The longer, fainter arc puts a
 * step of falloff past the darker one, which at this size is the difference
 * between a shadow and a mark. Short, as well — the lap is what should be
 * noticed, and a shadow big enough to see on its own is a shadow that has
 * become part of the drawing.
 *
 * The lap uses the ring's own gradient, not a colour of its own. It is the
 * same measurement continuing, and the ring's colour already carries a
 * meaning that a second colour on the same stroke would be read as part of.
 */
function SmallRing({
  pct,
  gradId,
  gradient: [c0, c1],
  icon,
  iconColor,
  value,
  unit,
  over = 0,
}: {
  pct: number;
  gradId: string;
  gradient: [string, string];
  icon: LucideIcon;
  iconColor: string;
  value: string;
  unit?: string;
  /** percent past the target, 0 for none — drawn as an overlapping second lap */
  over?: number;
}) {
  // Thick, in the Move-ring proportion: the stroke is most of the difference
  // between the outer edge and the hole, so the ring reads as a band of colour
  // rather than as a line drawn round a circle.
  const R = 37;
  const W = 12;
  const CIRC = 2 * Math.PI * R;

  /**
   * How far each shadow arc leads the lap's cap, as a fraction of a turn, with
   * the opacity that goes with it. ~3° and ~6° — small enough to sit under the
   * cap rather than trail behind it as a visible tail.
   */
  const SHADOWS = [
    { lead: 0.017, opacity: 0.16 },
    { lead: 0.008, opacity: 0.3 },
  ] as const;

  const progress = useSharedValue(0);
  const overProgress = useSharedValue(0);
  useEffect(() => {
    progress.value = withDelay(
      200,
      withTiming(Math.min(pct, 100) / 100, { duration: 1200, easing: Easing.bezier(0.16, 1, 0.3, 1) }),
    );
  }, [pct, progress]);
  useEffect(() => {
    // Starts after the main ring has had a moment, so the two are read in
    // order: the day filled up, and then it went round again.
    overProgress.value = withDelay(
      700,
      withTiming(Math.min(over, 100) / 100, { duration: 1000, easing: Easing.bezier(0.16, 1, 0.3, 1) }),
    );
  }, [over, overProgress]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: CIRC - progress.value * CIRC,
  }));
  const overAnimatedProps = useAnimatedProps(() => ({
    strokeDashoffset: CIRC - overProgress.value * CIRC,
  }));
  const shadowFar = useAnimatedProps(() => ({
    strokeDashoffset: CIRC - Math.min(overProgress.value + SHADOWS[0].lead, 1) * CIRC,
  }));
  const shadowNear = useAnimatedProps(() => ({
    strokeDashoffset: CIRC - Math.min(overProgress.value + SHADOWS[1].lead, 1) * CIRC,
  }));

  const lapped = over > 0;

  return (
    <View style={styles.smallRingWrap}>
      <Svg width={100} height={100} viewBox="0 0 100 100">
        <Defs>
          <LinearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor={c0} />
            <Stop offset="100%" stopColor={c1} />
          </LinearGradient>
        </Defs>
        <Circle cx="50" cy="50" r={R} fill="none" stroke={TRACK} strokeWidth={W} />
        <AnimatedCircle
          cx="50" cy="50" r={R}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth={W}
          strokeLinecap="round"
          strokeDasharray={`${CIRC}`}
          animatedProps={animatedProps}
          transform="rotate(-90 50 50)"
        />
        {lapped ? (
          <>
            {/* Two arcs a few degrees ahead of the lap, fainter the further
                they reach; what shows past the coloured cap is the shadow it
                casts on the ring below. Longest and faintest first. */}
            <AnimatedCircle
              cx="50" cy="50" r={R}
              fill="none"
              stroke={`rgba(0,0,0,${SHADOWS[0].opacity})`}
              strokeWidth={W}
              strokeLinecap="round"
              strokeDasharray={`${CIRC}`}
              animatedProps={shadowFar}
              transform="rotate(-90 50 50)"
            />
            <AnimatedCircle
              cx="50" cy="50" r={R}
              fill="none"
              stroke={`rgba(0,0,0,${SHADOWS[1].opacity})`}
              strokeWidth={W}
              strokeLinecap="round"
              strokeDasharray={`${CIRC}`}
              animatedProps={shadowNear}
              transform="rotate(-90 50 50)"
            />
            <AnimatedCircle
              cx="50" cy="50" r={R}
              fill="none"
              stroke={`url(#${gradId})`}
              strokeWidth={W}
              strokeLinecap="round"
              strokeDasharray={`${CIRC}`}
              animatedProps={overAnimatedProps}
              transform="rotate(-90 50 50)"
            />
          </>
        ) : null}
      </Svg>
      <View style={styles.smallRingCenter} pointerEvents="none">
        <Icon icon={icon} size={16} color={iconColor} />
        <Text style={styles.smallRingValue}>{value}</Text>
        {unit ? <Text style={styles.smallRingUnit}>{unit}</Text> : null}
      </View>
    </View>
  );
}

// ─── Nutrition card (web NutritionCard) ────────────────────────────────

interface NutritionCardProps {
  kcal: number;
  calorieTarget: number;
  protein: { current: number; target: number };
  carbs: { current: number; target: number };
  fat: { current: number; target: number };
  /**
   * Optional — the card predates it and callers that have no fibre to show
   * still get the three tiles they always did.
   */
  fiber?: { current: number; target: number };
}

export function NutritionCard({ kcal, calorieTarget, protein, carbs, fat, fiber }: NutritionCardProps) {
  const i18n = useI18n();
  const calPct = Math.min((kcal / (calorieTarget || 1)) * 100, 100);
  /** the same share, uncapped — the ring stops at a turn, this does not */
  const pctOfTarget = Math.round((kcal / (calorieTarget || 1)) * 100);

  /**
   * How far today sits from the target, signed.
   *
   * Positive is a surplus (eaten past the target), negative a deficit. The
   * "remaining" line above it already shows what is left, but it clamps at
   * zero — so once the target is passed it reads 0 and says nothing about by
   * how much. This is the line that keeps counting, and it is what a cut or a
   * bulk is actually steered by.
   */
  const delta = kcal - calorieTarget;
  const over = delta > 0;
  // Landing exactly on the target is neither, and printing "deficit −0" for it
  // is the sort of thing a user reads as a bug.
  const onTarget = delta === 0;

  /**
   * The ring's three states, which are not the same question as the text above.
   *
   *  - **under** the target — still filling up. Grey: nothing has been achieved
   *    yet and nothing is wrong either, so the ring stays quiet rather than
   *    congratulating a half-eaten day in warm orange.
   *  - **on target, or over by no more than the allowance** — the good band.
   *    This keeps the card's existing amber/orange gradient.
   *  - **past the allowance** — red. Genuinely over, and it should look it.
   *
   * The allowance is a share of the target rather than a flat number, so it
   * scales with the person: 8% is ±176 kcal on a 2,200 target, about a snack,
   * which is the resolution food logging is honest to anyway. One constant to
   * change if it should be tighter or looser.
   */
  const SURPLUS_ALLOWANCE = 0.08;
  const overBudget = delta > calorieTarget * SURPLUS_ALLOWANCE;
  const inBand = !overBudget && kcal >= calorieTarget;

  /**
   * The overshoot lap: how far past the target the day went, as a share of the
   * target. Capped at a full extra lap — eating double is as far as the ring
   * can say, and the surplus line prints the real figure anyway.
   */
  const overPct = calorieTarget > 0 ? Math.min((Math.max(delta, 0) / calorieTarget) * 100, 100) : 0;

  const ringGradient: [string, string] = overBudget
    ? ['#e6485c', colors.readinessRed]
    : inBand
      ? ['#ffc53d', '#ff9130']
      : ['#4a4a52', '#6b6b6b'];
  const ringIconColor = overBudget
    ? colors.readinessRed
    : inBand
      ? colors.metricOrange
      : colors.mutedForeground;

  // the delta line follows the same three states, so the card speaks once
  const deltaColor = overBudget
    ? colors.readinessRed
    : inBand
      ? colors.metricOrange
      : colors.mutedForeground;

  const macros = [
    { label: 'Protein', ...protein, icon: ProteinIcon, color: colors.primary, bar: ['#f59e0b', '#ecc94b'] as [string, string] },
    { label: 'Carbs', ...carbs, icon: CarbIcon, color: colors.metricBlue, bar: ['#3ba6ff', '#b45cff'] as [string, string] },
    { label: 'Fat', ...fat, icon: FatIcon, color: colors.metricOrange, bar: ['#ff9130', '#ff3b5c'] as [string, string] },
    ...(fiber
      ? [{ label: 'Fiber', ...fiber, icon: FiberIcon, color: colors.readinessGreen, bar: ['#3ecf8e', '#2f9e6b'] as [string, string] }]
      : []),
  ];

  return (
    <GlassCard style={styles.stackCard}>
      <MicroTitle>{i18n.dcNutritionTitle}</MicroTitle>

      <View style={styles.ringRow}>
        <SmallRing
          pct={calPct}
          gradId="nutri-cal"
          gradient={ringGradient}
          icon={Flame}
          iconColor={ringIconColor}
          value={kcal.toLocaleString()}
          unit="kcal"
          over={overPct}
        />
        {/*
          Text only. This column used to end with a percentage and a progress
          bar, and both were the ring again in a second form — a bar that fills
          as the ring fills, in the ring's own colour, right beside it. The
          numbers that are not in the ring (target, remaining, surplus) stayed.
        */}
        <View style={styles.ringSide}>
          {/*
            The target, and beside it how much of it the day has actually
            covered.

            Uncapped, unlike the ring: the ring can only draw one turn plus a
            lap, and this is the number that keeps counting — 111% says
            something a full ring cannot. It takes the ring's colour, so the
            two never disagree about whether the day is fine.
          */}
          <View style={styles.sideTargetRow}>
            <Text style={styles.sideLine}>
              {i18n.dcNutritionTarget}: <Text style={styles.sideMono}>{calorieTarget.toLocaleString()}</Text> kcal
            </Text>
            <Text style={[styles.sidePct, { color: deltaColor }]}>
              {i18n.dcNutritionPctOfGoal.replace('{x}', String(pctOfTarget))}
            </Text>
          </View>
          <Text style={styles.sideLine}>
            {i18n.dcNutritionRemaining}: <Text style={styles.sideMono}>{Math.max(calorieTarget - kcal, 0).toLocaleString()}</Text> kcal
          </Text>
          {/* Signed distance from the target — the one line that keeps counting
              once "remaining" has bottomed out at zero. */}
          {onTarget ? (
            <Text style={[styles.sideLine, { color: deltaColor }]}>{i18n.dcNutritionOnTarget}</Text>
          ) : (
            <Text style={styles.sideLine}>
              {over ? i18n.dcNutritionSurplus : i18n.dcNutritionDeficit}:{' '}
              <Text style={[styles.sideMono, { color: deltaColor }]}>
                {over ? '+' : '−'}
                {Math.abs(delta).toLocaleString()}
              </Text>{' '}
              kcal
            </Text>
          )}
        </View>
      </View>

      {/**
        * Four tiles are a 2 × 2; three are one row of three.
        *
        * The first attempt was `flexWrap` with a fixed `flexBasis`, which let
        * the three that fit sit on the first row and dropped fibre onto a
        * second one on its own, full width. Four tiles in two sizes is not a
        * grid, it is three tiles and an afterthought — so the basis is chosen
        * from how many there are rather than from how many happen to fit.
        *
        * 47 % and not 50: two tiles plus the gap between them have to add up to
        * less than the row, and `flexGrow` opens them back out to fill it.
        */}
      <View style={styles.macroGrid}>
        {macros.map((m) => {
          const pct = Math.min((m.current / (m.target || 1)) * 100, 100);
          const Glyph = m.icon;
          return (
            <View
              key={m.label}
              style={[styles.macroTile, { flexBasis: macros.length === 4 ? '47%' : 0 }]}>
              <View style={styles.macroHead}>
                {/* the macro's own colour, on the tile's own background — see
                    `macro-icons.tsx` for why the accent needs the second one */}
                <Glyph size={14} color={m.color} cut={colors.background} />
                <Text style={styles.macroLabel}>{m.label}</Text>
              </View>
              <Text style={styles.macroValue}>
                {Math.round(m.current)}
                <Text style={styles.macroTarget}>/{m.target}g</Text>
              </Text>
              <ProgressBar pct={pct} color={m.bar[0]} height={4} style={styles.macroBarTrack} delay={320} />
            </View>
          );
        })}
      </View>
    </GlassCard>
  );
}

// ─── Sleep card (web SleepCard) ────────────────────────────────────────

interface SleepCardProps {
  totalMin: number;
  targetHours: number;
  quality?: number | null;
  bedtime?: string | null;
  waketime?: string | null;
  stages?: { deep: number; rem: number; light: number } | null;
}

export function SleepCard({ totalMin, targetHours, quality, bedtime, waketime, stages }: SleepCardProps) {
  const i18n = useI18n();
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  const pct = Math.min((totalMin / (targetHours * 60 || 1)) * 100, 100);

  const fmt = (iso?: string | null) =>
    iso ? new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) : null;

  const stageTotal = stages ? stages.deep + stages.rem + stages.light : 0;
  const stageDefs = stages && stageTotal > 0
    ? [
        { label: 'Deep', min: stages.deep, color: colors.metricPurple },
        { label: 'REM', min: stages.rem, color: colors.metricCyan },
        { label: 'Light', min: stages.light, color: '#3f4048' },
      ]
    : [];

  return (
    <GlassCard style={styles.stackCard}>
      <MicroTitle>{i18n.dcSleepTitle}</MicroTitle>

      <View style={styles.ringRow}>
        <SmallRing
          pct={pct}
          gradId="sleep-ring"
          gradient={['#b45cff', '#22e3ff']}
          icon={Moon}
          iconColor={colors.metricPurple}
          value={`${hours}h${String(mins).padStart(2, '0')}m`}
        />
        {/*
          Text only. This column used to end with a percentage and a progress
          bar, and both were the ring again in a second form — a bar that fills
          as the ring fills, in the ring's own colour, right beside it. The
          numbers that are not in the ring (target, remaining, surplus) stayed.
        */}
        <View style={styles.ringSide}>
          <Text style={styles.sideLine}>
            {i18n.dcSleepTarget}: <Text style={styles.sideMono}>{targetHours}h</Text>
          </Text>
          {quality != null && (
            <View style={styles.qualityRow}>
              <Icon icon={Star} size={12} color={colors.readinessYellow} />
              <Text style={styles.sideLine}>{i18n.dcSleepQuality}:</Text>
              <Text style={styles.sideMonoStrong}>{quality}/10</Text>
            </View>
          )}
          {bedtime && waketime && (
            <View style={styles.timesRow}>
              <Icon icon={Moon} size={12} color={colors.mutedForeground} />
              <Text style={styles.timeText}>{fmt(bedtime)}</Text>
              <Text style={styles.timeArrow}>→</Text>
              <Icon icon={Sunrise} size={12} color={colors.mutedForeground} />
              <Text style={styles.timeText}>{fmt(waketime)}</Text>
            </View>
          )}
        </View>
      </View>

      {stageDefs.length > 0 && (
        <View style={styles.stagesWrap}>
          <View style={styles.stagesBar}>
            {stageDefs.map((s) => (
              <View key={s.label} style={{ flex: s.min, backgroundColor: s.color }} />
            ))}
          </View>
          <View style={styles.stagesLegend}>
            {stageDefs.map((s) => (
              <View key={s.label} style={styles.stageLegendItem}>
                <View style={[styles.legendDot, { backgroundColor: s.color }]} />
                <Text style={styles.stageLegendText}>
                  {s.label} · {Math.floor(s.min / 60)}h{s.min % 60}m
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </GlassCard>
  );
}

// ─── Water / Steps compact widgets (web WaterWidget / StepsWidget) ─────

function CompactWidget({
  icon,
  iconColor,
  iconBg,
  label,
  valueText,
  pct,
  onPress,
}: {
  icon: LucideIcon;
  iconColor: string;
  iconBg: string;
  label: string;
  valueText: string;
  pct: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync();
        onPress();
      }}>
      {({ pressed }) => (
        <GlassCard style={[styles.compactCard, pressed && styles.pressedDim]}>
          <View style={[styles.compactIcon, { backgroundColor: iconBg }]}>
            <Icon icon={icon} size={20} color={iconColor} />
          </View>
          <View style={styles.compactInfo}>
            <Text style={styles.compactLabel}>{label}</Text>
            <Text style={styles.compactValue}>{valueText}</Text>
          </View>
          <Text style={styles.compactPct}>{pct}%</Text>
        </GlassCard>
      )}
    </Pressable>
  );
}

export function WaterWidget({ ml, targetMl, labels }: { ml: number; targetMl: number; labels: { title: string } }) {
  const { unit } = useVolumeUnit();
  const pct = Math.min(100, Math.round((ml / (targetMl || 1)) * 100));
  return (
    <CompactWidget
      icon={Droplets}
      iconColor="#3ba6ff"
      iconBg="rgba(14,165,233,0.1)"
      label={labels.title}
      valueText={`${displayVolume(ml, unit)} / ${displayVolume(targetMl, unit)} ${volumeLabel(unit)}`}
      pct={pct}
      onPress={() => router.push('/water')}
    />
  );
}

export function StepsWidget({ steps, target, labels }: { steps: number; target: number; labels: { title: string } }) {
  const pct = Math.min(100, Math.round((steps / (target || 1)) * 100));
  return (
    <CompactWidget
      icon={Footprints}
      iconColor="#2bf5a8"
      iconBg="rgba(34,197,94,0.1)"
      label={labels.title}
      valueText={`${steps.toLocaleString()} / ${target.toLocaleString()}`}
      pct={pct}
      onPress={() => router.push('/steps')}
    />
  );
}

const styles = StyleSheet.create({
  microTitle: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 2.4,
    color: colors.mutedForeground,
  },
  stackCard: { gap: spacing.stack },

  // small ring
  smallRingWrap: { width: 100, height: 100 },
  smallRingCenter: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 1 },
  smallRingValue: { fontSize: 16, fontFamily: 'Menlo', fontWeight: '700', color: colors.foreground, fontVariant: ['tabular-nums'] },
  smallRingUnit: { fontSize: 9, color: colors.mutedForeground },
  ringRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  ringSide: { flex: 1, gap: 6 },
  // 14, not 12. These three lines are the card's whole read-out beside the
  // ring — the target, what is left, and how far past it the day has gone —
  // and at 12 they were caption-sized next to a 16pt number in the ring.
  sideLine: { fontSize: 14, color: colors.mutedForeground },
  sideTargetRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  sidePct: { fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  sideMono: { fontFamily: 'Menlo', color: colors.foreground, fontVariant: ['tabular-nums'] },
  sideMonoStrong: { fontSize: 14, fontFamily: 'Menlo', fontWeight: '700', color: colors.foreground, fontVariant: ['tabular-nums'] },
  sideBarFill: { height: '100%', borderRadius: 2, backgroundColor: colors.metricOrange },
  qualityRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  timesRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  timeText: { fontSize: 12, fontFamily: 'Menlo', color: colors.mutedForeground, fontVariant: ['tabular-nums'] },
  timeArrow: { fontSize: 12, color: colors.mutedForeground },

  // macros
  macroGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm + 4 },
  // the icon sits on the label's line, not above it — a tile whose label is two
  // lines tall is a tile a size bigger than the one beside it
  macroHead: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  macroTile: {
    // `flexBasis` comes from the call site: 47% when there are four, 0 when
    // there are three. See `NutritionCard`.
    flexGrow: 1,
    gap: 8,
    backgroundColor: 'rgba(24,24,27,0.2)',
    borderRadius: radius.sm,
    padding: spacing.sm + 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(43,43,49,0.2)',
  },
  macroLabel: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.5, color: colors.mutedForeground },
  macroValue: { fontSize: 18, fontFamily: 'Menlo', fontWeight: '700', color: colors.foreground, fontVariant: ['tabular-nums'] },
  macroTarget: { fontSize: 12, fontWeight: '400', color: colors.mutedForeground },
  macroBarTrack: { height: 4, borderRadius: 2, backgroundColor: 'rgba(24,24,27,0.4)', overflow: 'hidden' },
  macroBarFill: { height: '100%', borderRadius: 2 },

  // sleep stages
  stagesWrap: { gap: spacing.sm + 4 },
  stagesBar: { flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', backgroundColor: 'rgba(24,24,27,0.3)' },
  stagesLegend: { flexDirection: 'row', justifyContent: 'space-between' },
  stageLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  stageLegendText: { fontSize: 10, color: colors.mutedForeground },

  // compact widgets
  compactCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4, padding: spacing.md },
  pressedDim: { opacity: 0.9, transform: [{ scale: 0.98 }] },
  compactIcon: { width: 40, height: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  compactInfo: { flex: 1, minWidth: 0, gap: 2 },
  compactLabel: { fontSize: 12, color: colors.mutedForeground },
  compactValue: { fontSize: 14, fontWeight: '600', color: colors.foreground, fontVariant: ['tabular-nums'] },
  compactPct: { fontSize: 18, fontWeight: '700', color: colors.foreground, fontVariant: ['tabular-nums'] },
});
