import MaskedView from '@react-native-masked-view/masked-view';
import { useIsFocused } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  cancelAnimation,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

import { colors } from '@/constants/ascnd';
import { useReducedMotion } from '@/hooks/use-reduced-motion';

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
 * ── it is dimmer than it reads written down ──
 *
 * Peaks of 0.135 / 0.10 / 0.07 / 0.03, and the dust at about a quarter of what
 * it started at. Both were turned down three times, for the same reason each
 * time: this
 * layer sits behind a screen whose job is to hand somebody four numbers about
 * their body. Anything back here bright enough to be *looked at* is competing
 * with those numbers, and it will win, because motion beats type every time.
 *
 * The test is not whether the aura looks good on its own. It is whether you
 * can read the metric tiles without noticing it — and then notice it when you
 * stop reading.
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
function LightPool({ pool, tint, moving }: { pool: Pool; tint?: string; moving: boolean }) {
  const t = useSharedValue(pool.phase);

  useEffect(() => {
    /*
      One driver per pool, 0 → 1, looping and reversing. Everything the pool
      does is derived from it, so a pool is one animated value rather than four
      running out of step with each other.

      ── and it stops when nobody is looking ──

      This used to be a bare `withRepeat(…, -1)` started on mount, which meant
      four pools and four dust layers kept animating for the rest of the app's
      life: on the Today tab, on Nutrition, under a pushed screen, in the
      background. Eight animations compositing full-screen translucent layers,
      forever, to draw a room nobody was in. That is most of what made the phone
      warm.

      `cancelAnimation` is the whole fix. Restarting from wherever the value
      stopped is deliberate — the pool's position is `cos(t · 2π)`, so every
      phase is a valid one and there is nothing to resynchronise. The first
      cycle back is a little slower than the rest, which at seventeen seconds is
      not a thing an eye can hold.
    */
    if (!moving) {
      cancelAnimation(t);
      return;
    }
    t.value = withRepeat(
      withTiming(t.value + 1, { duration: pool.ms, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [moving, pool.ms, pool.phase, t]);

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
  { id: 'auraState', colour: colors.metricPurple, peak: 0.135, cx: 0.44, cy: 0.31, dx: 34, dy: 44, scale: 0.18, ms: 17000, phase: 0 },
  { id: 'auraViolet', colour: '#7b3dff', peak: 0.10, cx: 0.62, cy: 0.24, dx: 44, dy: 30, scale: 0.15, ms: 23000, phase: 0.33 },
  { id: 'auraCyan', colour: '#22b8ff', peak: 0.07, cx: 0.33, cy: 0.44, dx: 40, dy: 36, scale: 0.17, ms: 29000, phase: 0.66 },
  /* A dim warm one low down, so the bottom of the page is not dead black and
     the cool pools have something to be cool *against*. */
  { id: 'auraWarm', colour: '#ffb37a', peak: 0.03, cx: 0.68, cy: 0.66, dx: 28, dy: 24, scale: 0.13, ms: 13000, phase: 0.5 },
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
     sliding, not as dust hanging in a room.

     ── these have come down three times, and the ratios are the reason ──

     0.42/0.30/0.20/0.14 first, then 0.32/0.22/0.15/0.10, now this. Each pass
     was the same note — still too bright, still competing with the text — and
     the first two were single small steps that did not settle it, so this one
     takes about forty percent off in one go.

     What is held constant is the *spacing between the layers*, roughly 1.5×
     from each to the next. That ratio is the depth: dim them by different
     amounts and the four planes collapse into one sheet of specks, which is
     the failure the layering exists to avoid. So when this needs adjusting
     again, scale all four by the same factor rather than picking new numbers. */
  { key: 'near', ms: 26000, sway: 14, min: 2.0, max: 3.8, opacity: 0.19, count: 9, seed: 3 },
  { key: 'mid', ms: 38000, sway: 10, min: 1.5, max: 2.8, opacity: 0.13, count: 12, seed: 17 },
  { key: 'far', ms: 54000, sway: 7, min: 1.0, max: 2.0, opacity: 0.09, count: 13, seed: 41 },
  { key: 'haze', ms: 74000, sway: 4, min: 0.8, max: 1.5, opacity: 0.06, count: 15, seed: 89 },
];

/**
 * One layer of specks, tiled so it can loop without a seam.
 *
 * The positions are generated from an integer seed rather than `Math.random`,
 * so a layer is identical on every mount and across reloads — dust that
 * rearranges itself when a screen remounts is a thing people notice without
 * being able to say what moved.
 */
function DustField({
  layer,
  height,
  width,
  moving,
}: {
  layer: DustLayer;
  height: number;
  width: number;
  moving: boolean;
}) {
  const t = useSharedValue(0);

  useEffect(() => {
    /* Stopped whenever the screen is not on top — see `LightPool`, which
       explains why the four of these running forever was the expensive part. */
    if (!moving) {
      cancelAnimation(t);
      return;
    }
    t.value = withRepeat(withTiming(1, { duration: layer.ms, easing: Easing.linear }), -1, false);
  }, [moving, layer.ms, t]);

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
              {/*
                No white core any more.

                A speck that reaches pure white is a *highlight*, and the eye
                sorts highlights before it sorts anything else — forty of them
                behind a screen of numbers means forty things competing with the
                numbers for first place. Starting at the hue itself keeps a
                speck coloured light rather than a point of glare.
              */}
              <Stop offset="0" stopColor={h.colour} stopOpacity={0.62} />
              <Stop offset="0.34" stopColor={h.colour} stopOpacity={0.40} />
              <Stop offset="0.66" stopColor={h.colour} stopOpacity={0.12} />
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
  /*
    The light comes up when you arrive.

    Not from black — from 0.55 and a little wide, settling to full over 420ms.
    Same rule the content settles by and for the same reason `screen.tsx`
    records: this page stays mounted, so anything starting at zero has to
    un-draw what is already on screen, and you see the un-drawing.

    Last of the three, by 80ms. The tab bar slides away over ~300ms, the cards
    are down by 340ms (`settle.tsx` explains why those two are the same
    number), and the light finishes after both. Light filling a room is the
    slowest thing in any real arrival, and if the aura landed first it would be
    the cards that looked late.

    It used to be 620ms, against content that took 560ms. Both were nearly
    twice this and the whole arrival read as sluggish — the numbers came down
    together, keeping the order they were in rather than compressing the tail
    onto the rest.
  */
  const focused = useIsFocused();
  const bloom = useSharedValue(0);
  useEffect(() => {
    if (focused) {
      bloom.value = withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) });
    } else {
      bloom.value = 0;
    }
  }, [focused, bloom]);
  const bloomStyle = useAnimatedStyle(() => ({
    opacity: 0.55 + bloom.value * 0.45,
    transform: [{ scale: 1.06 - bloom.value * 0.06 }],
  }));

  const tint =
    state === 'green'
      ? colors.readinessGreen
      : state === 'yellow'
        ? colors.readinessYellow
        : state === 'red'
          ? colors.readinessRed
          : undefined;

  /* The layer's own measured box. `null` until the first layout, and the dust
     is simply not rendered until then — one frame without specks against a
     background that fades in anyway, rather than one frame of specks at the
     wrong scale. */
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);

  /*
    ── when the light is allowed to move ──

    Only while this screen is the one on top, and only if the person has not
    asked the system for less motion.

    `focused` is the expensive half. Nothing used to turn these off: four pools
    and four dust layers kept running for the rest of the app's life, on every
    other tab and underneath every pushed screen, compositing full-screen
    translucent layers to draw a room nobody was in. Both assistant screens
    mount an aura, so opening the coach over the assistant had sixteen
    animations going at once.

    `reduceMotion` is the honest half. The system setting exists for exactly
    this complaint, and a page whose background never stops is the page it was
    written for. Stopped, the aura is still there and still today's colour —
    it just holds still, which is what the setting asks for.
  */
  const reduceMotion = useReducedMotion();
  const moving = focused && !reduceMotion;

  return (
    <Animated.View
      style={[styles.layer, bloomStyle]}
      pointerEvents="none"
      onLayout={(e) => {
        const { width: w, height: h } = e.nativeEvent.layout;
        setBox((prev) => (prev && Math.abs(prev.h - h) < 1 && Math.abs(prev.w - w) < 1 ? prev : { w, h }));
      }}>
      {POOLS.map((p, i) => (
        <LightPool key={p.id} pool={p} tint={i === 0 ? tint : undefined} moving={moving} />
      ))}
      {/*
        ── the dust is masked, and the mask does not move ──

        Every speck used to be able to reach the edge of its canvas at full
        strength, so wherever that canvas ended, the dust ended — in a line. A
        field of specks that stops along a straight horizontal is not dust; it
        reads as a sheet with a torn edge, and against this background the empty
        side of the tear reads as black.

        The mask fixes it in *screen* space: a vertical fade that stays put
        while the dust drifts up through it. That matters — fading the specks by
        their position on the canvas would move the soft band up the screen with
        them, and would also break the loop, because the seam is only invisible
        while the two copies of the pattern are identical.

        One mask around all four layers rather than one each: they share a
        screen and therefore share a fade, and four full-screen masked layers to
        express one gradient is the kind of thing that made this file's own
        comments about a warm phone necessary.
      */}
      {box ? (
        <MaskedView style={StyleSheet.absoluteFill} maskElement={<DustMask />}>
          {DUST.map((d) => (
            /* Measured, not `useWindowDimensions`. Everything else here is
               container-relative — the pools are sized in percentages — and the
               dust alone was sized against the window. Those are the same
               number on a plain full-screen page and different ones under a tab
               bar, behind a header, or on an iPad in a split view, and when
               they differ the canvas no longer lines up with what is on screen. */
            <DustField key={d.key} layer={d} height={box.h} width={box.w} moving={moving} />
          ))}
        </MaskedView>
      ) : null}
    </Animated.View>
  );
}

/**
 * The fade the dust is seen through.
 *
 * Opaque across the middle so the field is unchanged where it is meant to be
 * read, and falling away over the last tenth at each end. `black` is *hide* and
 * `white` is *show* — a mask reads luminance, so the stops here are not colours
 * anybody sees.
 */
function DustMask() {
  return (
    <Svg style={StyleSheet.absoluteFill}>
      <Defs>
        <SvgLinearGradient id="dustFade" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#000" />
          <Stop offset="0.10" stopColor="#fff" />
          <Stop offset="0.90" stopColor="#fff" />
          <Stop offset="1" stopColor="#000" />
        </SvgLinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#dustFade)" />
    </Svg>
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
