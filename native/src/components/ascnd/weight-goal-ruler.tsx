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
 * ── it does not coast at all ──
 *
 * The ruler moves with the finger and stops when the finger lifts. No throw,
 * no travel after release: `disableIntervalMomentum` makes it settle on the
 * tick nearest where you let go, and `decelerationRate` is `fast` so what
 * little momentum is left dies immediately.
 *
 * This was arrived at from the other end, and the middle ground is the part
 * worth not repeating. `normal` (iOS 0.998) is the setting for a page of
 * content, where a flick should travel; on a ruler an ordinary flick carries a
 * couple of thousand points, which at this scale is five hundred ticks and
 * fifty kilograms — so the target being nudged ends up off the end of the
 * scale, and the throw outruns the renderer on the way, leaving an empty strip
 * to watch. A hand-picked 0.975 in between glided a few dozen ticks, which is
 * better and still moves the value further than anyone asked it to.
 *
 * The reason momentum is wrong here at all: a scroll view is normally
 * navigating something bigger than the screen, where speed is the point. This
 * is a control being set to one number. Throwing it is not a faster way to
 * choose — it is a way to lose the number you had.
 *
 * The window is still generous, now that nothing can outrun it. Each tick is
 * two plain views with no text or image in it, so keeping a few screens' worth
 * either side rendered costs almost nothing and a fast drag never reaches an
 * unrendered edge.
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
      // Settle on the tick nearest where the finger lifted, and nowhere else
      snapToInterval={TICK_W}
      disableIntervalMomentum
      decelerationRate="fast"
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
