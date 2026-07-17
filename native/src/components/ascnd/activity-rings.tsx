import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

import { GlassCard } from '@/components/ascnd/glass-card';
import { colors, spacing } from '@/constants/ascnd';
import { useI18n } from '@/hooks/use-app-settings';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const TRACK = '#17171c';

interface RingDatum {
  current: number;
  target: number;
}

interface Props {
  move: RingDatum;
  exercise: RingDatum;
  stand: RingDatum;
  size?: number;
}

function Ring({
  index,
  size,
  radiusPx,
  strokeWidth,
  gradId,
  colors: [c0, c1],
  pct,
}: {
  index: number;
  size: number;
  radiusPx: number;
  strokeWidth: number;
  gradId: string;
  colors: [string, string];
  pct: number;
}) {
  const circumference = 2 * Math.PI * radiusPx;
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withDelay(
      300 + index * 150,
      withTiming(Math.min(pct, 1.5), { duration: 1400, easing: Easing.bezier(0.16, 1, 0.3, 1) }),
    );
  }, [pct, index, progress]);
  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference - progress.value * circumference,
  }));
  const center = size / 2;
  return (
    <>
      <Circle cx={center} cy={center} r={radiusPx} fill="none" stroke={TRACK} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Defs>
        <LinearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor={c0} />
          <Stop offset="100%" stopColor={c1} />
        </LinearGradient>
      </Defs>
      <AnimatedCircle
        cx={center}
        cy={center}
        r={radiusPx}
        fill="none"
        stroke={`url(#${gradId})`}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={`${circumference}`}
        animatedProps={animatedProps}
        transform={`rotate(-90 ${center} ${center})`}
      />
    </>
  );
}

/**
 * Faithful port of the web ActivityCard: uppercase micro-title, Apple
 * style triple rings (move kcal / exercise min / steps) with gradient
 * strokes, and the three legends underneath (value/target + percent).
 */
export function ActivityRingsCard({ move, exercise, stand, size = 160 }: Props) {
  const i18n = useI18n();

  const rings = [
    { key: 'move', label: i18n.dcActivityMove, unit: i18n.dcActivityKcal, colors: ['#f59e0b', '#f17b27'] as [string, string], data: move },
    { key: 'exercise', label: i18n.dcActivityExercise, unit: i18n.dcActivityMin, colors: ['#20b684', '#17cf59'] as [string, string], data: exercise },
    { key: 'stand', label: i18n.dcActivitySteps, unit: i18n.dcActivityStepsUnit, colors: ['#3e86ea', '#18c2dc'] as [string, string], data: stand },
  ];

  const center = size / 2;
  const strokeWidth = size * 0.065;
  const gap = strokeWidth * 1.6;

  return (
    <GlassCard style={styles.card}>
      <Text style={styles.title}>{i18n.dcActivity}</Text>
      <View style={styles.ringsWrap}>
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {rings.map((r, i) => {
            const radiusPx = center - strokeWidth / 2 - i * gap - strokeWidth * 0.5;
            const pct = r.data.target > 0 ? r.data.current / r.data.target : 0;
            return (
              <Ring
                key={r.key}
                index={i}
                size={size}
                radiusPx={radiusPx}
                strokeWidth={strokeWidth}
                gradId={`ring-grad-${r.key}`}
                colors={r.colors}
                pct={pct}
              />
            );
          })}
        </Svg>
      </View>

      {/* Legends */}
      <View style={styles.legendRow}>
        {rings.map((r) => {
          const pct = Math.round(Math.min((r.data.current / (r.data.target || 1)) * 100, 999));
          return (
            <View key={r.key} style={styles.legendItem}>
              <View style={styles.legendHead}>
                <View style={[styles.legendDot, { backgroundColor: r.colors[0] }]} />
                <Text style={styles.legendLabel}>{r.label}</Text>
              </View>
              <View style={styles.legendValueRow}>
                <Text style={styles.legendValue}>{r.data.current.toLocaleString()}</Text>
                <Text style={styles.legendTarget}>/{r.data.target.toLocaleString()}{r.unit}</Text>
              </View>
              <Text style={[styles.legendPct, { color: r.colors[0] }]}>{pct}%</Text>
            </View>
          );
        })}
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: 'center', gap: spacing.stack },
  title: {
    alignSelf: 'flex-start',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 2.4,
    color: colors.mutedForeground,
  },
  ringsWrap: { alignItems: 'center', justifyContent: 'center' },
  legendRow: { flexDirection: 'row', gap: spacing.lg, justifyContent: 'center' },
  legendItem: { alignItems: 'center', gap: 4 },
  legendHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.5, color: colors.mutedForeground },
  legendValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  legendValue: { fontSize: 18, fontFamily: 'Menlo', fontWeight: '700', color: colors.foreground, fontVariant: ['tabular-nums'] },
  legendTarget: { fontSize: 10, color: colors.mutedForeground },
  legendPct: { fontSize: 10, fontFamily: 'Menlo', fontWeight: '600', fontVariant: ['tabular-nums'] },
});
