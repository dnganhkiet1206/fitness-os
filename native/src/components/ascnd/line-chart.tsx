import * as Haptics from 'expo-haptics';
import { useEffect, useId, useRef, useState } from 'react';
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import {
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from 'react-native';
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Line,
  Path,
  RadialGradient,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';

import { colors, glass, radius, spacing, type } from '@/constants/ascnd';
import { curveLength, onCurve, sampleCurve, yOnCurve, type CurvePoint } from '@/lib/curve';

export interface ChartPoint {
  date: string;
  value: number;
}

interface LineChartProps {
  points: ChartPoint[];
  color?: string;
  height?: number;
  /** Unit suffix for min/max labels (e.g. "kg") */
  unit?: string;
  emptyLabel?: string;
  /**
   * A target to mark with a horizontal line, in the same unit as `points`.
   *
   * The scale stretches to include it, so the line is always on the chart even
   * when the target is far from anything recorded — a goal drawn off the top
   * edge is a goal you cannot see how far away you are from, which is the only
   * question it exists to answer.
   */
  goal?: number | null;
  /** short caption printed above the goal line, e.g. "Goal" */
  goalLabel?: string;
  /**
   * Draw it as a read-off chart rather than a sparkline: dashed gridlines at
   * round values, those values down the left, dates along the bottom.
   *
   * Opt-in because it changes the *scale*. The gridlines are only worth having
   * at round numbers, which means rounding the extent outward to reach them —
   * so a series from 51.5 to 57.4 is drawn on a 50-to-60 axis and its curve
   * occupies less of the height. That is right for a weight history somebody
   * reads values off, and wrong for the 90pt sparklines on the biometrics
   * screen, where the only question is which way the line is going.
   */
  grid?: boolean;
  /** A pool of the line's own colour behind the middle of the plot. */
  ambient?: boolean;
  /**
   * Print the min / latest / max row under a sparkline. On by default, because
   * for every caller so far those three numbers are values in a unit the reader
   * knows — kilograms, beats per minute.
   *
   * `exercise-insight.tsx` is the first caller for which they are not. Its
   * series is an internal comparison index: for a bodyweight movement it is
   * body mass times reps, so the row came out as `572 · 572 · 655.2` under a
   * pull-up. Not merely unhelpful — 572 reads as a load, which is the same
   * failure this repository already fixed once when tonnage was printed with a
   * kilogram label beside it.
   */
  labels?: boolean;
  /** BCP-47 tag for the date axis — pass `getLocale(lang)`. */
  locale?: string;
  /**
   * Told when a drag starts and ends, so the page can stop scrolling under it.
   *
   * This has to leave the component. On iOS a ScrollView pans with a *native*
   * gesture recogniser that never consults the JS responder system, so
   * `onResponderTerminationRequest: () => false` — which does correctly stop
   * other JS responders — has no effect on it whatsoever. The chart cannot
   * hold the page still by itself; it can only say when it needs to be held.
   *
   * Pass it to `<Screen contentScrollEnabled={!scrubbing}>`.
   */
  onScrubbing?: (active: boolean) => void;
}

/**
 * Round values to hang gridlines on, covering `[lo, hi]`.
 *
 * A gridline is only useful if the number beside it is one a person would say.
 * The steps below are the ones weight and the biometrics actually move in; the
 * loop takes the first that covers the range in three intervals or fewer, so an
 * eight-kilo span gets 5s and a fifty-kilo span gets 20s without either being
 * written down anywhere.
 *
 * Three, not four: with a goal of 60 over a 51.5–57.4 history, four intervals
 * produce 50 / 52.5 / 55 / 57.5 / 60 and three produce 50 / 55 / 60. Half-kilo
 * gridlines are precision the reading does not have.
 *
 * Both ends are pushed out to the step, which is what puts the top and bottom
 * gridlines exactly on the edges of the plot instead of floating just inside
 * it.
 */
/** the scrub readout chip — fixed so it can be clamped before it is laid out */
const SCRUB_W = 96;
const SCRUB_H = 38;

/**
 * How long the indicator takes to settle onto the nearest reading.
 *
 * Short enough to read as the same gesture finishing rather than as a second
 * animation starting, long enough to be seen — instant would be a jump, and a
 * jump at the moment the finger leaves looks like a mis-tap rather than a
 * snap. `out(cubic)` decelerates into the reading, which is the shape of
 * something coming to rest.
 */
const SNAP_MS = 190;
/** how long the indicator takes to appear — short, it is a response to a touch */
const FADE_MS = 140;
const SNAP_EASE = Easing.out(Easing.cubic);
/**
 * How long the line takes to draw itself on after the range changes.
 *
 * Long enough to be a movement rather than a flicker, short enough that
 * changing your mind about the range twice does not queue a wait. `out(cubic)`
 * runs quickly across the early history and eases into the recent end, which is
 * the end being looked at.
 */
const DRAW_MS = 560;
const DRAW_EASE = Easing.out(Easing.cubic);

const AnimatedLine = Animated.createAnimatedComponent(Line);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);

/**
 * The series, drawing itself on.
 *
 * ── why a redraw and not a cross-fade ──
 *
 * Switching range replaces the whole series, and a chart that swaps one shape
 * for another instantly gives no sense that the two are the same measurement
 * over a different window — it reads as a different chart arriving. Fading
 * between them is smoother and says no more than that. Drawing the new line
 * left to right says what actually changed: the same history, read across a
 * different stretch of time.
 *
 * ── how ──
 *
 * `strokeDasharray` set to the path's own length and `strokeDashoffset` walked
 * from that to zero: one dash as long as the whole stroke, slid into view.
 * `curveLength` measures the sampled polyline and rounds *up*, because a dash
 * shorter than the path repeats and would clip the end of the line permanently,
 * while one longer than it is simply an unbroken stroke.
 *
 * Its own component so the hooks sit outside `LineChart`'s early return, and so
 * a `key` change remounts it and replays the draw.
 */
function DrawnPath({ d, len, color, width }: { d: string; len: number; color: string; width: number }) {
  const draw = useSharedValue(0);
  useEffect(() => {
    draw.value = withTiming(1, { duration: DRAW_MS, easing: DRAW_EASE });
  }, [draw]);
  const props = useAnimatedProps(() => ({ strokeDashoffset: len * (1 - draw.value) }));
  return (
    <AnimatedPath
      d={d}
      stroke={color}
      strokeWidth={width}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray={len}
      animatedProps={props}
    />
  );
}

/**
 * The vertical rule, driven from the UI thread.
 *
 * Its own component because `useAnimatedProps` is a hook and `LineChart`
 * returns early when there are fewer than two points. A hook called after that
 * return is skipped on a sparse chart, the hook order changes between renders,
 * and React tears the component down — which `tsc` has nothing to say about.
 * Down here the hook belongs to a component that either renders or does not.
 */
function ScrubLine({
  at,
  show,
  height,
  color,
}: {
  at: SharedValue<number>;
  show: SharedValue<number>;
  height: number;
  color: string;
}) {
  const props = useAnimatedProps(() => ({
    x1: at.value,
    x2: at.value,
    strokeOpacity: 0.45 * show.value,
  }));
  return <AnimatedLine y1={0} y2={height} stroke={color} strokeWidth={1} animatedProps={props} />;
}

/**
 * The marker, riding the drawn line under the rule.
 */
function ScrubDot({
  at,
  show,
  curve,
  color,
}: {
  at: SharedValue<number>;
  show: SharedValue<number>;
  /** the drawn line, sampled — see `sampleCurve` */
  curve: readonly CurvePoint[];
  color: string;
}) {
  /*
    The marker rides the line at the rule's own x.

    It sat on the nearest reading and hopped, which made the two halves of one
    indicator behave like different things: one gliding under the finger, one
    jumping behind it. Now both read `at`, so they cannot come apart — including
    through the settle, where the marker travels the same path at the same time
    because it is following the same value rather than being animated alongside
    it.

    It is a marker on a line the chart already draws, not a claim about a
    measurement. The curve between two weigh-ins is already on screen; putting a
    dot on it says nothing new. The *number* still comes from a real reading —
    see the chip.
  */
  const halo = useAnimatedProps(() => ({
    cx: at.value,
    cy: yOnCurve(curve, at.value),
    // Grows into place as it fades in, so the marker arrives rather than blinks
    r: 7 * show.value,
    fillOpacity: 0.22 * show.value,
  }));
  const core = useAnimatedProps(() => ({
    cx: at.value,
    cy: yOnCurve(curve, at.value),
    r: 4 * show.value,
  }));

  return (
    <>
      <AnimatedCircle fill={color} animatedProps={halo} />
      <AnimatedCircle
        fill={color}
        stroke={colors.background}
        strokeWidth={1.5}
        animatedProps={core}
      />
    </>
  );
}

/**
 * The readout chip, following the same shared value as the rule.
 *
 * `translateX` rather than `left`: `left` is a layout property, so animating it
 * re-runs layout on every frame of the snap for a view that is only moving.
 */
function ScrubChip({
  at,
  show,
  min,
  max,
  top,
  children,
}: {
  at: SharedValue<number>;
  show: SharedValue<number>;
  min: number;
  max: number;
  top: number;
  children: React.ReactNode;
}) {
  /*
    Opacity from the same shared value as the rule and the marker, rather than
    Reanimated's `entering`/`exiting`.

    Those run on mount and unmount, and the indicator does not unmount until
    after its exit has played — so a chip fading on `exiting` would sit at full
    strength through the whole fade and then start its own. One value means the
    three parts arrive and leave together, which is what makes them read as one
    thing.
  */
  const style = useAnimatedStyle(() => ({
    opacity: show.value,
    transform: [{ translateX: Math.max(min, Math.min(max, at.value - SCRUB_W / 2)) }],
  }));
  return (
    <Animated.View style={[styles.scrubChip, { top }, style]} pointerEvents="none">
      {children}
    </Animated.View>
  );
}

const TICK_STEPS = [0.1, 0.2, 0.5, 1, 2, 2.5, 5, 10, 20, 25, 50, 100] as const;

export function niceTicks(lo: number, hi: number, want = 3): { ticks: number[]; min: number; max: number } {
  const span = Math.max(hi - lo, 1e-6);
  const step = TICK_STEPS.find((s) => span / s <= want) ?? TICK_STEPS[TICK_STEPS.length - 1];
  let min = Math.floor(lo / step) * step;
  let max = Math.ceil(hi / step) * step;

  /*
    A flat series still needs an axis with two ends.

    Every reading identical — three weigh-ins all at 70.0, no goal set — rounds
    to `min === max`, which is one gridline, a span of zero, and a line drawn
    along the very bottom of the plot. Opening it out by a step each way puts
    the flat line in the middle of a chart that reads 69.5 / 70 / 70.5, which is
    both true and legible.
  */
  if (max - min < step / 2) {
    min -= step;
    max += step;
  }
  const ticks: number[] = [];
  // Counted rather than accumulated: `for (v = min; v <= max; v += step)` drifts
  // on 0.1 and 2.5 and can stop one line short of the top of its own axis.
  const n = Math.round((max - min) / step);
  for (let i = 0; i <= n; i++) ticks.push(Math.round((min + i * step) * 1e6) / 1e6);
  return { ticks, min, max };
}

/**
 * Minimal smooth line chart (SVG): gradient fill, end-point dot, min/max
 * labels. Deliberately dependency-free — enough for trend surfaces.
 *
 * **x is time, not sample number.** It used to be `width · i / (n − 1)`, which
 * draws every reading the same distance apart however far apart they actually
 * were: two weigh-ins a day apart looked exactly as far apart as two ninety
 * days apart, and the shape of the line was a shape the data never had. Now
 * each point sits where its date falls between the first and the last, so a
 * gap in logging reads as a gap.
 *
 * Series that *are* evenly spaced (a daily readiness trend) are unaffected —
 * for them the two mappings are the same number. Points whose dates do not
 * parse fall back to even spacing rather than collapsing onto each other.
 *
 * The smoothing is safe to keep: the control points share their endpoints' y,
 * so the curve never bulges past a value that was recorded.
 */
export function LineChart({ points, color = colors.primary, height = 140, unit = '', emptyLabel = 'Not enough data yet', goal, goalLabel, grid = false, ambient = false, labels = true, locale, onScrubbing }: LineChartProps) {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  /*
    Unique ids, because SVG ids are document-global.

    Both of these were hard-coded strings. `biometrics.tsx:109` renders a
    `LineChart` per metric inside a `.map()`, each with its own colour, so five
    charts declared five gradients called "fill" and every one of them drew
    whichever colour mounted last. It looked like a palette decision.
  */
  const uid = useId();
  const fillId = `lcFill-${uid}`;
  const glowId = `lcGlow-${uid}`;

  /**
   * Where the finger is, in pixels — not which reading it is nearest.
   *
   * Storing the index made the indicator snap from reading to reading, so on a
   * year with eight weigh-ins it sat still through most of the drag and jumped
   * between them. The rule holding its own x moves with the finger everywhere,
   * including across the long empty stretches that are most of a weight
   * history.
   *
   * The *reading* is derived from it, and stays a real reading. A weight
   * interpolated for a day nobody stepped on a scale is a number the app would
   * be making up, and it would be printed next to a date to make it look
   * recorded.
   */
  const [scrubX, setScrubX] = useState<number | null>(null);
  /** last reading the rule was nearest, so the tick fires on change only */
  const lastScrub = useRef<number | null>(null);
  /**
   * The drawn position of the rule, which is not always the finger's.
   *
   * While dragging it is set outright and tracks exactly. On release it is
   * handed a `withTiming` to the nearest reading, so the rule glides the last
   * few points to its resting place instead of the reading being wherever the
   * finger happened to stop. Two values rather than one because only the
   * drawing is animated — the reading itself is already decided.
   */
  const rulerX = useSharedValue(0);
  /**
   * How visible the indicator is: 1 while a finger is down, 0 otherwise.
   *
   * The readout used to stay after release. It does not any more — it belongs
   * to the touch, and a chart that keeps a stale reading pinned to it is a
   * chart that has to be dismissed.
   *
   * It is a *fade*, not a removal, because the settle happens at the same
   * moment: the rule glides onto the reading while it goes, so the last thing
   * seen is the indicator arriving where it belongs rather than blinking out
   * from wherever the finger stopped.
   */
  const fade = useSharedValue(0);
  /** clears the indicator once the fade has played; cancelled by a new touch */
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (points.length < 2) {
    return (
      <View style={[styles.empty, { height }]} onLayout={onLayout}>
        <Text style={styles.emptyText}>{emptyLabel}</Text>
      </View>
    );
  }

  const values = points.map((p) => p.value);
  // The goal joins the extent, not the data: it moves where the line sits on
  // the chart without ever becoming a point on it.
  const hasGoal = goal != null && Number.isFinite(goal);
  const extent = hasGoal ? [...values, goal] : values;
  const rawMin = Math.min(...extent);
  const rawMax = Math.max(...extent);

  // With gridlines the extent rounds outward so the lines land on numbers
  // worth printing; without them the series keeps the full height it had.
  const scale = grid ? niceTicks(rawMin, rawMax) : { ticks: [], min: rawMin, max: rawMax };
  const min = scale.min;
  const max = scale.max;
  const span = max - min || 1;
  const padY = 12;
  const chartH = height - padY * 2;

  /*
    A left gutter for the values, and only when they are drawn.

    The reference puts them outside the plot rather than over it: a number
    sitting on the line it labels is unreadable exactly when the line is
    interesting. Everything below measures x from `padX`, so the goal line, the
    curve and the dots all start clear of them without any of them knowing why.
  */
  /**
   * Room for the marker at each end.
   *
   * ── the half-dot every chart in this app was drawing ──
   *
   * The last point is a circle of `r = 4.5` with a 2pt stroke, and it was
   * centred at `x(n - 1) = padX + plotW`, which with `plotW = width - padX` is
   * exactly the right edge of the SVG. Half of it — five and a half points —
   * fell outside and was clipped. Measured on the exercise-insight sparkline:
   * the line ended in a 6px vertical stub at x=364 with nothing after it.
   *
   * It was there in every chart this component draws, on four screens, and it
   * reads as a line that stops rather than a line that ends. The first point
   * had the same problem on the left whenever `padX` was zero, which is every
   * sparkline.
   *
   * So the plot is inset by the marker's own radius at both ends. `grid` mode
   * already reserves 34 on the left for the axis labels, which is more than
   * enough; the right edge needed it either way.
   */
  const EDGE = 5.5;
  const padX = grid ? 34 : EDGE;
  const plotW = Math.max(0, width - padX - EDGE);

  /**
   * Where each reading sits horizontally, by its date.
   *
   * `YYYY-MM-DD` at local midnight, the same parse the rest of the app uses.
   * If any date is unusable, or every reading landed on the same day, there is
   * no time axis to lay out against and it falls back to even spacing.
   */
  const times = points.map((p) => new Date(`${p.date}T00:00:00`).getTime());
  const usable = times.every((t) => Number.isFinite(t));
  const t0 = times[0];
  const tN = times[times.length - 1];
  const byTime = usable && tN > t0;
  const xs = points.map((_, i) =>
    padX + (byTime ? (plotW * (times[i] - t0)) / (tN - t0) : (plotW * i) / (points.length - 1)),
  );

  const x = (i: number) => xs[i];
  const y = (v: number) => padY + chartH * (1 - (v - min) / span);

  /*
    Five date columns, evenly spaced in *time*.

    Not one per reading — a year of weigh-ins would print a hundred overlapping
    dates — and not one per pixel either. Five is what the reference uses and
    what fits: first, last, and three between, each a real instant on the axis
    so the vertical rule under a label is where that date actually falls.
  */
  const DATE_COLS = 5;
  const cols =
    grid && byTime
      ? Array.from({ length: DATE_COLS }, (_, i) => {
          const f = i / (DATE_COLS - 1);
          return { x: padX + plotW * f, t: t0 + (tN - t0) * f };
        })
      : [];

  const dateText = (t: number) =>
    new Date(t).toLocaleDateString(locale, { day: 'numeric', month: 'short' });

  let path = `M ${x(0)} ${y(values[0])}`;
  for (let i = 1; i < values.length; i++) {
    // Catmull-Rom-ish smoothing via midpoint control
    const cx = (x(i - 1) + x(i)) / 2;
    path += ` C ${cx} ${y(values[i - 1])}, ${cx} ${y(values[i])}, ${x(i)} ${y(values[i])}`;
  }
  const fillPath = `${path} L ${x(values.length - 1)} ${height} L ${padX} ${height} Z`;


  const fmt = (v: number) => `${Math.round(v * 10) / 10}${unit ? ` ${unit}` : ''}`;
  // Gridline labels are bare numbers: the unit is already in the card's title
  // and repeating it four times down the side is four times the ink for none of
  // the meaning.
  const tickText = (v: number) => `${Math.round(v * 10) / 10}`;

  /*
    Scrubbing: hold anywhere on the plot and slide to read the series.

    ── the built-in responder, not a gesture library ──

    The responder system is in RN core, needs nothing, and a horizontal scrubber
    is exactly what it is for.

    This used to read "`react-native-gesture-handler` is installed but nothing
    in the app uses it, and `Gesture.Pan` needs a `GestureHandlerRootView`
    wrapped around the app" — the argument being that a root provider was too
    much to add for one chart. Both halves have since stopped being true:
    `swipe-row.tsx` and `card-deck.tsx` use the library, and the root view is
    now at the top of `_layout.tsx` where they need it.

    The choice here still stands on the sentence above it. It is recorded this
    way rather than deleted because the reason a thing was built is the part
    that goes stale, and a comment arguing from a fact that is no longer a fact
    is worse than no comment.

    ── giving the touch back to the scroll view ──

    This chart lives most of the way down a long scrolling page, so a finger
    landing on it is at least as likely to mean "scroll" as "read". Claiming the
    touch on start makes the tap work; `onResponderTerminationRequest` returning
    true is what then lets the ScrollView take it away the moment the drag turns
    out to be vertical. Without that line the chart would be a 180pt band the
    page cannot be scrolled through.

    ── it stays after the finger lifts ──

    A finger covers the reading it is pointing at, so a readout that vanished on
    release could only ever be seen around the edge of a thumb. It persists, and
    the next touch moves it.
  */
  const nearest = (localX: number) => {
    let best = 0;
    for (let i = 1; i < xs.length; i++) {
      if (Math.abs(xs[i] - localX) < Math.abs(xs[best] - localX)) best = i;
    }
    return best;
  };
  const scrubbable = grid;
  // Only built when something is going to ride it.
  const curve = scrubbable ? sampleCurve(xs, values.map(y)) : [];

  /*
    The reading is derived, never stored.

    An index kept in state goes stale the moment the range buttons swap `points`
    for a shorter array: a week view would keep pointing at slot 40 and name
    whatever now sits there, a wrong date against a wrong weight. Recomputing
    from the pixel every render means the selection follows the data instead of
    outliving it.
  */
  const scrubI = scrubX != null ? nearest(scrubX) : null;
  const at = scrubI != null ? points[scrubI] : null;

  /*
    Move to a reading, and tick when it changes.

    `selectionAsync` is the picker-wheel tap, which is what this is: the finger
    slides continuously and the selection lands on one reading at a time, so
    each landing gets the same small confirmation a wheel detent does. It fires
    on *change*, not on movement — a haptic on every `onResponderMove` is
    sixty a second, which stops being feedback and becomes a vibration.

    The last index is kept in a ref rather than derived from state: `setScrubX`
    does not update `scrubX` until the next render, so two moves inside one
    frame would both compare against the stale pixel and tick twice for one
    change of reading.
  */
  const track = (e: GestureResponderEvent) => {
    // Clamped to the plot: the rule has no business over the value gutter, and
    // past either end there is no more series to point at.
    const px = Math.max(padX, Math.min(width, e.nativeEvent.locationX));
    setScrubX(px);
    rulerX.value = px;
    const i = nearest(px);
    if (i !== lastScrub.current) {
      lastScrub.current = i;
      Haptics.selectionAsync();
    }
  };

  /*
    Settle onto the reading when the finger lifts.

    Letting go mid-gap leaves the rule standing between two weigh-ins, pointing
    at neither while the chip names one of them. Sliding it onto the reading it
    had already selected makes the drawing agree with the number that was being
    read the whole time.

    The state is set to the settled position at the same moment, so the chip's
    text is final while the rule is still moving — it has not changed, only
    arrived. A haptic is deliberately not fired here: nothing was selected, the
    selection is what is being confirmed.
  */
  const settle = () => {
    if (scrubX == null) return;
    const px = x(nearest(scrubX));
    setScrubX(px);
    rulerX.value = withTiming(px, { duration: SNAP_MS, easing: SNAP_EASE });
  };

  /*
    Lift the finger: settle, fade, then stop drawing it.

    The unmount waits for the fade rather than racing it — clearing the state
    immediately would take the indicator away mid-animation and there would be
    nothing left to fade. The timer is cancelled by the next touch, so a quick
    second tap picks the indicator back up instead of having it vanish
    underneath.
  */
  const release = () => {
    settle();
    fade.value = withTiming(0, { duration: FADE_MS });
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setScrubX(null), FADE_MS);
  };

  /*
    The chart keeps the touch. The page does not move under it.

    ── the three versions this went through ──

    First `onResponderTerminationRequest: () => true`, which hands the touch to
    anyone who asks — and a vertical ScrollView asks as soon as the finger
    passes its slop, on any drag. The indicator moved a little way across and
    stopped dead, as though the chart only let you reach the middle.

    Then a direction test: decide on the first movement past four points, keep
    the touch if it was horizontal, hand it over if it was vertical. That fixed
    the stopping, and left a worse thing behind. Nobody drags a scrubber in a
    straight line. A drag that starts a few degrees off vertical, or drifts
    there halfway across, loses the reading *and* scrolls the page out from
    under the chart being read — and which of the two happens depends on an
    angle nobody was aiming at.

    So now it never lets go. Touch the plot and it is a scrubber, at any angle,
    for as long as the finger is down.

    ── the cost, stated plainly ──

    A finger that lands on this chart cannot scroll the page. That is a real
    loss of 180 points of a long screen, and it is the right trade: the chart is
    the one thing on the tab you interact with by dragging, everything around it
    scrolls, and a control that works only when approached at the correct angle
    is worse than one that needs the finger put somewhere else.
  */
  /*
    Only a touch that lands on the line becomes a scrub.

    Taking any touch in the plot meant a finger that came down here on the way
    past — which is most of them, on a page this long — was captured, the page
    was locked, and a scroll turned into a reading nobody asked for.

    The test is against the drawn curve, not a rectangle: within `HIT_BAND` of
    the line at that x. Everywhere else in the card is the page's again.

    `onMoveShouldSetResponder` is false on purpose. A touch that began somewhere
    else is already a scroll in progress, and claiming it mid-flight is the
    exact interruption this is meant to end.
  */
  const onLine = (e: GestureResponderEvent) => {
    if (!scrubbable || width === 0) return false;
    const px = e.nativeEvent.locationX;
    const py = e.nativeEvent.locationY;
    if (px < padX || px > width || py < 0 || py > height) return false;
    return onCurve(curve, px, py);
  };

  const responder = scrubbable
    ? {
        onStartShouldSetResponder: onLine,
        onMoveShouldSetResponder: () => false,
        // Capture too, so the gesture is claimed before an ancestor can take
        // it — `onStartShouldSetResponder` alone loses to a parent that
        // captures first.
        onStartShouldSetResponderCapture: onLine,
        onMoveShouldSetResponderCapture: () => false,
        onResponderGrant: (e: GestureResponderEvent) => {
          if (hideTimer.current) clearTimeout(hideTimer.current);
          lastScrub.current = null;
          fade.value = withTiming(1, { duration: FADE_MS });
          onScrubbing?.(true);
          track(e);
        },
        onResponderMove: track,
        /* Stops other JS responders taking it. Does nothing about the native
           scroll recogniser — `onScrubbing` is what handles that. */
        onResponderTerminationRequest: () => false,
        onResponderRelease: () => {
          release();
          onScrubbing?.(false);
        },
        onResponderTerminate: () => {
          release();
          onScrubbing?.(false);
        },
      }
    : {};

  /* Where the readout chip sits: above the picked point, clamped into the plot
     so neither end of the series pushes it off the card. */
  /*
    The chip's vertical place and its horizontal limits.

    `top` is a number because it only changes when the selected reading does.
    The horizontal position is not here at all — it follows `rulerX` on the UI
    thread, so the chip keeps up with the rule during the settle instead of
    lagging a render behind it. Only the bounds cross over.
  */
  const chip =
    at && scrubX != null
      ? {
          min: padX,
          max: Math.max(padX, width - SCRUB_W),
          top: Math.max(0, Math.min(height - SCRUB_H, y(at.value) - SCRUB_H - 10)),
        }
      : null;

  return (
    <View
      onLayout={onLayout}
      /*
        One name for the whole series, because a drag scrubber cannot be
        operated by a screen reader at all. Naming the range and the latest
        value is the reading somebody would otherwise be denied entirely.
      */
      accessible={scrubbable}
      accessibilityRole={scrubbable ? 'image' : undefined}
      accessibilityLabel={
        scrubbable
          ? `${points.length} · ${fmt(rawMin)} – ${fmt(rawMax)} · ${fmt(values[values.length - 1])}`
          : undefined
      }
      {...responder}>
      {width > 0 && (
        <>
          <Svg width={width} height={height}>
            <Defs>
              <LinearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={color} stopOpacity="0.25" />
                <Stop offset="1" stopColor={color} stopOpacity="0" />
              </LinearGradient>
              {/*
                A pool of light, placed off-centre on purpose.

                Dead centre with equal radii is a symmetry nothing physical has:
                it reads as a vignette somebody applied rather than as a lamp
                somewhere. Sitting it up and to the left, and making it wider
                than it is tall, gives the card a near corner and a far one.

                The direction is not arbitrary. `ambient-light.tsx` puts the
                page's key light at `cx 0.28, cy −0.05` — above and left, just
                off the top corner. A pool leaning the other way would be a
                second light source contradicting the first, which is the thing
                the eye notices even when it cannot say why.

                Five stops, not two: a linear ramp reaches zero at a definite
                radius and the eye finds that ring immediately.
                `feGaussianBlur` is declared by react-native-svg and does
                nothing on native, so stacking stops is the only soft light
                available.
              */}
              <RadialGradient id={glowId} cx="0.37" cy="0.36" rx="0.78" ry="0.6">
                <Stop offset="0" stopColor={color} stopOpacity={0.14} />
                <Stop offset="0.3" stopColor={color} stopOpacity={0.077} />
                <Stop offset="0.55" stopColor={color} stopOpacity={0.035} />
                <Stop offset="0.8" stopColor={color} stopOpacity={0.011} />
                <Stop offset="1" stopColor={color} stopOpacity={0} />
              </RadialGradient>
            </Defs>

            {ambient ? (
              <Rect x={padX} y={0} width={plotW} height={height} fill={`url(#${glowId})`} />
            ) : null}

            {/* Value gridlines, dashed and under everything. They are a
                backdrop to read against, not marks on the chart. */}
            {grid
              ? scale.ticks.map((t) => (
                  <Line
                    key={`h${t}`}
                    x1={padX}
                    x2={width}
                    y1={y(t)}
                    y2={y(t)}
                    stroke={colors.foreground}
                    strokeOpacity={0.1}
                    strokeWidth={0.5}
                    strokeDasharray={[3, 4]}
                  />
                ))
              : null}

            {/* Date rules — fainter than the value lines, because a date is
                where you look after you have read a value, not before. */}
            {cols.slice(1, -1).map((c) => (
              <Line
                key={`v${c.x}`}
                x1={c.x}
                x2={c.x}
                y1={0}
                y2={height}
                stroke={colors.foreground}
                strokeOpacity={0.06}
                strokeWidth={0.5}
              />
            ))}
            {/*
              The goal, under the series so a reading never disappears behind
              it. Dashed and dim on purpose: it is a line nobody measured, and
              it should not compete with the one they did.
            */}
            {hasGoal && (
              <>
                <Line
                  x1={padX}
                  y1={y(goal)}
                  x2={width}
                  y2={y(goal)}
                  stroke={colors.mutedForeground}
                  strokeWidth={1}
                  strokeDasharray="4 4"
                  opacity={0.75}
                />
                {goalLabel ? (
                  <SvgText
                    x={padX + 2}
                    // Above the line, unless the line is near the top and there
                    // is no room — then below it, so the caption is never
                    // clipped by the edge of the chart.
                    /* The two offsets grew with the text: at 9pt a 5px gap
                       cleared the goal line and a 12px drop cleared it from
                       below, and neither did at 11. */
                    y={y(goal) - 6 < 12 ? y(goal) + 14 : y(goal) - 6}
                    fill={colors.mutedForeground}
                    fontSize={11}
                    opacity={0.9}>
                    {goalLabel} {Math.round(goal * 10) / 10}
                    {unit ? ` ${unit}` : ''}
                  </SvgText>
                ) : null}
              </>
            )}
            {/* No area fill under a gridded chart: a filled region and a
                dashed grid are two backgrounds arguing, and the fill is the one
                carrying no information. */}
            {grid ? null : <Path d={fillPath} fill={`url(#${fillId})`} />}
            {/* The gridded chart draws itself on; the sparklines stay static —
                a 90pt trend line animating on every mount is motion for its own
                sake on a screen showing five of them at once. */}
            {grid ? (
              /*
                Keyed on the path itself, so the draw replays exactly when the
                line changes — a range switch, a new weigh-in, a unit toggle.

                The key was on the whole `<LineChart>` at the call site first.
                That worked and cost too much: remounting the chart resets the
                `width` it measures with `onLayout`, so every range switch had a
                frame with nothing drawn at all before the new line appeared.
                Keying the one element that needs to restart leaves the
                measurement, the axes and the gridlines alone.
              */
              <DrawnPath key={path} d={path} len={curveLength(curve)} color={color} width={3} />
            ) : (
              <Path
                d={path}
                stroke={color}
                strokeWidth={2.5}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
            {/* Every reading gets a dot when the grid is on — that is what says
                which parts of the curve were measured and which were drawn
                between measurements. */}
            {grid
              ? values.map((v, i) =>
                  i === values.length - 1 ? null : (
                    <Circle key={`p${points[i].date}-${i}`} cx={x(i)} cy={y(v)} r={3} fill={color} />
                  ),
                )
              : null}
            <Circle
              cx={x(values.length - 1)}
              cy={y(values[values.length - 1])}
              r={4.5}
              fill={color}
              stroke={colors.background}
              strokeWidth={2}
            />

            {/* The scrubber: a rule down the whole plot so the reading can be
                lined up against the gridlines, and a ringed dot on the point
                itself so it is clear which reading is being named. */}
            {at && scrubX != null ? (
              <>
                {/* The rule is where the finger is — it slides across the empty
                    stretches instead of waiting for the next reading, and
                    settles onto the reading when the finger lifts. */}
                <ScrubLine at={rulerX} show={fade} height={height} color={color} />
                {/* The dot is on the reading the chip is naming, which is a
                    real one. It is never more than half a gap from the rule,
                    and the date in the chip says which reading it is. */}
                <ScrubDot at={rulerX} show={fade} curve={curve} color={color} />
              </>
            ) : null}
          </Svg>

          {/* Values down the left, each centred on its own gridline */}
          {grid
            ? scale.ticks.map((t) => (
                <Text key={`t${t}`} style={[styles.axisValue, { top: y(t) - 7, width: padX - 6 }]}>
                  {tickText(t)}
                </Text>
              ))
            : null}

          {at && chip ? (
            <ScrubChip at={rulerX} show={fade} min={chip.min} max={chip.max} top={chip.top}>
              <Text style={styles.scrubValue}>{fmt(at.value)}</Text>
              <Text style={styles.scrubDate}>
                {new Date(`${at.date}T00:00:00`).toLocaleDateString(locale, {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </Text>
            </ScrubChip>
          ) : null}

          {grid && cols.length > 0 ? (
            <View style={styles.dateRow}>
              {cols.map((c, i) => (
                <Text
                  key={c.t}
                  style={[
                    styles.dateText,
                    // The end labels anchor to the edges instead of centring,
                    // so neither runs off the side of the card.
                    { left: c.x },
                    i === 0 && styles.dateFirst,
                    i === cols.length - 1 && styles.dateLast,
                  ]}
                  numberOfLines={1}>
                  {dateText(c.t)}
                </Text>
              ))}
            </View>
          ) : labels ? (
            <View style={styles.labels}>
              <Text style={styles.label}>{fmt(min)}</Text>
              <Text style={[styles.label, styles.labelStrong]}>{fmt(values[values.length - 1])}</Text>
              <Text style={styles.label}>{fmt(max)}</Text>
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

export interface MultiSeries {
  label: string;
  color: string;
  /** One entry per x slot; null = no reading that day (line connects across gaps) */
  values: (number | null)[];
}

interface MultiLineChartProps {
  series: MultiSeries[];
  height?: number;
  emptyLabel?: string;
}

/**
 * Multi-series companion to LineChart — several smooth lines on a shared
 * scale with per-point dots and a legend (web measurement-trend chart).
 */
export function MultiLineChart({ series, height = 200, emptyLabel = 'Not enough data yet' }: MultiLineChartProps) {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const slots = Math.max(...series.map((s) => s.values.length), 0);
  const allValues = series.flatMap((s) => s.values).filter((v): v is number => v != null);

  if (slots < 2 || allValues.length < 2) {
    return (
      <View style={[styles.empty, { height }]} onLayout={onLayout}>
        <Text style={styles.emptyText}>{emptyLabel}</Text>
      </View>
    );
  }

  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const span = max - min || 1;
  const padY = 12;
  const chartH = height - padY * 2;

  const x = (i: number) => (width * i) / (slots - 1);
  const y = (v: number) => padY + chartH * (1 - (v - min) / span);

  const lines = series
    .map((s) => {
      const pts = s.values
        .map((v, i) => ({ i, v }))
        .filter((p): p is { i: number; v: number } => p.v != null);
      if (pts.length === 0) return null;

      let path = `M ${x(pts[0].i)} ${y(pts[0].v)}`;
      for (let k = 1; k < pts.length; k++) {
        const cx = (x(pts[k - 1].i) + x(pts[k].i)) / 2;
        path += ` C ${cx} ${y(pts[k - 1].v)}, ${cx} ${y(pts[k].v)}, ${x(pts[k].i)} ${y(pts[k].v)}`;
      }
      return { color: s.color, path, pts };
    })
    .filter((l): l is NonNullable<typeof l> => l != null);

  const fmt = (v: number) => `${Math.round(v * 10) / 10}`;

  return (
    <View onLayout={onLayout}>
      {width > 0 && (
        <>
          <Svg width={width} height={height}>
            {lines.map((l, li) => (
              <Path key={li} d={l.path} stroke={l.color} strokeWidth={2} fill="none" strokeLinecap="round" />
            ))}
            {lines.map((l, li) =>
              l.pts.map((p) => (
                <Circle key={`${li}-${p.i}`} cx={x(p.i)} cy={y(p.v)} r={3} fill={l.color} />
              )),
            )}
          </Svg>
          <View style={styles.labels}>
            <Text style={styles.label}>{fmt(min)}</Text>
            <Text style={styles.label}>{fmt(max)}</Text>
          </View>
          <View style={styles.legend}>
            {series.map((s) => (
              <View key={s.label} style={styles.legendItem}>
                <View style={[styles.legendSwatch, { backgroundColor: s.color }]} />
                <Text style={styles.label}>{s.label}</Text>
              </View>
            ))}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    ...type.footnote,
    color: colors.mutedForeground,
  },
  // Absolutely placed at its own gridline's y, right-aligned into the gutter.
  axisValue: {
    position: 'absolute',
    left: 0,
    ...type.caption,
    color: colors.mutedForeground,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  scrubChip: {
    position: 'absolute',
    // `left: 0` plus a `translateX`: moving by transform keeps the settle off
    // the layout pass. See `ScrubChip`.
    left: 0,
    width: SCRUB_W,
    height: SCRUB_H,
    borderRadius: radius.sm,
    borderWidth: glass.borderWidth,
    borderColor: glass.border,
    // Opaque: this sits over the line it is describing.
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrubValue: {
    ...type.footnote,
    fontWeight: '700',
    color: colors.foreground,
    fontVariant: ['tabular-nums'],
  },
  scrubDate: { ...type.caption, color: colors.mutedForeground },
  dateRow: { height: 16, marginTop: 4 },
  dateText: {
    position: 'absolute',
    ...type.caption,
    color: colors.mutedForeground,
    width: 64,
    marginLeft: -32,
    textAlign: 'center',
  },
  dateFirst: { marginLeft: 0, textAlign: 'left' },
  dateLast: { marginLeft: -64, textAlign: 'right' },
  labels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  label: {
    ...type.caption,
    color: colors.mutedForeground,
  },
  labelStrong: {
    color: colors.foreground,
    fontWeight: '600',
  },
  // Web trend legend: centered, wrapping, 2x2 rounded swatches
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendSwatch: { width: 8, height: 8, borderRadius: 2 },
});
