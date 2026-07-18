import { useEffect } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

const EASE = Easing.bezier(0.16, 1, 0.3, 1);

/**
 * A vertical chart column that grows up from the bottom on mount instead of
 * appearing at full height. Meant to sit inside a bottom-anchored track
 * (justifyContent: 'flex-end'); the height is driven on the UI thread so a
 * row of bars can rise together with a per-bar stagger.
 */
export function ChartBar({
  heightPct,
  color,
  radius = 4,
  delay = 0,
  duration = 700,
  style,
}: {
  heightPct: number;
  color: string;
  radius?: number;
  delay?: number;
  duration?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const target = Math.min(Math.max(heightPct, 0), 100);
  const h = useSharedValue(0);

  useEffect(() => {
    h.value = withDelay(delay, withTiming(target, { duration, easing: EASE }));
  }, [target, delay, duration, h]);

  const grow = useAnimatedStyle(() => ({ height: `${h.value}%` }));

  return <Animated.View style={[styles.bar, { borderRadius: radius, backgroundColor: color }, grow, style]} />;
}

const styles = StyleSheet.create({
  bar: { width: '100%' },
});
