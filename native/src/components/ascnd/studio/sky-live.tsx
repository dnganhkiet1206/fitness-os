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
import { Circle, ClipPath, Defs, G, Line, Rect, type CircleProps, type GProps } from 'react-native-svg';

import { C } from '@/components/ascnd/studio/palette';
import { GLASS, MULLIONS, STAR_POINTS } from '@/components/ascnd/studio/window';

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
 * second of this, once, so the streak comes round roughly every three
 * quarters of a minute. Unrelated to the light's 7.3s and the motes' 26s so
 * the three never fall into step.
 *
 * The blink rates below are scaled with it, so lengthening this makes the
 * streak rarer without slowing the twinkle.
 */
const PERIOD = 45000;

/**
 * How often each star blinks, in cycles.
 *
 * Coprime-ish so no two stars ever blink together, which is what stops the
 * window reading as one flashing panel.
 */
const BLINK = [5, 7, 11, 13, 17, 19];

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

/**
 * The sky, behind the window it belongs to.
 *
 * Everything the overlay draws sits above the whole room, so without this the
 * stars and the streak would be in front of the frame and the glazing bars
 * rather than behind them — a star sat on a bar and the shooting star crossed
 * one before this was here. The clip keeps them inside the glass, and the bars
 * are drawn again on top so they occlude properly.
 */
export function LiveSky({ t }: { t: SharedValue<number> }) {
  return (
    <>
      <Defs>
        <ClipPath id="studioGlass">
          <Rect x={GLASS.x} y={GLASS.y} width={GLASS.w} height={GLASS.h} rx={GLASS.r} />
        </ClipPath>
      </Defs>
      <G clipPath="url(#studioGlass)">
        {STAR_POINTS.map(([x, y, r], i) => (
          <Star key={i} x={x} y={y} r={r} n={BLINK[i % BLINK.length]} t={t} />
        ))}
        <ShootingStar t={t} />
      </G>
      {MULLIONS.map(([x, y, w, h], i) => (
        <Rect key={i} x={x} y={y} width={w} height={h} fill={C.primary} />
      ))}
    </>
  );
}

/* ── the shooting star ────────────────────────────────────────────────── */

/**
 * Where it runs, in artboard units.
 *
 * It starts just outside the glass and leaves past the far edge — `LiveSky`
 * clips it, so it enters and exits rather than winking on in mid-air, and it
 * cannot stray onto the frame however these move. The clip is what makes that
 * safe; an earlier version relied on keeping the head *and its 14-unit tail*
 * inside by arithmetic, and the tail still crossed the glazing bar.
 */
const FROM = { x: 282, y: 97 };
const TO = { x: 372, y: 141 };
/** the fraction of the cycle it is visible for — about a second in forty-five */
const SHOW = 0.025;
const AT = 0.72;

function ShootingStar({ t }: { t: SharedValue<number> }) {
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
