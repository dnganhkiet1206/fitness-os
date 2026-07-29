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
import { G, type GProps } from 'react-native-svg';

import { Bee, BUG_PERIOD, Butterfly, flightAt, ROUTES, type Route } from '@/components/ascnd/studio/bugs';
import { C } from '@/components/ascnd/studio/palette';

/**
 * A bee and two butterflies crossing the room now and then.
 *
 * ── the budget ──
 *
 * The room's rule is that nothing large may animate: **shape count is not the
 * cost, covered area is** — nine full-height trapezoids at 60fps is what made
 * the phone hot, not the nine shapes. These are the smallest things in the
 * studio, about three points across on the phone, so three of them cover less
 * than the lamp's mouth does.
 *
 * What they cost is invalidation sources, and that is why each one is **a
 * single animated group**. Position, tilt and wingbeat all come out of one
 * matrix: `translate · rotate · scale(sx, 1)`. Giving the wings a group of
 * their own would have been tidier and doubled the count. The body squashing
 * with the wings is not a compromise you can see at three points.
 *
 * They share one clock, unrelated to the motes' 26s and the light's 7.3s so
 * the three never fall into step.
 *
 * ── "now and then" ──
 *
 * Each insect is on screen for a fraction of the cycle and gone for the rest,
 * with the fractions offset so they rarely overlap. Over 41 seconds the bee
 * gets nine, one butterfly eleven and the other twelve — so the room is empty
 * about two thirds of the time, which is what makes it a thing you notice
 * rather than a thing that is always there.
 *
 * They cross the upper half of the room. The studio's "centre stays empty"
 * rule is about furniture — something standing in front of the character — and
 * a bee that takes four seconds to cross is the opposite of that. It is still
 * routed above the mascot's head rather than through it.
 */

// `matrix` is the only transform RNSVGGroup takes natively, and it is not in
// GProps — the same cast koa-figure.tsx and motes-drift.tsx use.
const AnimatedG = Animated.createAnimatedComponent(
  G as unknown as React.ComponentType<GProps & { matrix?: number[]; opacity?: number }>,
);

/** one insect, one animated group — the maths is `flightAt` in `bugs.tsx` */
function Flyer({ r, t, children }: { r: Route; t: SharedValue<number>; children: React.ReactNode }) {
  const props = useAnimatedProps<{ matrix: number[]; opacity: number }>(() => {
    'worklet';
    return flightAt(r, t.value);
  });
  return <AnimatedG animatedProps={props}>{children}</AnimatedG>;
}

export function FlyingBugs() {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = 0;
    t.value = withRepeat(withTiming(1, { duration: BUG_PERIOD, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(t);
  }, [t]);
  return (
    <>
      <Flyer r={ROUTES[0]} t={t}>
        <Bee />
      </Flyer>
      <Flyer r={ROUTES[1]} t={t}>
        <Butterfly tint={C.soft} />
      </Flyer>
      <Flyer r={ROUTES[2]} t={t}>
        {/* a pale moth — see `Butterfly` on why the second one is not purple */}
        <Butterfly tint={C.white} alpha={0.5} />
      </Flyer>
    </>
  );
}
