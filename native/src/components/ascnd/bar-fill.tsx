import { useEffect } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { duration } from '@/constants/motion';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

/**
 * The fill inside a progress track, moving to its new length instead of jumping.
 *
 * ── why this exists ──
 *
 * Six tracks were drawn this way, and all six were the same four lines:
 *
 *     <View style={styles.barTrack}>
 *       <View style={[styles.barFill, { width: `${pct}%` }]} />
 *     </View>
 *
 * Ticking an exercise off, gaining XP, typing a gram into the food editor —
 * every one of them repainted the bar at its new length between two frames.
 * A length that changes without moving reads as a redraw, not as progress; the
 * one thing a bar is for is showing a quantity *arriving*, and none of them did.
 *
 * One rule, six copies, and none of the copies knew it — the shape this
 * repository keeps meeting. So it lives here once.
 *
 * ── why scaleX and not width ──
 *
 * `tools/motion.mjs` bans animating layout properties (`width` is in its
 * `LAYOUT_PROPS`) because a value the layout engine owns has to re-run layout
 * on every frame. Its own note says: "nếu chỉ là 'cho hiện ra' thì dùng
 * transform/opacity". A bar is the textbook case — the fill is laid out once at
 * full width and scaled horizontally from its left edge, so the picture is
 * identical and the layout engine is never asked anything.
 *
 * `transformOrigin` was checked, not assumed: it is declared in
 * `react-native/Libraries/StyleSheet/StyleSheetTypes.d.ts:296` on the RN 0.86
 * this project builds against.
 *
 * One honest cost: scaling squashes the fill's rounded caps horizontally, so at
 * a very short length its right end is slightly flatter than a `width` fill's
 * would be. On these tracks the radius is 1.5–3px, so the difference is under a
 * pixel — cheaper than re-running layout sixty times a second for it.
 *
 * ── why it does not animate on first draw ──
 *
 * It starts *at* the value and moves only when the value changes. Filling from
 * zero on mount looks good once and becomes a wait afterwards: `session-row`
 * draws one of these per workout inside a scrolling list, so a mount animation
 * would replay every time a row was recycled into view. And a first draw is not
 * a cut — there was nothing there to cut away from.
 *
 * `duration.move` with an ease-out. `move` is the vocabulary's "control
 * sliding to a new position", which is what a fill changing length is, and
 * picking by distance rather than by importance is that file's stated rule —
 * these tracks are 4–6px high and under a screen wide. It sits inside NN/g's
 * 100–500ms band ("past 500ms
 * starts to feel like a real drag"), and ease-out is the curve for something
 * coming to rest — it "allows the eye time to focus on the element as it comes
 * to rest". Reduce Motion skips straight to the value.
 */
const FILL_MS = duration.move;
const FILL_EASE = Easing.out(Easing.cubic);

export function BarFill({
  ratio,
  style,
  min = 0,
}: {
  /** 0..1. Values outside are clamped — a bar can only ever be a bar. */
  ratio: number;
  /** The caller's fill style: colour, height, radius. Width is this component's. */
  style?: StyleProp<ViewStyle>;
  /**
   * A floor, in the same 0..1 units, for tracks that must stay visible when the
   * quantity is real but tiny — `session-row` shows a sliver at 3% rather than
   * nothing, so "a light session" and "no session" cannot look the same.
   */
  min?: number;
}) {
  /*
    `ratio > 0` rather than a finiteness test, and the difference is a number
    shown wrong: `Number.isFinite(x) ? x : 0` sent `Infinity` — what `have / 0`
    gives when `have` is positive — to an EMPTY bar, when a numerator that has
    overflowed its denominator is the one case that unambiguously means full.
    `NaN` (`0 / 0`, genuinely indeterminate) still lands on 0, because that one
    is missing data and missing data must not become a length.

    Written as a comparison it is also total: `NaN > 0`, `undefined > 0` and
    `-Infinity > 0` are all false, so nothing can reach `Math.min` as a
    non-number and come back out as `NaN`.
  */
  const target = Math.max(min, Math.min(1, ratio > 0 ? ratio : 0));
  const reduceMotion = useReducedMotion();
  const grown = useSharedValue(target);

  useEffect(() => {
    grown.value = reduceMotion ? target : withTiming(target, { duration: FILL_MS, easing: FILL_EASE });
  }, [target, reduceMotion, grown]);

  const fill = useAnimatedStyle(() => ({ transform: [{ scaleX: grown.value }] }));

  return <Animated.View pointerEvents="none" style={[styles.base, style, fill]} />;
}

const styles = StyleSheet.create({
  /* Laid out full width once; the transform does the rest. `transformOrigin`
     keeps it pinned to the left edge, otherwise it would shrink toward centre
     and the bar would grow out of the middle of its own track. */
  base: { width: '100%', transformOrigin: 'left' },
});
