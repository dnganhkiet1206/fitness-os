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
import { Icon } from '@/components/ascnd/icon';
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

/** 100pt progress ring with icon + mono value in the middle (web pattern) */
function SmallRing({
  pct,
  gradId,
  gradient: [c0, c1],
  icon,
  iconColor,
  value,
  unit,
}: {
  pct: number;
  gradId: string;
  gradient: [string, string];
  icon: LucideIcon;
  iconColor: string;
  value: string;
  unit?: string;
}) {
  const R = 40;
  const CIRC = 2 * Math.PI * R;
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withDelay(
      200,
      withTiming(Math.min(pct, 100) / 100, { duration: 1200, easing: Easing.bezier(0.16, 1, 0.3, 1) }),
    );
  }, [pct, progress]);
  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: CIRC - progress.value * CIRC,
  }));
  return (
    <View style={styles.smallRingWrap}>
      <Svg width={100} height={100} viewBox="0 0 100 100">
        <Defs>
          <LinearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor={c0} />
            <Stop offset="100%" stopColor={c1} />
          </LinearGradient>
        </Defs>
        <Circle cx="50" cy="50" r={R} fill="none" stroke={TRACK} strokeWidth={6} />
        <AnimatedCircle
          cx="50" cy="50" r={R}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray={`${CIRC}`}
          animatedProps={animatedProps}
          transform="rotate(-90 50 50)"
        />
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
}

export function NutritionCard({ kcal, calorieTarget, protein, carbs, fat }: NutritionCardProps) {
  const i18n = useI18n();
  const calPct = Math.min((kcal / (calorieTarget || 1)) * 100, 100);

  const macros = [
    { label: 'Protein', ...protein, color: colors.primary, bar: ['#f59e0b', '#ecc94b'] as [string, string] },
    { label: 'Carbs', ...carbs, color: colors.metricBlue, bar: ['#3e86ea', '#8d52e0'] as [string, string] },
    { label: 'Fat', ...fat, color: colors.metricOrange, bar: ['#f17b27', '#dc2828'] as [string, string] },
  ];

  return (
    <GlassCard style={styles.stackCard}>
      <MicroTitle>{i18n.dcNutritionTitle}</MicroTitle>

      <View style={styles.ringRow}>
        <SmallRing
          pct={calPct}
          gradId="nutri-cal"
          gradient={['#f59e0b', '#f17b27']}
          icon={Flame}
          iconColor={colors.metricOrange}
          value={kcal.toLocaleString()}
          unit="kcal"
        />
        <View style={styles.ringSide}>
          <Text style={styles.sideLine}>
            {i18n.dcNutritionTarget}: <Text style={styles.sideMono}>{calorieTarget.toLocaleString()}</Text> kcal
          </Text>
          <Text style={styles.sideLine}>
            {i18n.dcNutritionRemaining}: <Text style={styles.sideMono}>{Math.max(calorieTarget - kcal, 0).toLocaleString()}</Text> kcal
          </Text>
          <View style={styles.sideBarRow}>
            <Text
              style={[
                styles.sidePct,
                { color: calPct >= 90 ? colors.readinessGreen : calPct >= 50 ? colors.readinessYellow : colors.mutedForeground },
              ]}>
              {Math.round(calPct)}%
            </Text>
            <View style={styles.sideBarTrack}>
              <View style={[styles.sideBarFill, { width: `${calPct}%` }]} />
            </View>
          </View>
        </View>
      </View>

      <View style={styles.macroGrid}>
        {macros.map((m) => {
          const pct = Math.min((m.current / (m.target || 1)) * 100, 100);
          return (
            <View key={m.label} style={styles.macroTile}>
              <Text style={styles.macroLabel}>{m.label}</Text>
              <Text style={styles.macroValue}>
                {Math.round(m.current)}
                <Text style={styles.macroTarget}>/{m.target}g</Text>
              </Text>
              <View style={styles.macroBarTrack}>
                <View style={[styles.macroBarFill, { width: `${pct}%`, backgroundColor: m.bar[0] }]} />
              </View>
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
          gradient={['#8d52e0', '#18c2dc']}
          icon={Moon}
          iconColor={colors.metricPurple}
          value={`${hours}h${String(mins).padStart(2, '0')}m`}
        />
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
      iconColor="#38bdf8"
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
      iconColor="#4ade80"
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
  sideLine: { fontSize: 12, color: colors.mutedForeground },
  sideMono: { fontFamily: 'Menlo', color: colors.foreground, fontVariant: ['tabular-nums'] },
  sideMonoStrong: { fontSize: 14, fontFamily: 'Menlo', fontWeight: '700', color: colors.foreground, fontVariant: ['tabular-nums'] },
  sideBarRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  sidePct: { fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },
  sideBarTrack: { flex: 1, height: 4, borderRadius: 2, backgroundColor: 'rgba(24,24,27,0.4)', overflow: 'hidden' },
  sideBarFill: { height: '100%', borderRadius: 2, backgroundColor: colors.metricOrange },
  qualityRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  timesRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  timeText: { fontSize: 12, fontFamily: 'Menlo', color: colors.mutedForeground, fontVariant: ['tabular-nums'] },
  timeArrow: { fontSize: 12, color: colors.mutedForeground },

  // macros
  macroGrid: { flexDirection: 'row', gap: spacing.sm + 4 },
  macroTile: {
    flex: 1,
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
  pressedDim: { opacity: 0.8 },
  compactIcon: { width: 40, height: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  compactInfo: { flex: 1, minWidth: 0, gap: 2 },
  compactLabel: { fontSize: 12, color: colors.mutedForeground },
  compactValue: { fontSize: 14, fontWeight: '600', color: colors.foreground, fontVariant: ['tabular-nums'] },
  compactPct: { fontSize: 18, fontWeight: '700', color: colors.foreground, fontVariant: ['tabular-nums'] },
});
