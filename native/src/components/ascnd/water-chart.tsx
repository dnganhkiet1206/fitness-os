import { useEffect, useId, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Line, RadialGradient, Rect, Stop } from 'react-native-svg';

import { colors, spacing, type } from '@/constants/ascnd';
import type { useI18n } from '@/hooks/use-app-settings';
import { parseLocalDate } from '@/lib/local-date';
import { displayVolume } from '@/lib/units';
import { axisLabel, scaleTop } from '@/lib/water-scale';

const AnimatedRect = Animated.createAnimatedComponent(Rect);

/**
 * The week's water, drawn the way Health draws a metric.
 *
 * ── what was there before ──
 *
 * Seven flat bars normalised against the week's own maximum, with a day letter
 * under each and nothing else. Normalising against the maximum means the tallest
 * bar is always full height, so a week of 900ml days and a week of 3L days drew
 * exactly the same picture. There was no scale, so no bar could be read as a
 * quantity — only as "more than that one".
 *
 * ── the neon ──
 *
 * Each bar runs from a pale cyan at the top to `metricBlue` at the bottom, which
 * is the direction Health runs its own bars and is not arbitrary: a column lit
 * from above reads as a solid object, and the same column lit from below reads
 * as a hole. The top colour is the lighter one because that is where the light
 * would be.
 *
 * `metricBlue` at the base rather than something brighter is the "vừa mắt" part.
 * Water already owns that blue on this screen — the ring, the progress bar, the
 * quick-add buttons — and a chart in a second, louder blue would read as a
 * different metric. The neon comes from the gradient and the glow, not from
 * turning the hue up until it buzzes.
 *
 * ── the glow is stacked, not blurred ──
 *
 * `react-native-svg` declares the filter primitives and leaves them
 * unimplemented on native: `feGaussianBlur` and `feDropShadow` render nothing at
 * all. So the halo around each bar is three wider, fainter copies drawn behind
 * it, and the wash behind the plot is a radial pool with a five-stop falloff —
 * the same technique `ambient-light.tsx` uses for the page, for the same reason.
 *
 * A two-stop pool would be worse than none. A linear ramp *ends*: there is a
 * radius where it reaches zero and the eye finds that ring immediately. The long
 * dim tail is what keeps the bright part from having an outline.
 *
 * ── on the scale ──
 *
 * The ceiling is a round number at or above both the week's high and the daily
 * target, so the target is always somewhere on the chart rather than off the top
 * of it, and the axis reads 0 / half / ceiling like Health's does. Rounding is
 * to whatever step keeps the number speakable in the unit on screen: half-litres
 * for millilitres, sixteen ounces for ounces, because "2L" and "48 oz" are
 * quantities and "1,847" is a measurement.
 */

/** pale cyan at the top of a bar, `metricBlue` at its foot */
const BAR_TOP = '#8fe4ff';
const BAR_BOTTOM = colors.metricBlue;

/** the blue pool behind the plot — Health tints the area behind its bars */
const WASH = '#3ba6ff';
const WASH_PEAK = 0.1;

/** shared falloff: steep, then a tail that never quite lands */
const CURVE = [
  { at: 0, of: 1 },
  { at: 0.3, of: 0.55 },
  { at: 0.55, of: 0.25 },
  { at: 0.8, of: 0.08 },
  { at: 1, of: 0 },
] as const;

/** widths and opacities of the three fake-blur layers behind each bar */
const HALO = [
  { grow: 7, o: 0.05 },
  { grow: 4.5, o: 0.08 },
  { grow: 2, o: 0.12 },
] as const;

const PLOT_H = 150;
const AXIS_W = 40;
const GROW_MS = 720;
const GROW_EASE = Easing.bezier(0.16, 1, 0.3, 1);

function Bar({
  x,
  w,
  value,
  ceilingMl,
  met,
  index,
  gradId,
}: {
  x: number;
  w: number;
  value: number;
  ceilingMl: number;
  met: boolean;
  index: number;
  gradId: string;
}) {
  /*
    Zero is drawn as nothing, not as a sliver.

    The old chart floored every bar at 3% so an empty day still showed a stub,
    which puts a mark on the chart for water that was never drunk. An empty
    column is the honest drawing of an empty day, and the dashed gridline under
    it already says the day exists.
  */
  const frac = ceilingMl > 0 ? Math.min(1, value / ceilingMl) : 0;
  const full = frac * PLOT_H;

  const grow = useSharedValue(0);
  // In an effect, not in the render body. Assigning a shared value while
  // rendering restarts the animation on every re-render — and this card
  // re-renders on every sip logged, so the whole week would jump back to zero
  // and climb again each time somebody tapped +250ml.
  //
  // `withTiming` defaults to ReduceMotion.System, so this already holds still
  // for anyone who asked it to — see `use-reduced-motion.ts`.
  useEffect(() => {
    grow.value = withDelay(index * 55, withTiming(1, { duration: GROW_MS, easing: GROW_EASE }));
  }, [index, grow]);

  const rect = useAnimatedProps(() => ({
    y: PLOT_H - full * grow.value,
    height: full * grow.value,
  }));

  if (value <= 0) return null;

  // Rounded like a capsule, capped so a short bar does not turn into a lozenge
  const r = Math.min(w / 2, 5);
  // A day under target keeps the same colour and loses some of its light —
  // grey next to neon reads as a broken bar rather than a quiet one.
  const dim = met ? 1 : 0.45;

  return (
    <>
      {HALO.map((h) => (
        <AnimatedRect
          key={h.grow}
          x={x - h.grow}
          width={w + h.grow * 2}
          rx={r + h.grow}
          fill={BAR_BOTTOM}
          opacity={h.o * dim}
          animatedProps={rect}
        />
      ))}
      <AnimatedRect x={x} width={w} rx={r} fill={`url(#${gradId})`} opacity={dim} animatedProps={rect} />
    </>
  );
}

export function WaterChart({
  days,
  target,
  unit,
  lang,
  i18n,
}: {
  /** oldest first, totals in millilitres — the storage unit, converted here */
  days: { date: string; total: number }[];
  /** the daily target in millilitres, so the ceiling never hides it */
  target: number;
  unit: 'ml' | 'oz';
  lang: 'vi' | 'en';
  i18n: ReturnType<typeof useI18n>;
}) {
  /*
    Measured, not `width="100%"`.

    A percentage on `<Svg>` resolves against the last frame the view was laid
    out at, so the first paint of a card that has just changed size draws the
    whole chart at the old width. Pixels from `onLayout` cannot be stale.
  */
  const [w, setW] = useState(0);

  /*
    `useId`, because SVG ids are document-global.

    Two charts with the same gradient id is not two charts — it is one gradient,
    and whichever mounted last wins for both. That has already happened once in
    this app, on the small rings, where the amber one drew blue.
  */
  const uid = useId();
  const barGrad = `waterBar-${uid}`;
  const wash = `waterWash-${uid}`;

  const best = Math.max(0, ...days.map((d) => d.total));
  const top = scaleTop(Math.max(best, target), unit);

  const avg = days.length ? days.reduce((s, d) => s + d.total, 0) / days.length : 0;
  const avgLabel =
    unit === 'oz' ? `${displayVolume(avg, 'oz')} oz` : `${(avg / 1000).toFixed(2)}L`;

  const plotW = Math.max(0, w - AXIS_W);
  const slot = days.length ? plotW / days.length : 0;
  // Bars sit in the middle of their slot with air on both sides, so the dashed
  // tick at the slot's edge stays a tick rather than becoming a bar's outline.
  const barW = Math.max(4, slot * 0.42);

  return (
    <View>
      {/* Health's own header: what the number is, the number, then the span */}
      <Text style={styles.eyebrow}>{i18n.nAverage}</Text>
      <Text style={styles.big}>{avgLabel}</Text>
      <Text style={styles.span}>{i18n.nLast7Days}</Text>

      <View style={styles.plot} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
        {w > 0 ? (
          <Svg width={w} height={PLOT_H}>
            <Defs>
              <LinearGradient id={barGrad} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={BAR_TOP} />
                <Stop offset="1" stopColor={BAR_BOTTOM} />
              </LinearGradient>
              <RadialGradient id={wash} cx="0.5" cy="0.85" rx="0.75" ry="0.9">
                {CURVE.map((p) => (
                  <Stop key={p.at} offset={p.at} stopColor={WASH} stopOpacity={WASH_PEAK * p.of} />
                ))}
              </RadialGradient>
            </Defs>

            {/* the blue room the bars stand in */}
            <Rect x="0" y="0" width={plotW} height={PLOT_H} fill={`url(#${wash})`} />

            {/* value gridlines: 0, half, ceiling — the baseline carries weight */}
            {[0, 0.5, 1].map((f) => (
              <Line
                key={f}
                x1="0"
                x2={plotW}
                y1={PLOT_H - f * PLOT_H}
                y2={PLOT_H - f * PLOT_H}
                stroke={colors.foreground}
                strokeOpacity={f === 0 ? 0.16 : 0.08}
                strokeWidth={0.5}
              />
            ))}

            {/* one dashed tick per day, at the slot's leading edge */}
            {days.map((d, i) => (
              <Line
                key={d.date}
                x1={i * slot}
                x2={i * slot}
                y1="0"
                y2={PLOT_H}
                stroke={colors.foreground}
                strokeOpacity={0.07}
                strokeWidth={0.5}
                strokeDasharray={[2, 4]}
              />
            ))}

            {days.map((d, i) => (
              <Bar
                key={d.date}
                x={i * slot + (slot - barW) / 2}
                w={barW}
                value={d.total}
                ceilingMl={top.ml}
                met={d.total >= target}
                index={i}
                gradId={barGrad}
              />
            ))}
          </Svg>
        ) : null}

        {/* Values on the right, the way Health puts them — out of the way of
            the bars, and reading top-down like the scale does. */}
        <View style={styles.axis} pointerEvents="none">
          {[1, 0.5, 0].map((f) => (
            <Text key={f} style={styles.axisText}>
              {axisLabel(top.display * f, unit)}
            </Text>
          ))}
        </View>
      </View>

      {/* Day letters, each centred under its own slot */}
      <View style={[styles.dayRow, { width: plotW }]}>
        {days.map((d) => (
          <Text key={d.date} style={styles.dayText}>
            {parseLocalDate(d.date).toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-US', {
              weekday: 'short',
            })}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  eyebrow: {
    ...type.caption,
    color: colors.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  big: {
    ...type.largeTitle,
    color: colors.metricBlue,
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  span: { ...type.footnote, color: colors.mutedForeground, marginBottom: spacing.md },
  plot: { height: PLOT_H },
  axis: {
    position: 'absolute',
    right: 0,
    top: 0,
    height: PLOT_H,
    width: AXIS_W,
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  // Nudged up by half a line so each label sits *on* its gridline rather than
  // hanging under it — the top and bottom ones would otherwise clip the plot.
  axisText: { ...type.caption, color: colors.mutedForeground, marginVertical: -4 },
  dayRow: { flexDirection: 'row', marginTop: 2 },
  dayText: { ...type.caption, color: colors.mutedForeground, flex: 1, textAlign: 'center' },
});
