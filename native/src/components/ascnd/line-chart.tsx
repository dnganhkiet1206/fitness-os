import * as Haptics from 'expo-haptics';
import { useId, useRef, useState } from 'react';
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
  /** BCP-47 tag for the date axis — pass `getLocale(lang)`. */
  locale?: string;
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
export function LineChart({ points, color = colors.primary, height = 140, unit = '', emptyLabel = 'Not enough data yet', goal, goalLabel, grid = false, ambient = false, locale }: LineChartProps) {
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

  /** index of the reading being pointed at, or none */
  const [scrub, setScrub] = useState<number | null>(null);
  /** the same index, readable within a frame — see `track` below */
  const lastScrub = useRef<number | null>(null);
  /*
    Where the drag began, and which way it turned out to go.

    Up here with the other hooks, not down beside the handlers that use them.
    The `points.length < 2` return is a few lines below, so a `useRef` declared
    after it is skipped entirely on a chart with too little data — the hook
    order changes between renders and React tears the component down. `tsc` has
    nothing to say about it: the types are all fine.
  */
  const track0 = useRef<{ x: number; y: number } | null>(null);
  const axis = useRef<'h' | 'v' | null>(null);

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
  const padX = grid ? 34 : 0;
  const plotW = Math.max(0, width - padX);

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

    `react-native-gesture-handler` is installed but nothing in the app uses it,
    and `Gesture.Pan` needs a `GestureHandlerRootView` wrapped around the app.
    Adding a provider at the root to put a readout on one chart is a change to
    every screen for the benefit of one. The responder system is in RN core,
    needs nothing, and a horizontal scrubber is exactly what it is for.

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
  /*
    Bounds-checked, because the series can change underneath a live selection.

    The range buttons swap `points` for a shorter array while an index is held.
    Without the length test the indicator would keep pointing at slot 40 of a
    five-point week and name whatever reading now sits there — a wrong date
    against a wrong weight, which is worse than showing nothing. Out of range
    means the reading is not in this window, so it clears.
  */
  const at = scrub != null && scrub < points.length ? points[scrub] : null;

  /*
    Move to a reading, and tick when it changes.

    `selectionAsync` is the picker-wheel tap, which is what this is: the finger
    slides continuously and the selection lands on one reading at a time, so
    each landing gets the same small confirmation a wheel detent does. It fires
    on *change*, not on movement — a haptic on every `onResponderMove` is
    sixty a second, which stops being feedback and becomes a vibration.

    The last index is kept in a ref rather than read from state: `setScrub`
    does not update `scrub` until the next render, so two moves inside one frame
    would both compare against the stale value and double-tick.
  */
  const track = (e: GestureResponderEvent) => {
    const i = nearest(e.nativeEvent.locationX);
    if (i !== lastScrub.current) {
      lastScrub.current = i;
      Haptics.selectionAsync();
      setScrub(i);
    }
  };

  /*
    Hand the touch back only while the drag might still be a scroll.

    This started as an unconditional `() => true`, which is the bug that makes a
    scrubber unusable: a vertical ScrollView asks for the touch as soon as the
    finger travels past its slop, and saying yes every time means a horizontal
    drag gets taken away part-way across and the indicator stops dead. It looks
    like the chart only lets you reach the middle.

    So the direction is decided once, on the first movement past four points,
    and after that a horizontal drag refuses to give the touch up while a
    vertical one still hands it over. Before the decision the answer stays yes,
    which is what keeps the page scrollable from a finger that landed here.
  */
  const responder = scrubbable
    ? {
        onStartShouldSetResponder: () => true,
        onMoveShouldSetResponder: () => true,
        onResponderGrant: (e: GestureResponderEvent) => {
          track0.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
          axis.current = null;
          lastScrub.current = null;
          track(e);
        },
        onResponderMove: (e: GestureResponderEvent) => {
          const s = track0.current;
          if (s && axis.current === null) {
            const dx = Math.abs(e.nativeEvent.pageX - s.x);
            const dy = Math.abs(e.nativeEvent.pageY - s.y);
            if (dx > 4 || dy > 4) axis.current = dx >= dy ? 'h' : 'v';
          }
          if (axis.current !== 'v') track(e);
        },
        onResponderTerminationRequest: () => axis.current !== 'h',
        onResponderRelease: () => {
          track0.current = null;
          axis.current = null;
        },
        onResponderTerminate: () => {
          track0.current = null;
          axis.current = null;
        },
      }
    : {};

  /* Where the readout chip sits: above the picked point, clamped into the plot
     so neither end of the series pushes it off the card. */
  const chip = at
    ? {
        left: Math.max(padX, Math.min(width - SCRUB_W, x(scrub!) - SCRUB_W / 2)),
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
                    y={y(goal) - 5 < 10 ? y(goal) + 12 : y(goal) - 5}
                    fill={colors.mutedForeground}
                    fontSize={9}
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
            <Path
              d={path}
              stroke={color}
              strokeWidth={grid ? 3 : 2.5}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
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
            {at ? (
              <>
                <Line
                  x1={x(scrub!)}
                  x2={x(scrub!)}
                  y1={0}
                  y2={height}
                  stroke={color}
                  strokeOpacity={0.45}
                  strokeWidth={1}
                />
                <Circle cx={x(scrub!)} cy={y(at.value)} r={7} fill={color} fillOpacity={0.22} />
                <Circle
                  cx={x(scrub!)}
                  cy={y(at.value)}
                  r={4}
                  fill={color}
                  stroke={colors.background}
                  strokeWidth={1.5}
                />
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
            <View style={[styles.scrubChip, chip]} pointerEvents="none">
              <Text style={styles.scrubValue}>{fmt(at.value)}</Text>
              <Text style={styles.scrubDate}>
                {new Date(`${at.date}T00:00:00`).toLocaleDateString(locale, {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </Text>
            </View>
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
          ) : (
            <View style={styles.labels}>
              <Text style={styles.label}>{fmt(min)}</Text>
              <Text style={[styles.label, styles.labelStrong]}>{fmt(values[values.length - 1])}</Text>
              <Text style={styles.label}>{fmt(max)}</Text>
            </View>
          )}
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
