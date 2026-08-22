import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, { Easing, useAnimatedStyle, withTiming } from 'react-native-reanimated';

import { Icon } from '@/components/ascnd/icon';
import { colors, radius, spacing, type } from '@/constants/ascnd';
import { useReducedMotion } from '@/hooks/use-reduced-motion';

/**
 * One segmented control, and the selection travels between segments.
 *
 * ── what this replaced ──
 *
 * Five copies of the same control: nutrition, progress, the shop, the mascot
 * room, and a local `Segmented` inside `edit-profile`. All five did the same
 * thing the same way — map the options, swap a background colour on whichever
 * one matched — and none of them moved. Pressing a segment cut the highlight
 * from one box to another between frames, which is the difference between a
 * control that responds and one that merely changes.
 *
 * Five copies also meant five sets of paddings and radii drifting apart, and
 * five places to fix anything found here.
 *
 * ── why a travelling pill and not a fade ──
 *
 * A segmented control is a spatial statement: *this one, out of these*. When
 * the highlight moves, the movement is the answer to which one — it carries
 * the relationship between where you were and where you are, and a cross-fade
 * throws that away. Apple's own segmented controls slide for this reason.
 *
 * ── and why it is a transform ──
 *
 * The pill is one segment wide and moves by `translateX` alone. Nothing about
 * its geometry animates: no `left`, no `width`. `tools/motion.mjs` exists in
 * this repository because animating layout re-runs layout every frame, and it
 * caught exactly that mistake in the companion a few commits ago.
 *
 * The width is a fraction of the measured row rather than a number, which is
 * what lets `translateX` do the whole job: with every segment the same width,
 * position `i` is `i × width` and there is nothing to resize.
 */

export interface SegmentOption<K extends string> {
  key: K;
  label: string;
  /** optional leading glyph — nutrition and progress use one, the shop does not */
  icon?: React.ComponentProps<typeof Icon>['icon'];
}

/**
 * How long the pill takes to cross.
 *
 * Nielsen Norman Group put the usable band at 100–500ms and reserve the top of
 * it for large movements; past 500ms an animation "starts to feel like a real
 * drag". This is a short hop inside one control, so it sits low in the band.
 *
 * Ease-out, because the pill is arriving: "starts quickly but slows down…
 * makes the animation feel responsive, but allows the eye time to focus on the
 * element as it comes to rest." Linear is explicitly ruled out there — it
 * "looks weird and unnatural".
 */
const SLIDE_MS = 220;

export function Segmented<K extends string>({
  options,
  value,
  onChange,
  height = 44,
  compact = false,
}: {
  options: readonly SegmentOption<K>[];
  value: K;
  onChange: (key: K) => void;
  /** 44 by default — Apple's floor for a touch target */
  height?: number;
  /** the mascot room's row is a smaller control inside a card */
  compact?: boolean;
}) {
  const [row, setRow] = useState(0);
  const reduceMotion = useReducedMotion();

  const index = Math.max(0, options.findIndex((o) => o.key === value));
  const pad = 3;
  const seg = row > 0 ? (row - pad * 2) / options.length : 0;

  /*
    Only the transform is animated.

    `width` is a plain style below, not a member of this block. It changes when
    the row is measured — a rotation, a split view — and never between frames,
    so it belongs to React rather than to the UI thread. `tools/motion.mjs`
    flags any layout property inside `useAnimatedStyle` for exactly this reason,
    and it flagged this file's first version.
  */
  const pill = useAnimatedStyle(() => ({
    /* Reduce Motion is a request about movement, not about which segment is
       selected — so it arrives, it just does not travel. */
    transform: [
      { translateX: reduceMotion ? index * seg : withTiming(index * seg, { duration: SLIDE_MS, easing: Easing.out(Easing.cubic) }) },
    ],
  }));

  const onLayout = (e: LayoutChangeEvent) => {
    const { width } = e.nativeEvent.layout;
    setRow((p) => (Math.abs(p - width) < 1 ? p : width));
  };

  const r = compact ? radius.full : radius.sm;

  return (
    <View style={[styles.row, { borderRadius: r, padding: pad }]} onLayout={onLayout}>
      {/*
        Drawn before the segments so it sits behind the labels. It is only
        rendered once the row has been measured — a pill one frame wide, sliding
        in from nothing, is a flash nobody asked for.
      */}
      {seg > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.pill,
            { top: pad, bottom: pad, width: seg, borderRadius: compact ? radius.full : r - pad },
            pill,
          ]}
        />
      ) : null}

      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={o.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={o.label}
            style={[styles.seg, { height }]}
            onPress={() => {
              if (on) return;
              Haptics.selectionAsync();
              onChange(o.key);
            }}>
            {o.icon ? (
              <Icon icon={o.icon} size={13} color={on ? colors.foreground : colors.mutedForeground} />
            ) : null}
            <Text style={[styles.label, on && styles.labelOn]} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', backgroundColor: 'rgba(24,24,27,0.6)' },
  /* Positioned from the left and moved by transform only — see the note above
     about `tools/motion.mjs`. */
  pill: { position: 'absolute', left: 3, backgroundColor: colors.accent },
  seg: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  label: { ...type.caption, fontWeight: '600', color: colors.mutedForeground },
  labelOn: { color: colors.foreground },
});
