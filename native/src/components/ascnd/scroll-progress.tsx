import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

/**
 * A bar that says there is more sideways, and how much.
 *
 * ── why the peeking tile was not enough ──
 *
 * The metric row scrolls, and the only thing announcing that was the third
 * tile being cut off at the edge. That is a weak signal and an unreliable one:
 * how much of a tile shows depends on the screen width, so on one phone it is
 * an obvious half-card and on another it is a sliver that reads as padding.
 * Somebody who never tried swiping had no reason to.
 *
 * ── a proportional bar rather than dots ──
 *
 * Dots would say "there are four pages", and there are not — it is one
 * continuous row that happens to be wider than the screen. The thumb's *width*
 * is the fraction you can see and its *position* is where in the row you are,
 * which answers both "is there more" and "how much more" without claiming a
 * structure the content does not have.
 *
 * ── it disappears when it has nothing to say ──
 *
 * Content that fits gets no bar at all. A track showing a full-width thumb is
 * furniture: it takes a row of the screen to tell you that you have seen
 * everything, which you can already see.
 *
 * ── the position is driven on the UI thread ──
 *
 * `scrollX` is a shared value written by `useAnimatedScrollHandler`, so the
 * thumb tracks the finger without a round trip through JS. Driving it from
 * `onScroll` state would re-render the whole assistant screen on every frame
 * of a flick — which on this page means the aura, the panels and the chart.
 */
export function ScrollProgress({
  x,
  viewport,
  content,
  tint,
}: {
  /** live horizontal offset, in points */
  x: SharedValue<number>;
  /** the visible width of the scroll view */
  viewport: number;
  /** the full width of its content */
  content: number;
  tint: string;
}) {
  const [track, setTrack] = useState(0);
  const measure = (e: LayoutChangeEvent) => {
    const { width } = e.nativeEvent.layout;
    setTrack((p) => (p === width ? p : width));
  };

  /* A hair of tolerance. Content and viewport are measured separately and a
     row that fits exactly can report a fraction of a point more than the box
     it sits in — enough to draw a full-width thumb that never moves. */
  const scrollable = content - viewport > 4;

  /** Never smaller than this, or a long row leaves a thumb you cannot see. */
  const MIN_THUMB = 28;
  const thumb = scrollable && track > 0
    ? Math.max(MIN_THUMB, (viewport / content) * track)
    : 0;

  const slide = useAnimatedStyle(() => {
    const span = content - viewport;
    const room = track - thumb;
    if (span <= 0 || room <= 0) return { transform: [{ translateX: 0 }] };
    /* Clamped, because a bounce carries the offset past both ends and an
       unclamped thumb walks out of its own track and back. */
    const p = Math.min(Math.max(x.value / span, 0), 1);
    return { transform: [{ translateX: p * room }] };
  });

  if (!scrollable) return null;

  return (
    <View style={styles.track} onLayout={measure}>
      {track > 0 ? (
        <Animated.View style={[styles.thumb, { width: thumb, backgroundColor: tint }, slide]} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  /* 3pt, and the same width as the row it belongs to. Thinner reads as a hair
     of noise under the cards; thicker starts to look like a control you can
     drag, which it is not. */
  track: {
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.10)',
    overflow: 'hidden',
  },
  thumb: { height: 3, borderRadius: 2, opacity: 0.65 },
});
