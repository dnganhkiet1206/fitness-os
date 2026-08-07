import { useEffect, useMemo } from 'react';
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
 * Neon dust, drifting up.
 *
 * ── why it is layers and not motes ──
 *
 * The obvious build is one `Animated.View` per speck. At dust scale you want
 * forty or more of them, and forty animated views to draw forty circles is a
 * lot of machinery for very little ink.
 *
 * These are four layers instead, each holding a dozen static specks and each
 * rising at its own speed. That reads as independent dust for the same reason
 * a parallax starfield does — the eye reconstructs depth from the speed
 * difference and never audits whether two specks in the same plane keep their
 * spacing. Four animated views, a hundred-odd circles, none of the circles
 * ever touched after mount.
 *
 * ── the loop is seamless by construction ──
 *
 * A layer that rises off the top and jumps back to the bottom shows the jump
 * as a sweep — every speck in it vanishing and reappearing at once. So each
 * layer is **twice the screen tall with its pattern duplicated exactly one
 * screen-height down**, and it travels exactly one screen-height before
 * repeating. At the moment it resets, the copy has arrived precisely where the
 * original was: nothing on screen changes. No fade is needed, and none is used.
 *
 * ── a speck is a glow, not a ring ──
 *
 * The bubbles this replaced were hollow — bright at the rim, empty in the
 * middle — which is how a soap film reads at 90pt. At 5pt a hollow ring is
 * simply invisible: there is no room for a rim and a middle. So a speck is the
 * other thing, a lit core falling off into its own halo, which is what "neon"
 * means at this size.
 */

/** The four neon hues, and one gradient each rather than one per speck. */
const DUST_HUES = [
  { id: 'dCy', colour: '#22e6ff' },
  { id: 'dVi', colour: '#b45cff' },
  { id: 'dMi', colour: '#2bf5a8' },
  { id: 'dWa', colour: '#ffd9b3' },
] as const;

interface DustLayer {
  key: string;
  /** how far up it travels per cycle, as a multiple of screen height */
  ms: number;
  sway: number;
  /** speck radius range, in points */
  min: number;
  max: number;
  opacity: number;
  count: number;
  seed: number;
}

const DUST: DustLayer[] = [
  /* Nearest: biggest, brightest, fastest. Furthest: barely there. The spread
     is what produces depth — a single layer at one speed reads as a texture
     sliding, not as dust hanging in a room. */
  { key: 'near', ms: 26000, sway: 14, min: 2.2, max: 4.4, opacity: 0.95, count: 11, seed: 3 },
  { key: 'mid', ms: 38000, sway: 10, min: 1.6, max: 3.2, opacity: 0.7, count: 14, seed: 17 },
  { key: 'far', ms: 54000, sway: 7, min: 1.1, max: 2.3, opacity: 0.5, count: 16, seed: 41 },
  { key: 'haze', ms: 74000, sway: 4, min: 0.8, max: 1.6, opacity: 0.34, count: 18, seed: 89 },
];

/**
 * One layer of specks, tiled so it can loop without a seam.
 *
 * The positions are generated from an integer seed rather than `Math.random`,
 * so a layer is identical on every mount and across reloads — dust that
 * rearranges itself when a screen remounts is a thing people notice without
 * being able to say what moved.
 */
function DustField({ layer, height, width }: { layer: DustLayer; height: number; width: number }) {
  const t = useSharedValue(0);

  useEffect(() => {
    t.value = 0;
    t.value = withRepeat(withTiming(1, { duration: layer.ms, easing: Easing.linear }), -1, false);
  }, [layer.ms, t]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateY: -t.value * height },
      { translateX: Math.sin(t.value * Math.PI * 2) * layer.sway },
    ],
  }));

  const specks = useMemo(() => {
    let s = layer.seed;
    const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const out: { x: number; y: number; r: number; hue: string; o: number }[] = [];
    for (let i = 0; i < layer.count; i++) {
      const x = rnd() * width;
      const y = rnd() * height;
      const r = layer.min + rnd() * (layer.max - layer.min);
      const hue = DUST_HUES[Math.floor(rnd() * DUST_HUES.length)].id;
      const o = (0.55 + rnd() * 0.45) * layer.opacity;
      // the speck, and its copy exactly one screen down — this is the seam fix
      out.push({ x, y, r, hue, o }, { x, y: y + height, r, hue, o });
    }
    return out;
  }, [layer, height, width]);

  /* The halo is drawn as a second, wider circle rather than by blurring the
     first: there are no filter primitives on native. Two circles per speck is
     the whole trick, and both are static. */
  return (
    <Animated.View style={[styles.dust, { width, height: height * 2 }, style]} pointerEvents="none">
      <Svg width={width} height={height * 2}>
        <Defs>
          {DUST_HUES.map((h) => (
            <RadialGradient key={h.id} id={`${h.id}${layer.key}`}>
              <Stop offset="0" stopColor="#ffffff" stopOpacity={0.95} />
              <Stop offset="0.28" stopColor={h.colour} stopOpacity={0.85} />
              <Stop offset="0.6" stopColor={h.colour} stopOpacity={0.22} />
              <Stop offset="1" stopColor={h.colour} stopOpacity={0} />
            </RadialGradient>
          ))}
        </Defs>
        {specks.map((sp, i) => (
          <Circle
            key={i}
            cx={sp.x}
            cy={sp.y}
            r={sp.r * 3.2}
            fill={`url(#${sp.hue}${layer.key})`}
            opacity={sp.o}
          />
        ))}
      </Svg>
    </Animated.View>
  );
}

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

  const { height, width } = useWindowDimensions();

  return (
    <View style={styles.layer} pointerEvents="none">
      {POOLS.map((p, i) => (
        <LightPool key={p.id} pool={p} tint={i === 0 ? tint : undefined} />
      ))}
      {DUST.map((d) => (
        <DustField key={d.key} layer={d} height={height} width={width} />
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
  /* Starts at the top and travels up by exactly one screen height. It is two
     screens tall, so the half below the fold is always ready to take over. */
  dust: { position: 'absolute', left: 0, top: 0 },
});
