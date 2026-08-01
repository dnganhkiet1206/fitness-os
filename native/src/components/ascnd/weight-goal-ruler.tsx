import { memo, useCallback, useMemo } from 'react';
import {
  FlatList,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { colors } from '@/constants/ascnd';

/**
 * The ruler itself — pulled out of the goal screen and memoised, because it
 * must not re-render while it is being scrolled.
 *
 * The screen above it holds the selected index in state so the big number can
 * follow the drag, which means a `setState` on every scroll frame. When the
 * list lived in that same component, every one of those frames re-rendered a
 * `FlatList` of hundreds of ticks — that is what made the drag feel like it
 * was catching on something. Split out, a frame re-renders two `Text` nodes
 * and nothing else.
 *
 * For that to hold, every prop has to keep its identity between renders: the
 * data, the item renderer, the layout function and the content padding are all
 * memoised, and the two callbacks are `useCallback`ed by the parent. An inline
 * arrow anywhere here would defeat the whole thing silently.
 *
 * ── how far it coasts ──
 *
 * A short glide, and the number is chosen rather than named.
 *
 * iOS deceleration is a per-frame multiplier, so the distance a flick travels
 * scales with roughly `1 / (1 − rate)`. That is 10 for `fast` (0.9) and 500
 * for `normal` (0.998) — the two named settings are a factor of fifty apart,
 * with nothing in between, which is why this ended up as a literal.
 *
 * Both extremes were tried here and both were wrong. `normal` sent a flick a
 * couple of thousand points, fifty kilograms at this scale, past the end of
 * the scale and outrunning the renderer on the way, so what you watched while
 * it travelled was an empty strip. Then `disableIntervalMomentum` removed the
 * glide entirely, which stops it running away and leaves it feeling stuck to
 * the finger: a dial with no weight to it.
 *
 * 0.94 is 1.7× `fast`. A flick coasts on the order of a hundred points —
 * twenty-odd ticks, a couple of units — which is enough to read as a slide and
 * still lands somewhere you meant. `snapToInterval` finishes it on an exact
 * tick: iOS picks the snap from where the momentum was heading, so only the
 * last few points are adjusted.
 *
 * The scale is what makes this liveable now. At 4pt a tick, a hundred points
 * of coast is twenty-five marks going past — visibly a slide. The same coast
 * at the old 12pt tick was eight marks, which is why `fast` read as no glide
 * at all back then.
 *
 * The window is generous to match. Each tick is two plain views with no text
 * or image in it, so keeping several screens' worth either side rendered costs
 * almost nothing, and a coast of a hundred points never reaches an unrendered
 * edge.
 */

/**
 * Points between ticks — how far the finger travels for one tenth of a unit.
 *
 * 4, which puts a whole kilogram 40pt apart and about ten of them on screen.
 * There is a real trade here and it is worth naming: finer values mean more
 * ticks mean more dragging for the same distance travelled, unless the ticks
 * get narrower. At the old half-kilo steps a kilogram was 24pt; a tenth-kilo
 * ruler at the same 12pt tick would have made it 120, which is five times the
 * work to move the same amount. 4pt gets most of that back while leaving the
 * ticks far enough apart to read as separate marks rather than as a smear.
 */
export const TICK_W = 4;

/** every Nth tick is drawn tall — a whole unit, at a tenth per tick */
const MAJOR_EVERY = 10;

export const Ruler = memo(function Ruler({
  count,
  width,
  listRef,
  onScroll,
  onContentSizeChange,
}: {
  count: number;
  width: number;
  listRef: React.RefObject<FlatList<number> | null>;
  onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onContentSizeChange: () => void;
}) {
  const data = useMemo(() => Array.from({ length: count }, (_, i) => i), [count]);

  // Half a screen at each end, so the first and last values can reach the
  // middle. Padding rather than spacer items, so item offsets stay index×TICK_W.
  const contentContainerStyle = useMemo(
    () => ({ paddingHorizontal: (width - TICK_W) / 2 }),
    [width],
  );

  const renderItem = useCallback(
    ({ item }: { item: number }) => (
      <View style={styles.slot}>
        <View style={[styles.tick, item % MAJOR_EVERY === 0 && styles.tickMajor]} />
      </View>
    ),
    [],
  );

  const getItemLayout = useCallback(
    (_: ArrayLike<number> | null | undefined, i: number) => ({ length: TICK_W, offset: TICK_W * i, index: i }),
    [],
  );

  const keyExtractor = useCallback((i: number) => String(i), []);

  return (
    <FlatList
      ref={listRef}
      data={data}
      horizontal
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      getItemLayout={getItemLayout}
      contentContainerStyle={contentContainerStyle}
      showsHorizontalScrollIndicator={false}
      // A short glide, then an exact tick — see the note above
      snapToInterval={TICK_W}
      decelerationRate={0.94}
      onContentSizeChange={onContentSizeChange}
      onScroll={onScroll}
      // Every frame. A tick is 12pt, so a slow drag crosses one in a couple of
      // frames — anything coarser turns the clicks into clusters with gaps.
      scrollEventThrottle={1}
      initialNumToRender={48}
      maxToRenderPerBatch={48}
      windowSize={11}
    />
  );
});

const RULER_H = 74;

const styles = StyleSheet.create({
  slot: { width: TICK_W, alignItems: 'center', justifyContent: 'flex-end', height: RULER_H },
  // 1pt at 4pt spacing: a hairline with three times its own width of gap, so
  // the ruler reads as marks. Any thicker and it closes up into a grey band.
  tick: { width: 1, height: 18, backgroundColor: colors.foreground, opacity: 0.3 },
  tickMajor: { width: 1.5, height: 34, opacity: 0.7 },
});
