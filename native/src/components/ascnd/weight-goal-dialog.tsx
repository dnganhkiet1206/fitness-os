import * as Haptics from 'expo-haptics';
import { ArrowLeft } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { Icon } from '@/components/ascnd/icon';
import { Ruler, RULER_H, TICK_W } from '@/components/ascnd/weight-goal-ruler';
import { colors, radius, spacing, type } from '@/constants/ascnd';
import type { useI18n } from '@/hooks/use-app-settings';
import type { WeightUnit } from '@/lib/units';
import { displayWeight, weightLabel, weightToKg } from '@/lib/units';

/**
 * Set a target weight — a full screen with a ruler you drag past a fixed mark.
 *
 * A typed number was the previous version and it was the wrong instrument. A
 * target weight is not really entered, it is *chosen*: you already know the
 * neighbourhood and what you are deciding is how far from today to put it. A
 * ruler shows exactly that — where you are on the scale, how much is on either
 * side, and how far one nudge moves you — and a text field shows none of it.
 * It also never opens a keyboard over the thing you are trying to look at.
 *
 * ── the ruler is a list, and it lives in its own file ──
 *
 * A `FlatList`, so only the ticks near the viewport exist at any moment. Drawn
 * instead, the full 30–300 kg range at tenth-of-a-kilo steps is 2 701 marks
 * across eleven thousand points of width — one enormous rasterised texture to
 * scroll a window across. Windowing makes the range free: pounds needs six
 * thousand ticks and costs exactly the same.
 *
 * It is `memo`ised in `weight-goal-ruler`, and separate for a reason: this
 * screen `setState`s on every scroll frame so the big number can follow the
 * drag, and while the list was in here that re-rendered hundreds of ticks
 * sixty times a second. Everything handed to it — including `onScroll` and
 * `onContentSizeChange` below — has to keep its identity between renders or
 * the split buys nothing.
 *
 * Its ends are container padding, not spacer items, so item offsets stay
 * `index × TICK_W`: the tick under the mark is exactly `index × TICK_W`, with
 * the padding accounted for by the viewport rather than by the arithmetic.
 *
 * ── the number comes from the scroll position ──
 *
 * `Math.round(offsetX / TICK_W)` is the selected index, and `snapToInterval`
 * keeps rest positions on exact ticks, so the reading can never sit between
 * two values. Nothing is committed while dragging: `Done` writes, backing out
 * leaves the stored target alone.
 *
 * ── getting it to the right place on the first open ──
 *
 * Harder than it looks, and it was wrong: the ruler opened somewhere arbitrary
 * and dragged from there, so the number under the mark meant nothing.
 *
 * `initialScrollIndex` is the obvious tool and it is the broken one here. It
 * positions using `getItemLayout`, whose offsets are item-relative and know
 * nothing about the half-screen of container padding on each end, so it lands
 * short by that padding — and it runs against a list the modal has not
 * finished laying out, during a slide animation, which is how it ends up
 * nowhere in particular.
 *
 * `onContentSizeChange` is the reliable signal instead: it fires once the
 * content has actually been measured, which is the first moment a scroll
 * offset means anything. Positioning happens there, once per open, guarded by
 * a ref.
 *
 * Until that has happened `onScroll` is ignored entirely. Otherwise the
 * layout's own transient offsets get read as the user choosing values —
 * which is where the phantom movement came from, and a burst of haptics with
 * it.
 *
 * ── it works in the display unit ──
 *
 * The ruler is laid out in whatever unit the app shows and converted to
 * kilograms on save, a tenth of a unit per tick either way. A tenth of a pound
 * is finer than a tenth of a kilogram, which is harmless — the store keeps two
 * decimal places of a kilogram, so no two ticks can round onto the same
 * stored value.
 */

/** the range the store clamps to, in kg */
const MIN_KG = 30;
const MAX_KG = 300;

export function WeightGoalDialog({
  visible,
  goalKg,
  currentKg,
  unit,
  i18n,
  onSave,
  onClose,
}: {
  visible: boolean;
  /** the target as stored, or null when none is set */
  goalKg: number | null;
  /** latest weigh-in — seeds the ruler, and says which way the goal points */
  currentKg: number | null;
  unit: WeightUnit;
  i18n: ReturnType<typeof useI18n>;
  onSave: (kg: number | null) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const wl = weightLabel(unit);
  const list = useRef<FlatList<number>>(null);

  /**
   * One tick is a tenth of a unit — 50, 50.1, … 50.9, 51.
   *
   * The arithmetic is done in tenths as whole numbers rather than in steps of
   * `0.1`, because there are 2 700 of them between 30 and 300 kg and floating
   * point does not survive that: `30 / 0.1` is already 299.999…, and adding a
   * tenth to itself a few thousand times drifts far enough to land the ruler
   * between values. Integers cannot drift; the division back to a real number
   * happens once, at the end.
   */
  const min10 = Math.ceil(displayWeight(MIN_KG, unit) * 10);
  const max10 = Math.floor(displayWeight(MAX_KG, unit) * 10);
  const count = max10 - min10 + 1;

  const valueAt = useCallback((i: number) => (min10 + i) / 10, [min10]);

  /** where the ruler opens: the existing target, else today's weight, else 70kg */
  const seedIndex = useMemo(() => {
    const seedKg = goalKg ?? currentKg ?? 70;
    return Math.max(0, Math.min(count - 1, Math.round(displayWeight(seedKg, unit) * 10) - min10));
  }, [goalKg, currentKg, unit, min10, count]);

  const [index, setIndex] = useState(seedIndex);

  /**
   * Whether the ruler has been put where it belongs for this opening.
   *
   * A ref, not state: it gates `onScroll`, which fires far more often than
   * anything should re-render, and flipping it must not itself cause a render
   * in the middle of a drag.
   */
  const placed = useRef(false);

  /**
   * The last index a haptic was fired for.
   *
   * A ref, and this is the whole reason the clicks did not track the notches.
   * `onScroll` used to compare against `index` from state — a value captured
   * when the handler was created. React does not necessarily re-render between
   * two scroll events, so several events in a row could see the same stale
   * `index`: crossing three ticks fired once, and coming back across the same
   * tick fired again. A ref is written synchronously inside the handler, so
   * every event compares against what the one before it actually saw.
   */
  const clicked = useRef(seedIndex);

  /**
   * Reseed on every open, not once on mount.
   *
   * The screen stays mounted between openings, so without this it would come
   * back showing wherever it was left — including a value that was abandoned
   * by backing out rather than saved.
   */
  useEffect(() => {
    if (!visible) {
      placed.current = false;
      return;
    }
    setIndex(seedIndex);
    clicked.current = seedIndex;
  }, [visible, seedIndex]);

  /**
   * The content has been measured — now an offset means something. Position
   * the ruler and start listening to it.
   */
  const onContentSizeChange = useCallback(() => {
    if (placed.current) return;
    list.current?.scrollToOffset({ offset: seedIndex * TICK_W, animated: false });
    clicked.current = seedIndex;
    placed.current = true;
  }, [seedIndex]);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    // Layout settling is not the user choosing a number
    if (!placed.current) return;
    const next = Math.max(0, Math.min(count - 1, Math.round(e.nativeEvent.contentOffset.x / TICK_W)));
    const prev = clicked.current;
    if (next === prev) return;
    clicked.current = next;
    setIndex(next);

    /*
     * Two feels, because a tick is a tenth now.
     *
     * Every tick gets the light picker click. Drag slowly and you feel each
     * tenth, which is the point of them being there.
     *
     * Crossing a whole unit gets something firmer. At any real dragging speed
     * the tenths arrive faster than the Taptic Engine will play them — it
     * manages about one every 30ms — so on their own they degrade into a buzz
     * that no longer corresponds to anything. Whole units are ten times
     * further apart, so they survive that ceiling and keep giving the drag a
     * structure you can feel.
     *
     * The test is a crossing, not equality: a fast drag steps over several
     * ticks between frames and can pass a whole unit without ever landing on
     * it.
     */
    if (Math.floor(next / 10) !== Math.floor(prev / 10)) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } else {
      Haptics.selectionAsync();
    }
  }, [count]);

  const value = valueAt(index);

  /**
   * Which way this goal points, from today's weight.
   *
   * Not from `profiles.goal` — that is what the person told onboarding they
   * were doing, and this is what the number they just chose actually means. If
   * the two disagree the number is the honest one.
   */
  const currentDisplay = currentKg != null ? displayWeight(currentKg, unit) : null;
  const intent =
    currentDisplay == null || Math.abs(value - currentDisplay) < 0.05
      ? i18n.nWeightGoalMaintain
      : value > currentDisplay
        ? i18n.nWeightGoalGain
        : i18n.nWeightGoalLose;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable
            hitSlop={8}
            style={({ pressed }) => [styles.back, pressed && styles.pressed]}
            onPress={() => {
              Haptics.selectionAsync();
              onClose();
            }}>
            <Icon icon={ArrowLeft} size={20} color={colors.foreground} />
          </Pressable>
          <Text style={styles.title}>{i18n.nWeightGoalEdit}</Text>
          {/* Balances the back button so the title sits centred */}
          <View style={styles.back} />
        </View>

        <View style={styles.stage}>
          <Text style={styles.intent}>{intent}</Text>
          {/* Always a decimal. Dropping it on whole numbers would change the
              string's width every tenth tick, and the number is centred — so
              it would twitch left and right the whole way through a drag. */}
          <Text style={styles.value}>
            {value.toFixed(1)} {wl}
          </Text>

          <View style={styles.ruler}>
            <Ruler
              count={count}
              width={width}
              listRef={list}
              onScroll={onScroll}
              onContentSizeChange={onContentSizeChange}
            />

            {/* Edge fade, so the ruler runs off the sides instead of being cut */}
            <View style={styles.fade} pointerEvents="none">
              <Svg width="100%" height="100%" preserveAspectRatio="none">
                <Defs>
                  <LinearGradient id="rulerFade" x1="0" y1="0" x2="1" y2="0">
                    <Stop offset="0" stopColor={colors.background} stopOpacity={1} />
                    <Stop offset="0.28" stopColor={colors.background} stopOpacity={0} />
                    <Stop offset="0.72" stopColor={colors.background} stopOpacity={0} />
                    <Stop offset="1" stopColor={colors.background} stopOpacity={1} />
                  </LinearGradient>
                </Defs>
                <Rect x="0" y="0" width="100%" height="100%" fill="url(#rulerFade)" />
              </Svg>
            </View>

            {/* The mark the ruler is read against — above the fade, so it stays
                at full strength while the ticks around it dim */}
            <View style={styles.needle} pointerEvents="none" />
          </View>
        </View>

        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          {/* Clearing is only offered when there is something to clear */}
          {goalKg != null ? (
            <Pressable
              style={({ pressed }) => [styles.ghost, pressed && styles.pressed]}
              onPress={() => {
                Haptics.selectionAsync();
                onSave(null);
                onClose();
              }}>
              <Text style={styles.ghostText}>{i18n.nWeightGoalClear}</Text>
            </Pressable>
          ) : null}
          <Pressable
            style={({ pressed }) => [styles.done, pressed && styles.pressed]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onSave(weightToKg(value, unit));
              onClose();
            }}>
            <Text style={styles.doneText}>{i18n.nWeightGoalDone}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },

  header: { height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.secondary,
  },
  title: { ...type.title2, flex: 1, textAlign: 'center', color: colors.foreground },

  // The number and the ruler sit together in the middle of the screen
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  intent: { ...type.body, color: colors.mutedForeground },
  value: {
    fontSize: 52,
    fontWeight: '700',
    letterSpacing: -1,
    color: colors.foreground,
    fontVariant: ['tabular-nums'],
    marginBottom: spacing.lg,
  },

  ruler: { height: RULER_H, alignSelf: 'stretch', justifyContent: 'center' },
  fade: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  // Taller than the whole-unit marks and wider than any of them, so the ruler
  // is read against it rather than it being mistaken for one more tick
  needle: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: 0,
    width: 3,
    height: 68,
    borderRadius: 1.5,
    backgroundColor: colors.foreground,
  },

  footer: { paddingHorizontal: spacing.md, gap: spacing.xs },
  done: {
    height: 56,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f5f5',
  },
  doneText: { ...type.headline, color: '#111111' },
  ghost: { alignItems: 'center', paddingVertical: spacing.sm },
  ghostText: { ...type.footnote, color: colors.mutedForeground },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
});
