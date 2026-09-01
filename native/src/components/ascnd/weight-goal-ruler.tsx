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
 * The number is chosen rather than named.
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
 * 0.97 is 3.3× `fast`, and it was reached by stepping up rather than down:
 * 0.94 (1.7×) coasted a couple of units and still read as stiff. A flick now
 * carries on the order of two hundred points — fifty ticks, about five units —
 * which is a throw you can feel, and a twentieth of what `normal` was doing.
 * `snapToInterval` finishes it on an exact tick: iOS picks the snap from where
 * the momentum was heading, so only the last few points are adjusted.
 *
 * The tick scale is what makes this safe. At 4pt a tick, two hundred points of
 * coast is fifty marks going past — plainly a slide — while the value has only
 * moved five units. The same coast at the old 12pt half-unit tick would have
 * been sixteen marks and eight units: less to look at, and more damage done.
 *
 * The window is generous to match. Each tick is two plain views with no text
 * or image in it, so keeping several screens' worth either side rendered costs
 * almost nothing, and a coast of two hundred points never reaches an
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

/** ticks in a whole unit, at a tenth of a unit per tick */
const PER_UNIT = 10;

export const Ruler = memo(function Ruler({
  count,
  min10,
  width,
  listRef,
  onScroll,
  onContentSizeChange,
}: {
  count: number;
  /**
   * The value of index 0, in tenths of a display unit.
   *
   * ── it is here because "every tenth tick is tall" was wrong in pounds ──
   *
   * The rule used to be `index % 10 === 0`, which is a statement about the
   * LIST, not about the scale. It is right in kilograms only by accident:
   * index 0 is 30.0 kg, so `min10` is 300 and every tenth index does land on a
   * whole kilogram.
   *
   * In pounds index 0 is 66.1 lb (`min10` 661), so the tall marks fall on
   * 66.1, 67.1, 68.1 — the ruler never marks a whole pound, anywhere along its
   * 5 954 ticks. Nothing reported it, because an evenly spaced row of tall
   * marks looks correct no matter where it starts; only working out what value
   * one of them stands for finds it.
   *
   * Reading the VALUE instead of the index makes the structure follow the
   * scale it is drawn for, in both units.
   */
  min10: number;
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
        <View style={[styles.tick, (min10 + item) % PER_UNIT === 0 && styles.tickMajor]} />
      </View>
    ),
    /* Not `[]`, and that is safe: `min10` changes when the display unit
       changes, never during a drag. What must never appear in here is a value
       that moves with the scroll — that is the re-render this file was split
       out to stop. */
    [min10],
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
      // A real glide, then an exact tick — see the note above
      snapToInterval={TICK_W}
      decelerationRate={0.97}
      onContentSizeChange={onContentSizeChange}
      onScroll={onScroll}
      // Every frame. A tick is 4pt, so at any real dragging speed several go
      // past between frames — anything coarser turns the clicks into clusters
      // with gaps, and misses whole-unit crossings altogether.
      scrollEventThrottle={1}
      initialNumToRender={48}
      maxToRenderPerBatch={48}
      windowSize={11}
    />
  );
});

/**
 * Height of the whole ruler strip.
 *
 * Exported because the screen has to size its own container and its needle to
 * match — the two were separate constants that happened to agree, which is a
 * pair of numbers waiting to drift apart.
 */
export const RULER_H = 96;

const styles = StyleSheet.create({
  slot: { width: TICK_W, alignItems: 'center', justifyContent: 'flex-end', height: RULER_H },
  /*
   * Tall marks, thin marks.
   *
   * Height is what makes the ruler read as an instrument rather than a strip
   * of texture, and it is free: the marks are further apart vertically, not
   * horizontally, so nothing about the drag changes.
   *
   * Width is not free. At 4pt spacing a 1pt mark has three times its own width
   * of gap around it, which is what keeps it a mark; take it to 2 and the
   * ruler closes up into a grey band. Only the whole-unit marks are widened,
   * and they are one in ten.
   */
  tick: { width: 1, height: 28, backgroundColor: colors.foreground, opacity: 0.3 },
  tickMajor: { width: 2, height: 50, opacity: 0.7 },
});
