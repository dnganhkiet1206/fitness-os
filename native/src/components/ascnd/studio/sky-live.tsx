import * as React from 'react';
import { useEffect } from 'react';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedProps,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { Circle, G, Line, type CircleProps, type GProps } from 'react-native-svg';

import { C } from '@/components/ascnd/studio/palette';
import { STAR_POINTS } from '@/components/ascnd/studio/window';

/**
 * What moves in the window: the stars twinkling, and a shooting star.
 *
 * Both are here rather than in `window.tsx` for the reason the whole overlay
 * exists — `react-native-svg` re-rasterises a whole `<Svg>` when any child
 * prop changes, so nothing in `KoaStudio` may animate. Both are also tiny,
 * which is the *other* rule: six 1pt circles and one 14pt line, against a
 * beam that covers half the screen and is why the phone once ran hot.
 *
 * The moon is not here. Its phase changes over days, not frames, so it is
 * geometry in `window.tsx` and costs nothing.
 */

const AnimatedCircle = Animated.createAnimatedComponent(
  Circle as unknown as React.ComponentType<CircleProps & { opacity?: number }>,
);
const AnimatedG = Animated.createAnimatedComponent(
  G as unknown as React.ComponentType<GProps & { opacity?: number; matrix?: number[] }>,
);

/**
 * One cycle for the sky, in ms.
 *
 * Long, because the shooting star has to be rare — it shows for about a
 * second of this, once. Unrelated to the light's 7.3s and the motes' 26s so
 * the three never fall into step.
 */
const PERIOD = 19000;

/**
 * How often each star blinks, in cycles.
 *
 * Coprime-ish so no two stars ever blink together, which is what stops the
 * window reading as one flashing panel.
 */
const BLINK = [2, 3, 5, 7, 11, 13];

export function useSkyClock(): SharedValue<number> {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = 0;
    t.value = withRepeat(withTiming(1, { duration: PERIOD, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(t);
  }, [t]);
  return t;
}

/**
 * A star, mostly steady with an occasional flare.
 *
 * The raised cosine is taken to the sixth power on purpose: a plain sine
 * would have every star breathing all the time, which reads as a pulse rather
 * than as a twinkle. This spends most of the cycle near the floor and spikes
 * briefly.
 */
function Star({ x, y, r, n, t }: { x: number; y: number; r: number; n: number; t: SharedValue<number> }) {
  const props = useAnimatedProps<{ opacity: number }>(() => {
    const u = (1 + Math.cos(2 * Math.PI * (n * t.value + x * 0.017))) / 2;
    return { opacity: 0.45 + 0.5 * u ** 6 };
  });
  return <AnimatedCircle cx={x} cy={y} r={r} fill={C.white} animatedProps={props} />;
}

export function TwinklingStars({ t }: { t: SharedValue<number> }) {
  return (
    <>
      {STAR_POINTS.map(([x, y, r], i) => (
        <Star key={i} x={x} y={y} r={r} n={BLINK[i % BLINK.length]} t={t} />
      ))}
    </>
  );
}

/* ── the shooting star ────────────────────────────────────────────────── */

/**
 * Where it runs, in artboard units.
 *
 * Both ends and the tail stay inside the glass — the sky box is x 278–361,
 * y 101–206, and the tail reaches 14 units back up-left of the head, so the
 * start sits at least that far inside. That is why there is no clip path
 * here: keeping it in bounds by construction is cheaper than one. **Check it
 * again if these move.**
 */
const FROM = { x: 296, y: 110 };
const TO = { x: 350, y: 136 };
/** the fraction of the cycle it is visible for — about a second in nineteen */
const SHOW = 0.06;
const AT = 0.72;

export function ShootingStar({ t }: { t: SharedValue<number> }) {
  const props = useAnimatedProps<{ matrix: number[]; opacity: number }>(() => {
    const u = Math.min(1, Math.max(0, (t.value - AT) / SHOW));
    // nothing to draw for most of the cycle, and the ends fade rather than
    // snap — a streak that appears at full strength reads as a glitch
    const opacity = u <= 0 || u >= 1 ? 0 : Math.sin(Math.PI * u) * 0.9;
    return {
      matrix: [1, 0, 0, 1, FROM.x + (TO.x - FROM.x) * u, FROM.y + (TO.y - FROM.y) * u],
      opacity,
    };
  });
  return (
    <AnimatedG animatedProps={props}>
      <Line x1={0} y1={0} x2={-14} y2={-7} stroke={C.white} strokeWidth={1.2} strokeLinecap="round" />
    </AnimatedG>
  );
}
