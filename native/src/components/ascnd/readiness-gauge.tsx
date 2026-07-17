import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

import { GlassCard } from '@/components/ascnd/glass-card';
import { colors, radius, spacing } from '@/constants/ascnd';
import { useI18n } from '@/hooks/use-app-settings';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** Track color used by every web ring: hsl(230 10% 10%) */
const TRACK = '#17171c';

const GRADIENTS: Record<string, [string, string]> = {
  green: ['#20b684', '#17cf59'],
  yellow: ['#f59e0b', '#ecc94b'],
  red: ['#dc2828', '#e61a66'],
};

const STATUS_COLOR: Record<string, string> = {
  green: colors.readinessGreen,
  yellow: colors.readinessYellow,
  red: colors.readinessRed,
};

interface Props {
  score: number;
  status: 'green' | 'yellow' | 'red';
  explain?: string | null;
  recommendation?: string | null;
  acwr?: number | null;
}

/**
 * Faithful port of the web ReadinessGauge card: pulsing status dot +
 * uppercase title, 208pt gradient ring with the score in mono type,
 * status label, ACWR tile, explain text, tinted recommendation pill and
 * the three-zone legend.
 */
export function ReadinessGauge({ score, status, explain, recommendation, acwr }: Props) {
  const i18n = useI18n();
  const color = STATUS_COLOR[status] ?? colors.readinessYellow;
  const [g0, g1] = GRADIENTS[status] ?? GRADIENTS.yellow;
  const statusLabel =
    status === 'green' ? i18n.dcReadinessTrain : status === 'yellow' ? i18n.dcReadinessModerate : i18n.dcReadinessRecover;

  // Ring geometry — mirrors web: viewBox 120, r=52, strokeWidth 6
  const R = 52;
  const CIRC = 2 * Math.PI * R;

  const progress = useSharedValue(0);
  const pulse = useSharedValue(1);
  useEffect(() => {
    progress.value = withDelay(
      300,
      withTiming(score / 100, { duration: 1600, easing: Easing.bezier(0.16, 1, 0.3, 1) }),
    );
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.3, { duration: 1000, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
    );
  }, [score, progress, pulse]);

  const ringProps = useAnimatedProps(() => ({
    strokeDashoffset: CIRC - progress.value * CIRC,
  }));

  const legend = [
    { color: colors.readinessGreen, label: `75–100 · ${i18n.dcReadinessTrain}` },
    { color: colors.readinessYellow, label: `50–74 · ${i18n.dcReadinessModerate}` },
    { color: colors.readinessRed, label: `0–49 · ${i18n.dcReadinessRecover}` },
  ];

  return (
    <GlassCard style={styles.card}>
      {/* Title with pulsing status dot */}
      <View style={styles.titleRow}>
        <Animated.View
          style={[styles.statusDot, { backgroundColor: color }, { transform: [{ scale: pulse }] }]}
        />
        <Text style={styles.title}>{i18n.dcReadinessTitle}</Text>
      </View>

      {/* Ring */}
      <View style={styles.ringWrap}>
        <Svg width={208} height={208} viewBox="0 0 120 120">
          <Defs>
            <LinearGradient id="readiness-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%" stopColor={g0} />
              <Stop offset="100%" stopColor={g1} />
            </LinearGradient>
          </Defs>
          <Circle cx="60" cy="60" r={R} fill="none" stroke={TRACK} strokeWidth={6} />
          {/* soft glow approximation */}
          <AnimatedCircle
            cx="60" cy="60" r={R}
            fill="none"
            stroke={g0}
            opacity={0.25}
            strokeWidth={10}
            strokeLinecap="round"
            strokeDasharray={`${CIRC}`}
            animatedProps={ringProps}
            transform="rotate(-90 60 60)"
          />
          <AnimatedCircle
            cx="60" cy="60" r={R}
            fill="none"
            stroke="url(#readiness-grad)"
            strokeWidth={6}
            strokeLinecap="round"
            strokeDasharray={`${CIRC}`}
            animatedProps={ringProps}
            transform="rotate(-90 60 60)"
          />
        </Svg>
        <View style={styles.ringCenter} pointerEvents="none">
          <Text style={[styles.score, { color }]}>{score}</Text>
          <Text style={[styles.statusLabel, { color }]}>{statusLabel}</Text>
        </View>
      </View>

      {/* ACWR tile row (web shows subscores + ACWR; only ACWR is real data) */}
      {acwr != null && acwr > 0 && (
        <View style={styles.tileRow}>
          <View style={styles.tile}>
            <Text style={styles.tileLabel}>ACWR</Text>
            <Text style={styles.tileValue}>{acwr}</Text>
          </View>
        </View>
      )}

      {/* Explain + recommendation */}
      {explain ? <Text style={styles.explain}>{explain}</Text> : null}
      {recommendation ? (
        <View style={[styles.recoPill, { backgroundColor: `${color}1a`, borderColor: `${color}33` }]}>
          <Text style={[styles.recoText, { color }]}>{recommendation}</Text>
        </View>
      ) : null}

      {/* Legend */}
      <View style={styles.legendRow}>
        {legend.map((l) => (
          <View key={l.label} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: l.color }]} />
            <Text style={styles.legendText}>{l.label}</Text>
          </View>
        ))}
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: 'center', paddingVertical: spacing.xl + 8, gap: spacing.lg },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  title: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 2.4,
    color: colors.mutedForeground,
  },
  ringWrap: { width: 208, height: 208, alignItems: 'center', justifyContent: 'center' },
  ringCenter: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  score: { fontSize: 60, fontWeight: '700', fontFamily: 'Menlo', fontVariant: ['tabular-nums'] },
  statusLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 2.4, marginTop: 6 },
  tileRow: { flexDirection: 'row', gap: spacing.sm + 4 },
  tile: {
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(24,24,27,0.2)',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(43,43,49,0.2)',
  },
  tileLabel: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.5, color: colors.mutedForeground },
  tileValue: { fontSize: 18, fontFamily: 'Menlo', fontWeight: '600', color: colors.foreground, fontVariant: ['tabular-nums'] },
  explain: { fontSize: 12, color: colors.mutedForeground, textAlign: 'center', lineHeight: 18, paddingHorizontal: spacing.card },
  recoPill: {
    marginHorizontal: spacing.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
  },
  recoText: { fontSize: 14, fontWeight: '500', textAlign: 'center' },
  legendRow: { flexDirection: 'row', gap: spacing.md, flexWrap: 'wrap', justifyContent: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 10, color: colors.mutedForeground },
});
