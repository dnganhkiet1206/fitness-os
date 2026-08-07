import { useEffect } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { colors } from '@/constants/ascnd';

/**
 * The room's light, moving.
 *
 * ── what replaced what ──
 *
 * The reference for this screen has a rendered 3-D orb as its hero. This is
 * the same job done as *light* rather than as an object: a few very large,
 * very soft pools drifting behind the content, the way WHOOP lets your
 * recovery colour breathe under the whole screen instead of drawing a thing
 * for you to look at.
 *
 * It is better for this screen for a reason that has nothing to do with cost.
 * An orb is the same orb every morning; the aura's *colour is today's
 * readiness*, so the screen is already telling you something before you have
 * read a word of it. And nothing here competes with the cards on top — light
 * is the one kind of decoration that cannot become the subject.
 *
 * ── why every animated value is a transform ──
 *
 * ── the pools are tight, not wide ──
 *
 * `rx` began at 0.42 of a layer already drawn at 200% size, which spread each
 * pool so far that its peak never got bright anywhere — the screen read as one
 * flat grey-green wash rather than as light with a source. 0.26 concentrates
 * the same opacity into a bloom you can point at, and the long tail on the
 * falloff still keeps it from having an edge.
 *
 * `AmbientLight` records the other constraint this is built around: `react-native-svg`
 * re-rasterises an `<Svg>` when any child prop changes. Animating gradient
 * stops or a `<Rect>`'s geometry would therefore redraw the whole layer every
 * frame, which is the most expensive way to move a blurry shape that exists.
 *
 * So each pool's `<Svg>` is **entirely static** — drawn once, at mount — and
 * what moves is the `Animated.View` wrapped around it. Translate, scale and
 * opacity are composited by the platform without touching the rasterised
 * bitmap, so eight seconds of drift costs the same as sitting still.
 *
 * ── the timings are deliberately not round ──
 *
 * 17s, 23s, 29s, 13s. Co-prime-ish durations mean the four pools do not come
 * back into the same arrangement for several minutes; on round numbers they
 * resynchronise every few loops and the eye finds the repeat immediately —
 * which is the moment ambient light stops being weather and becomes an
 * animation somebody wrote.
 */

/** Falloff shared with `AmbientLight`: steep, then a tail that never lands. */
const CURVE = [
  { at: 0, of: 1 },
  { at: 0.3, of: 0.55 },
  { at: 0.55, of: 0.24 },
  { at: 0.8, of: 0.07 },
  { at: 1, of: 0 },
] as const;

interface Pool {
  id: string;
  colour: string;
  peak: number;
  /** where the pool sits, as a fraction of the layer */
  cx: number;
  cy: number;
  /** how far it drifts, in points */
  dx: number;
  dy: number;
  scale: number;
  ms: number;
  /** fraction of a cycle this pool starts at, so they never move together */
  phase: number;
}

/**
 * One pool: a static gradient in a moving frame.
 *
 * The `<Svg>` is 2× the layer in each direction and centred, so that a pool
 * whose peak sits near an edge still has room for its whole tail. A gradient
 * clipped at the layer boundary shows the cut as a straight edge, and a
 * straight edge is the one thing light never has.
 */
function LightPool({ pool, tint }: { pool: Pool; tint?: string }) {
  const t = useSharedValue(pool.phase);

  useEffect(() => {
    /*
      One driver per pool, 0 → 1, looping and reversing. Everything the pool
      does is derived from it, so a pool is one animated value rather than
      four running out of step with each other.
    */
    t.value = withRepeat(
      withTiming(pool.phase + 1, { duration: pool.ms, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [pool.ms, pool.phase, t]);

  const style = useAnimatedStyle(() => {
    const a = t.value * Math.PI * 2;
    return {
      transform: [
        { translateX: Math.cos(a) * pool.dx },
        { translateY: Math.sin(a * 0.7) * pool.dy },
        { scale: 1 + Math.sin(a * 0.5) * pool.scale },
      ],
      opacity: 0.72 + (Math.sin(a * 0.85) + 1) / 2 * 0.28,
    };
  });

  const colour = tint ?? pool.colour;

  return (
    <Animated.View style={[styles.pool, style]} pointerEvents="none">
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <RadialGradient
            id={pool.id}
            cx={pool.cx}
            cy={pool.cy}
            rx={0.26}
            ry={0.22}
            gradientUnits="objectBoundingBox">
            {CURVE.map((p) => (
              <Stop key={p.at} offset={p.at} stopColor={colour} stopOpacity={pool.peak * p.of} />
            ))}
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${pool.id})`} />
      </Svg>
    </Animated.View>
  );
}

const POOLS: Pool[] = [
  /* The state pool. Its colour is overridden by today's readiness — it is the
     one that makes the screen mean something before you read it. */
  { id: 'auraState', colour: colors.metricPurple, peak: 0.27, cx: 0.44, cy: 0.31, dx: 34, dy: 44, scale: 0.18, ms: 17000, phase: 0 },
  { id: 'auraViolet', colour: '#7b3dff', peak: 0.20, cx: 0.62, cy: 0.24, dx: 44, dy: 30, scale: 0.15, ms: 23000, phase: 0.33 },
  { id: 'auraCyan', colour: '#22b8ff', peak: 0.14, cx: 0.33, cy: 0.44, dx: 40, dy: 36, scale: 0.17, ms: 29000, phase: 0.66 },
  /* A dim warm one low down, so the bottom of the page is not dead black and
     the cool pools have something to be cool *against*. */
  { id: 'auraWarm', colour: '#ffb37a', peak: 0.065, cx: 0.68, cy: 0.66, dx: 28, dy: 24, scale: 0.13, ms: 13000, phase: 0.5 },
];

/**
 * One bubble, rising.
 *
 * ── what a bubble is here ──
 *
 * Not a filled disc. The gradient is nearly empty in the middle and brightest
 * just inside its edge, which is how a soap film actually reads — light passes
 * through the thin part and catches on the rim. A filled circle at the same
 * opacity looks like a smudge on the lens; the hollow one looks like something
 * suspended in front of it.
 *
 * ── the drift does not reverse ──
 *
 * The pools breathe back and forth because that is what light does. Bubbles
 * rise, and rising and then un-rising is the one thing that would announce
 * this as an animation. So the driver is a sawtooth — `withRepeat(…, -1,
 * false)` — running from below the screen to above it, and the opacity ramps
 * in and out at the two ends so the reset never lands anywhere visible.
 *
 * The horizontal wobble is a sine of the *same* driver at a fractional
 * frequency, so a bubble does not drift back to where it started when the
 * cycle repeats; over one pass it makes about one and a half sways, and no two
 * bubbles share a period.
 */
function Bubble({ b, height }: { b: BubbleSpec; height: number }) {
  const t = useSharedValue(b.phase);

  useEffect(() => {
    t.value = b.phase;
    t.value = withRepeat(
      withTiming(b.phase + 1, { duration: b.ms, easing: Easing.linear }),
      -1,
      false,
    );
  }, [b.ms, b.phase, t]);

  const style = useAnimatedStyle(() => {
    const p = t.value % 1;
    /* fade in over the first eighth, out over the last fifth — the sawtooth's
       jump happens while the bubble is invisible at both ends */
    const fade = Math.min(1, p / 0.12) * Math.min(1, (1 - p) / 0.2);
    return {
      opacity: fade * b.opacity,
      transform: [
        { translateY: (0.5 - p) * (height + b.size * 2) },
        { translateX: Math.sin(p * Math.PI * 3) * b.sway },
        { scale: 0.92 + p * 0.16 },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        styles.bubble,
        {
          left: `${b.x * 100}%`,
          width: b.size,
          height: b.size,
          /* `left`/`top` place the bubble's corner; these pull it back by half
             its own size so the given position is its centre. They have to be
             per-bubble because the sizes run from 34 to 136 — a constant here
             would offset every bubble but one. */
          marginLeft: -b.size / 2,
          marginTop: -b.size / 2,
        },
        style,
      ]}>
      <Svg width="100%" height="100%" viewBox="0 0 100 100">
        <Defs>
          <RadialGradient id={b.id}>
            <Stop offset="0" stopColor={b.colour} stopOpacity={0.03} />
            <Stop offset="0.58" stopColor={b.colour} stopOpacity={0.06} />
            <Stop offset="0.86" stopColor={b.colour} stopOpacity={0.30} />
            <Stop offset="0.97" stopColor={b.colour} stopOpacity={0.10} />
            <Stop offset="1" stopColor={b.colour} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx="50" cy="50" r="50" fill={`url(#${b.id})`} />
      </Svg>
    </Animated.View>
  );
}

interface BubbleSpec {
  id: string;
  x: number;
  size: number;
  sway: number;
  opacity: number;
  ms: number;
  phase: number;
  colour: string;
}

/*
  Nine of them, sizes and periods deliberately unrelated.

  Few enough that they read as occasional rather than as weather, and slow
  enough — 26 to 52 seconds for a full pass — that nothing crosses the screen
  while you are reading a card. A bubble you can watch travel is a bubble
  competing with the text.
*/
const BUBBLES: BubbleSpec[] = [
  { id: 'bub1', x: 0.08, size: 96, sway: 16, opacity: 0.85, ms: 41000, phase: 0.0, colour: '#c9b6ff' },
  { id: 'bub2', x: 0.62, size: 58, sway: 22, opacity: 0.7, ms: 33000, phase: 0.28, colour: '#8fd8ff' },
  { id: 'bub3', x: 0.34, size: 136, sway: 12, opacity: 0.6, ms: 52000, phase: 0.55, colour: '#b79bff' },
  { id: 'bub4', x: 0.84, size: 44, sway: 26, opacity: 0.9, ms: 27000, phase: 0.13, colour: '#a8ffe0' },
  { id: 'bub5', x: 0.2, size: 34, sway: 30, opacity: 0.75, ms: 26000, phase: 0.71, colour: '#ffd9b3' },
  { id: 'bub6', x: 0.71, size: 112, sway: 14, opacity: 0.5, ms: 47000, phase: 0.42, colour: '#9fc4ff' },
  { id: 'bub7', x: 0.46, size: 40, sway: 24, opacity: 0.8, ms: 31000, phase: 0.86, colour: '#e0c4ff' },
  { id: 'bub8', x: 0.93, size: 74, sway: 18, opacity: 0.55, ms: 38000, phase: 0.62, colour: '#8fd8ff' },
  { id: 'bub9', x: 0.02, size: 52, sway: 20, opacity: 0.7, ms: 29000, phase: 0.35, colour: '#c9b6ff' },
];

/**
 * @param state today's readiness, if it is known — recolours the leading pool
 */
export function AssistantAura({ state }: { state?: 'green' | 'yellow' | 'red' | null }) {
  const tint =
    state === 'green'
      ? colors.readinessGreen
      : state === 'yellow'
        ? colors.readinessYellow
        : state === 'red'
          ? colors.readinessRed
          : undefined;

  const { height } = useWindowDimensions();

  return (
    <View style={styles.layer} pointerEvents="none">
      {POOLS.map((p, i) => (
        <LightPool key={p.id} pool={p} tint={i === 0 ? tint : undefined} />
      ))}
      {BUBBLES.map((b) => (
        <Bubble key={b.id} b={b} height={height} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' },
  /* Twice the layer, centred by the negative offsets — see `LightPool`: a pool
     needs room for its tail or its edge becomes a drawn line. */
  pool: {
    position: 'absolute',
    left: '-50%',
    top: '-50%',
    width: '200%',
    height: '200%',
  },
  /* Anchored at the middle of the layer; `translateY` carries it from below the
     screen to above. The half-size offsets are applied per bubble at the call
     site — see the comment there. */
  bubble: { position: 'absolute', top: '50%' },
});
