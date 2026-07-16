import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withSpring,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { colors, type } from '@/constants/ascnd';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const SIZE = 148;
const STROKE = 10;
const R = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * R;

interface ReadinessRingProps {
  /** 0–100, or null when there's no data yet */
  score: number | null;
  color: string;
}

/**
 * Animated readiness ring — the arc springs to the score on mount/update,
 * driven on the UI thread by Reanimated.
 */
export function ReadinessRing({ score, color }: ReadinessRingProps) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      150,
      withSpring(score != null ? Math.max(0, Math.min(100, score)) / 100 : 0, {
        stiffness: 60,
        damping: 15,
      }),
    );
  }, [score, progress]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: CIRCUMFERENCE * (1 - progress.value),
  }));

  return (
    <View style={styles.wrap}>
      <Svg width={SIZE} height={SIZE}>
        {/* Track */}
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          stroke={colors.secondary}
          strokeWidth={STROKE}
          fill="none"
        />
        {/* Progress arc — starts at 12 o'clock */}
        <AnimatedCircle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          stroke={score != null ? color : colors.secondary}
          strokeWidth={STROKE}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
          animatedProps={animatedProps}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
        />
      </Svg>
      <View style={styles.center}>
        <Text style={[styles.value, score != null && { color: colors.foreground }]}>
          {score ?? '—'}
        </Text>
        {score != null && <Text style={styles.caption}>/ 100</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'center',
    width: SIZE,
    height: SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    fontSize: 42,
    fontWeight: '700',
    letterSpacing: -1,
    color: colors.mutedForeground,
  },
  caption: {
    ...type.caption,
    color: colors.mutedForeground,
    marginTop: -2,
  },
});
