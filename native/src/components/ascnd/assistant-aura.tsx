import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

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
  { id: 'auraState', colour: colors.metricPurple, peak: 0.42, cx: 0.44, cy: 0.31, dx: 26, dy: 34, scale: 0.16, ms: 17000, phase: 0 },
  { id: 'auraViolet', colour: '#7b3dff', peak: 0.32, cx: 0.62, cy: 0.24, dx: 34, dy: 22, scale: 0.13, ms: 23000, phase: 0.33 },
  { id: 'auraCyan', colour: '#22b8ff', peak: 0.22, cx: 0.33, cy: 0.44, dx: 30, dy: 28, scale: 0.15, ms: 29000, phase: 0.66 },
  /* A dim warm one low down, so the bottom of the page is not dead black and
     the cool pools have something to be cool *against*. */
  { id: 'auraWarm', colour: '#ffb37a', peak: 0.10, cx: 0.68, cy: 0.66, dx: 22, dy: 18, scale: 0.12, ms: 13000, phase: 0.5 },
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

  return (
    <View style={styles.layer} pointerEvents="none">
      {POOLS.map((p, i) => (
        <LightPool key={p.id} pool={p} tint={i === 0 ? tint : undefined} />
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
});
