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
 * ── the measurement, and the bug that lived in it ──
 *
 * Transforms need points, not percentages, so the track measures itself once.
 *
 * The measurement and the worklet used to live in the *same* component, and
 * that was wrong in a way no amount of reading the arithmetic reveals. It
 * showed up as **every macro bar sitting full on a day with nothing logged**.
 *
 * `useAnimatedStyle` keeps its `initial` value in a `useRef` and computes it
 * exactly once, on the hook's first render — `node_modules/react-native-
 * reanimated/lib/module/hook/useAnimatedStyle.js`, the `if
 * (!animatedUpdaterData.current)` branch. On that first render `track` is still
 * `0`, because the layout has not happened yet, so the initial style came out
 * as
 *
 *     translateX: -0 * (1 - 0 / 100)  ===  0
 *
 * and `translateX: 0` is the fill sitting exactly over the whole track. A full
 * bar. That value is then re-applied as the view's base style on **every**
 * React re-render, and the only thing that can overwrite it is the mapper —
 * which `startMapper(fun, inputs)` drives from the *shared values* in the
 * closure, so it runs when `p` moves and at no other time.
 *
 * At 0% `p` animates from 0 to 0 and therefore never moves. So the bar was
 * painted full, and nothing existed to paint it empty again. Every other value
 * looked fine, because there `p` really does travel and the mapper corrects the
 * position on its first frame — which is exactly why this was only ever visible
 * on an empty day.
 *
 * The fix is structural rather than a guard: the fill is its own component and
 * is not mounted until the width is known, so the hook's first evaluation — the
 * one that is frozen forever — already has the real number in it. Nothing about
 * the arithmetic changed.
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
  const [track, setTrack] = useState(0);

  const measure = (e: LayoutChangeEvent) => {
    const { width } = e.nativeEvent.layout;
    setTrack((prev) => (prev === width ? prev : width));
  };

  return (
    <View
      onLayout={measure}
      style={[{ height, borderRadius: r, backgroundColor: trackColor, overflow: 'hidden' }, style]}>
      {track > 0 ? (
        <Fill track={track} pct={pct} color={color} radius={r} delay={delay} duration={duration} />
      ) : null}
    </View>
  );
}

/**
 * The moving part, mounted only once the track has a width.
 *
 * ── it is a separate component on purpose ──
 *
 * Not for tidiness. `useAnimatedStyle` freezes the style it computes on its
 * first render and re-applies that frozen value on every subsequent one, so a
 * worklet that reads a measurement must not be *mounted* before the measurement
 * exists. Keeping the hook in the parent put its first evaluation at `track =
 * 0`, which is a full bar — see the note at the top of this file for what that
 * looked like on screen and why only 0% showed it.
 *
 * `track` arrives as a prop that is real on the first render of this component,
 * so the frozen initial style is the correct parked position and every re-render
 * re-applies *that*.
 */
function Fill({
  track,
  pct,
  color,
  radius,
  delay,
  duration,
}: {
  track: number;
  pct: number;
  color: string;
  radius: number;
  delay: number;
  duration: number;
}) {
  const target = Math.min(Math.max(pct, 0), 100);
  const p = useSharedValue(0);

  useEffect(() => {
    p.value = withDelay(delay, withTiming(target, { duration, easing: EASE }));
  }, [target, delay, duration, p]);

  /* 0% parks the fill exactly one track-width to the left, 100% brings it home.
     Everything between is the same rectangle, further along. */
  const fill = useAnimatedStyle(() => ({
    transform: [{ translateX: -track * (1 - p.value / 100) }],
  }));

  return <Animated.View style={[styles.fill, { borderRadius: radius, backgroundColor: color }, fill]} />;
}

const styles = StyleSheet.create({
  fill: { height: '100%', width: '100%' },
});
