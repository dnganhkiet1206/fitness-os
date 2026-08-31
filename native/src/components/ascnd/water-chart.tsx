import * as Haptics from 'expo-haptics';
import { useEffect, useId, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Line, RadialGradient, Rect, Stop } from 'react-native-svg';

import { colors, glass, radius, spacing, type } from '@/constants/ascnd';
import type { useI18n } from '@/hooks/use-app-settings';
import { localDateStr, parseLocalDate } from '@/lib/local-date';
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
/* `colors.metricBlue`, không phải mã màu chép lại. Cùng con số, nhưng chép lại
   thì đổi bảng màu xong chỗ này ở lại — và không có gì báo. */
const WASH = colors.metricBlue;
const WASH_PEAK = 0.1;

/** shared falloff: steep, then a tail that never quite lands */
const CURVE = [
  { at: 0, of: 1 },
  { at: 0.3, of: 0.55 },
  { at: 0.55, of: 0.25 },
  { at: 0.8, of: 0.08 },
  { at: 1, of: 0 },
] as const;

/**
 * Widths and opacities of the three fake-blur layers behind each bar.
 *
 * The spread is unchanged and only the opacities came down — the softness of a
 * glow is the width of its falloff, so narrowing these would have made the halo
 * tighter rather than fainter, which is a different thing and not what was
 * asked for.
 *
 * They stack, so what the eye reads is the composite, not any one line. Within
 * 2px of a bar all three overlap: `1 − (1−a)(1−b)(1−c)` was 23% blue and is now
 * 15%. Worth writing down because tuning the brightest ring by adjusting one
 * layer is how it ends up brighter than before.
 */
const HALO = [
  { grow: 7, o: 0.03 },
  { grow: 4.5, o: 0.05 },
  { grow: 2, o: 0.075 },
] as const;

const PLOT_H = 150;
const AXIS_W = 40;
/** the read-out chip — fixed so it can be clamped inside the plot before layout */
const CALLOUT_W = 76;
const CALLOUT_H = 40;
const GROW_MS = 720;
const GROW_EASE = Easing.bezier(0.16, 1, 0.3, 1);

/** A volume in the unit on screen: "1.75L" or "59 oz". */
function volumeText(ml: number, unit: 'ml' | 'oz'): string {
  return unit === 'oz' ? `${Math.round(displayVolume(ml, 'oz'))} oz` : `${(ml / 1000).toFixed(2)}L`;
}

/** A day, named. `long` for the screen reader, `short` for the chip. */
function dayLabel(date: string, lang: 'vi' | 'en', form: 'short' | 'long'): string {
  return parseLocalDate(date).toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-US',
    form === 'long'
      ? { weekday: 'long', day: 'numeric', month: 'long' }
      : { weekday: 'short', day: 'numeric', month: 'short' });
}

/**
 * How lit a bar is, as one number built from three independent facts.
 *
 * Three separate `opacity` expressions scattered through the render is how a
 * combination nobody thought about — a faded, unmet, past day — ends up at four
 * percent and invisible. Multiplied here, the floor is knowable and is written
 * down below.
 *
 *   today, target met      1.000    ← the brightest thing on the chart
 *   today, short           0.625
 *   past, target met       0.720
 *   past, short            0.450    ← the value the whole chart used before
 *
 * The factors are 0.72 and 0.625 rather than rounder-looking numbers because
 * their product has to land exactly on 0.45: a past day that missed target is
 * the case that already existed, and it should not shift because two new
 * dimensions were added around it. With `faded` on top the floor is 0.180,
 * which is the dimmest anything on this chart can be.
 *
 * `today` is the strongest of the three because it is the only one the person
 * can still change. A week is read to answer "where am I now", and the column
 * that answers it should not be the same weight as six that are finished.
 *
 * `faded` multiplies whatever came out of that by 0.4 — so a picked column
 * keeps its own reading while the rest recede, rather than every column being
 * flattened to one dim value and the selection having to shout over it.
 */
function brightness({ today, met, faded }: { today: boolean; met: boolean; faded: boolean }) {
  return (today ? 1 : 0.72) * (met ? 1 : 0.625) * (faded ? 0.4 : 1);
}

function Bar({
  x,
  w,
  value,
  ceilingMl,
  met,
  today,
  faded,
  index,
  gradId,
}: {
  x: number;
  w: number;
  value: number;
  ceilingMl: number;
  met: boolean;
  /** the day still being lived — brighter than the six behind it */
  today: boolean;
  /** another column is picked, so this one steps back */
  faded: boolean;
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
  const dim = brightness({ today, met, faded });

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

  /** the day whose value is being shown, or none */
  const [picked, setPicked] = useState<string | null>(null);

  /*
    Today is found by date, not by position.

    `useWaterWeek` happens to return today last, and relying on that would make
    the brightest column on the chart a property of a loop in another file.
  */
  const todayStr = localDateStr();

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

  /*
    Where the read-out goes, and why it is clamped.

    It sits above the picked bar, so it rises with the value and never covers
    the bar it describes. Sunday's chip would otherwise run off the right edge
    of the card and Monday's off the left, so `left` is clamped into the plot —
    which means the chip stops being centred on the bar at the two ends. That
    is the right trade: a chip half off the screen is unreadable, and one nudged
    twenty points sideways is still obviously attached to the only highlighted
    column on the chart.

    `bottom` is measured from the foot of the plot because that is where the
    bars are anchored, and it is capped so a full-height day does not push the
    chip out through the top of the card.
  */
  const pick = (() => {
    if (!picked || slot === 0) return null;
    const i = days.findIndex((d) => d.date === picked);
    if (i < 0) return null;
    const day = days[i];
    const barTop = top.ml > 0 ? Math.min(1, day.total / top.ml) * PLOT_H : 0;
    const centre = i * slot + slot / 2;
    return {
      day,
      left: Math.max(0, Math.min(plotW - CALLOUT_W, centre - CALLOUT_W / 2)),
      bottom: Math.min(barTop + 8, PLOT_H - CALLOUT_H),
    };
  })();

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
                today={d.date === todayStr}
                faded={picked !== null && picked !== d.date}
                index={i}
                gradId={barGrad}
              />
            ))}
          </Svg>
        ) : null}

        {/*
          Tap zones, not taps on the bars.

          A bar is `slot * 0.42` wide — about seventeen points — and an empty
          day has no bar at all, so hit-testing the drawing would make the
          thinnest columns the hardest to ask about and the empty ones
          impossible. Each zone is the full slot, the full height of the plot,
          and they are flush against each other, so every point over the chart
          belongs to exactly one day and no tap lands on nothing.

          The zones are narrower than the 44pt an isolated control needs —
          roughly 41 on a 390pt screen. That floor is about controls with dead
          space around them, where a near miss does nothing; here a near miss
          selects the neighbouring day, which is visible, wrong in the smallest
          possible way, and corrected by tapping again. Making them 44 would
          mean showing six days instead of seven.
        */}
        {w > 0 ? (
          <View style={[styles.zones, { width: plotW }]}>
            {days.map((d) => (
              <Pressable
                key={d.date}
                accessibilityRole="button"
                accessibilityState={{ selected: picked === d.date }}
                // The chart had no accessible values at all — a screen reader
                // met seven unlabelled shapes. This is the reading of it.
                accessibilityLabel={`${dayLabel(d.date, lang, 'long')}, ${volumeText(d.total, unit)}`}
                style={styles.zone}
                onPress={() => {
                  Haptics.selectionAsync();
                  setPicked((p) => (p === d.date ? null : d.date));
                }}
              />
            ))}
          </View>
        ) : null}

        {/* The read-out, over the picked column */}
        {pick ? (
          <View
            style={[styles.callout, { left: pick.left, bottom: pick.bottom }]}
            pointerEvents="none">
            <Text style={styles.calloutValue}>{volumeText(pick.day.total, unit)}</Text>
            <Text style={styles.calloutDay}>{dayLabel(pick.day.date, lang, 'short')}</Text>
          </View>
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
          <Text key={d.date} style={[styles.dayText, d.date === todayStr && styles.dayToday]}>
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
  // Flush columns over the plot: every point belongs to exactly one day.
  zones: { position: 'absolute', left: 0, top: 0, height: PLOT_H, flexDirection: 'row' },
  zone: { flex: 1, height: '100%' },
  callout: {
    position: 'absolute',
    width: CALLOUT_W,
    height: CALLOUT_H,
    borderRadius: radius.sm,
    borderWidth: glass.borderWidth,
    borderColor: glass.border,
    // Opaque, not the glass fill — this sits over the bars it describes, and a
    // translucent chip with a neon column behind it is unreadable.
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calloutValue: {
    ...type.footnote,
    fontWeight: '700',
    color: colors.foreground,
    fontVariant: ['tabular-nums'],
  },
  calloutDay: { ...type.caption, color: colors.mutedForeground },
  dayRow: { flexDirection: 'row', marginTop: 2 },
  dayText: { ...type.caption, color: colors.mutedForeground, flex: 1, textAlign: 'center' },
  // Today reads out of the row the same way its bar does out of the chart.
  dayToday: { color: colors.foreground, fontWeight: '700' },
});
