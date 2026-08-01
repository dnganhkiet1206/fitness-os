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
 * ── it coasts ──
 *
 * `decelerationRate` is normal, not fast. Fast is the right setting for a
 * pager, where a flick should move one card and stop; here it killed the
 * throw, so the ruler stopped dead under the finger instead of running on and
 * settling. `snapToInterval` still lands it on an exact tick — iOS picks the
 * snap from where the momentum was going to end, so the glide is kept and only
 * the last few points are adjusted.
 *
 * The window is deliberately generous. Each tick is two plain views with no
 * text or image in it, so rendering a few screens' worth either side is
 * cheap, and it is what stops a hard flick outrunning the renderer and
 * showing gaps.
 */

/** points between ticks — the drag distance of one step */
export const TICK_W = 12;

/** every Nth tick is drawn tall */
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
      // Lands on an exact tick without cutting the throw short
      snapToInterval={TICK_W}
      decelerationRate="normal"
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
  tick: { width: 1.5, height: 22, borderRadius: 1, backgroundColor: colors.foreground, opacity: 0.35 },
  tickMajor: { height: 40, opacity: 0.7 },
});
