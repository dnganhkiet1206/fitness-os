import { useEffect, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
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
 * metric on a card fills with the same iOS-smooth easing.
 *
 * ── it slides, it does not grow ──
 *
 * The fill used to animate `width: '{p}%'`. A percentage width is a *layout*
 * value, so every frame of the fill re-ran Yoga on this subtree; the fill is
 * the one thing on screen that has no business asking the layout engine
 * anything, since it only ever changes how much of a rectangle you can see.
 *
 * So the fill is now permanently the full width of the track and slides in
 * from the left under the track's `overflow: 'hidden'`. Transform only —
 * composited, no layout, no re-measure.
 *
 * ── why translate and not scale ──
 *
 * `scaleX` is the reflex here and it is wrong for this bar, because the fill
 * has rounded ends. Scaling squashes the cap horizontally: at 15% a 2pt radius
 * becomes 0.3pt and the end reads as cut off rather than round. Rendered both
 * against the original at 6× to be sure rather than reasoning about it — the
 * translated version covers the original exactly at every value, the scaled one
 * leaves the original's cap showing past its own.
 *
 * Sliding keeps the right cap at its true radius, and the left end is shaped by
 * the track's own corner because the track is what clips it.
 *
 * ── the measurement ──
 *
 * Transforms need points, not percentages, so the track measures itself once.
 * The fill waits for that measurement rather than rendering at translate 0,
 * which for one frame would be a full bar.
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
  const [track, setTrack] = useState(0);

  useEffect(() => {
    p.value = withDelay(delay, withTiming(target, { duration, easing: EASE }));
  }, [target, delay, duration, p]);

  const measure = (e: LayoutChangeEvent) => {
    const { width } = e.nativeEvent.layout;
    setTrack((prev) => (prev === width ? prev : width));
  };

  /* 0% parks the fill exactly one track-width to the left, 100% brings it home.
     Everything between is the same rectangle, further along. */
  const fill = useAnimatedStyle(() => ({
    transform: [{ translateX: -track * (1 - p.value / 100) }],
  }));

  return (
    <View
      onLayout={measure}
      style={[{ height, borderRadius: r, backgroundColor: trackColor, overflow: 'hidden' }, style]}>
      {track > 0 ? (
        <Animated.View style={[styles.fill, { borderRadius: r, backgroundColor: color }, fill]} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { height: '100%', width: '100%' },
});
