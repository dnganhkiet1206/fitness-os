import { useEffect } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { colors } from '@/constants/ascnd';

// Same decelerate curve the rings use, so bars and rings fill in sync
const EASE = Easing.bezier(0.16, 1, 0.3, 1);

/**
 * A progress bar that animates its fill on mount / value change instead of
 * snapping — matches the motion of the readiness/nutrition rings so every
 * metric on a card fills with the same iOS-smooth easing. Width is driven
 * on the UI thread via a shared value.
 */
export function ProgressBar({
  pct,
  color = colors.primary,
  height = 4,
  radius,
  trackColor = 'rgba(24,24,27,0.4)',
  delay = 200,
  duration = 1000,
  style,
}: {
  pct: number;
  color?: string;
  height?: number;
  radius?: number;
  trackColor?: string;
  delay?: number;
  duration?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const r = radius ?? height / 2;
  const target = Math.min(Math.max(pct, 0), 100);
  const p = useSharedValue(0);

  useEffect(() => {
    p.value = withDelay(delay, withTiming(target, { duration, easing: EASE }));
  }, [target, delay, duration, p]);

  const fill = useAnimatedStyle(() => ({ width: `${p.value}%` }));

  return (
    <View style={[{ height, borderRadius: r, backgroundColor: trackColor, overflow: 'hidden' }, style]}>
      <Animated.View style={[styles.fill, { borderRadius: r, backgroundColor: color }, fill]} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { height: '100%' },
});
