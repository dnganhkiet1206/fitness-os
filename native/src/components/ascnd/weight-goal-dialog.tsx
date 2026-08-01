import * as Haptics from 'expo-haptics';
import { ArrowLeft } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { Icon } from '@/components/ascnd/icon';
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
 * ── the ruler is a list, not a drawing ──
 *
 * A `FlatList`, so only the forty-odd ticks near the viewport exist at any
 * moment. Drawn instead, the full 30–300 kg range at half-kilo steps is 541
 * marks across four thousand points of width — one enormous rasterised texture
 * to scroll a window across. Windowing makes the range free: pounds needs
 * twelve hundred ticks and costs exactly the same.
 *
 * Spacers at both ends, each half the screen wide, are what let the first and
 * last values reach the middle. They are padding on the content container
 * rather than list items, so item offsets stay `index × TICK_W` and
 * `getItemLayout` — which is what makes `initialScrollIndex` land accurately —
 * needs no correction for them.
 *
 * ── the number comes from the scroll position ──
 *
 * `Math.round(offsetX / TICK_W)` is the selected index, and `snapToInterval`
 * keeps rest positions on exact ticks, so the reading can never sit between
 * two values. Nothing is committed while dragging: `Done` writes, backing out
 * leaves the stored target alone.
 *
 * ── it works in the display unit ──
 *
 * The ruler is laid out in whatever unit the app shows, and converted to
 * kilograms on save. The step is half a unit for kilograms and a whole one for
 * pounds, so a tick is about the same real distance either way — half a pound
 * is a finer grain than anyone sets a goal to.
 */

/** the range the store clamps to, in kg */
const MIN_KG = 30;
const MAX_KG = 300;

/** points between ticks — the drag distance of one step */
const TICK_W = 12;

/** every Nth tick is drawn tall */
const MAJOR_EVERY = 10;

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

  // Half a kilogram, or a whole pound — roughly the same real distance
  const step = unit === 'kg' ? 0.5 : 1;
  const min = Math.ceil(displayWeight(MIN_KG, unit) / step) * step;
  const max = Math.floor(displayWeight(MAX_KG, unit) / step) * step;
  const count = Math.round((max - min) / step) + 1;

  const indices = useMemo(() => Array.from({ length: count }, (_, i) => i), [count]);
  const valueAt = useCallback((i: number) => Math.round((min + i * step) * 10) / 10, [min, step]);

  /** where the ruler opens: the existing target, else today's weight, else 70kg */
  const seedIndex = useMemo(() => {
    const seedKg = goalKg ?? currentKg ?? 70;
    const raw = (displayWeight(seedKg, unit) - min) / step;
    return Math.max(0, Math.min(count - 1, Math.round(raw)));
  }, [goalKg, currentKg, unit, min, step, count]);

  const [index, setIndex] = useState(seedIndex);

  /**
   * Reseed on every open, not once on mount.
   *
   * The screen stays mounted between openings, so without this it would come
   * back showing wherever it was left — including a value that was abandoned
   * by backing out rather than saved.
   */
  useEffect(() => {
    if (!visible) return;
    setIndex(seedIndex);
    // The list is not laid out on the same tick the modal becomes visible
    const t = setTimeout(() => {
      list.current?.scrollToOffset({ offset: seedIndex * TICK_W, animated: false });
    }, 0);
    return () => clearTimeout(t);
  }, [visible, seedIndex]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.max(0, Math.min(count - 1, Math.round(e.nativeEvent.contentOffset.x / TICK_W)));
    if (next !== index) {
      setIndex(next);
      // One tap per tick, the way a real dial feels
      Haptics.selectionAsync();
    }
  };

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
    currentDisplay == null || Math.abs(value - currentDisplay) < step / 2
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
          <Text style={styles.value}>
            {value % 1 === 0 ? value.toFixed(0) : value.toFixed(1)} {wl}
          </Text>

          <View style={styles.ruler}>
            <FlatList
              ref={list}
              data={indices}
              horizontal
              keyExtractor={(i) => String(i)}
              showsHorizontalScrollIndicator={false}
              // Rest positions land on exact ticks, so the reading can never
              // sit between two values
              snapToInterval={TICK_W}
              decelerationRate="fast"
              getItemLayout={(_, i) => ({ length: TICK_W, offset: TICK_W * i, index: i })}
              initialScrollIndex={seedIndex}
              contentContainerStyle={{ paddingHorizontal: (width - TICK_W) / 2 }}
              onScroll={onScroll}
              scrollEventThrottle={16}
              renderItem={({ item }) => (
                <View style={styles.tickSlot}>
                  <View style={[styles.tick, item % MAJOR_EVERY === 0 && styles.tickMajor]} />
                </View>
              )}
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

const RULER_H = 74;

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
  tickSlot: { width: TICK_W, alignItems: 'center', justifyContent: 'flex-end', height: RULER_H },
  tick: { width: 1.5, height: 22, borderRadius: 1, backgroundColor: colors.foreground, opacity: 0.35 },
  tickMajor: { height: 40, opacity: 0.7 },
  fade: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  needle: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: 0,
    width: 2.5,
    height: 54,
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
