import * as React from 'react';
import { useEffect, useState } from 'react';
import Animated, { useAnimatedProps, type SharedValue } from 'react-native-reanimated';
import { G, type GProps } from 'react-native-svg';

import { Bee, BUG_PERIOD, Butterfly, flightAt, ROUTES, type Route } from '@/components/ascnd/studio/bugs';
import { useLoopClock } from '@/components/ascnd/studio/loop-clock';
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

/**
 * The insects' clock.
 *
 * `StageRenderer` owns it rather than this file, because the mascot has to
 * read it too: it glances at whichever insect is sitting still, and the two
 * would drift apart within a minute on separate clocks. One clock, two
 * consumers — see `koa-gaze.ts`.
 *
 * `pause` holds it — freezing the insects mid-flight — while the page scrolls.
 * Their canvas is the whole room, so rather than redraw it every scrolled
 * frame it simply holds: the frozen bitmap is cheap to translate, and there is
 * no reset when the scroll ends, unlike unmounting and remounting the layer.
 * See `useLoopClock`.
 */
export function useBugClock(pause?: SharedValue<boolean>): SharedValue<number> {
  return useLoopClock(BUG_PERIOD, pause);
}

/**
 * Which insects are on screen, as React state rather than as opacity.
 *
 * `flightAt` already returns opacity 0 outside an insect's window — but an
 * invisible animated group is still an animated group: its matrix changes
 * sixty times a second and every change rasterises the canvas it sits on
 * again. Their canvas is the whole room, because that is what their routes
 * cross, so this is the one place where nothing-is-drawn has to mean
 * nothing-is-mounted. Each is away for about nine tenths of the cycle.
 *
 * The schedule is read from **the clock itself**, not from a `Date.now()` taken
 * at mount. The clock is owned two components up and started in its own effect;
 * a second timebase would agree at first and then not, and the failure mode is
 * an insect that unmounts halfway across the room. `t.value` in JS is exactly
 * what the worklets see.
 *
 * It sleeps until the next transition rather than polling: six timers per
 * seventy-two seconds, and no wakeups in between.
 */
function useOnScreen(t: SharedValue<number>): boolean[] {
  const [on, setOn] = useState<boolean[]>(() => ROUTES.map(() => false));
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const now = t.value;
      const next: boolean[] = [];
      // how far, in cycle units, until the first of them changes state
      let soonest = 1;
      for (const r of ROUTES) {
        const c = (now + 1 - r.phase) % 1;
        const vis = c <= r.span;
        next.push(vis);
        const d = vis ? r.span - c : 1 - c;
        if (d < soonest) soonest = d;
      }
      setOn((was) => (was.every((v, i) => v === next[i]) ? was : next));
      // a hair past the boundary, so the timer never lands just short of it
      timer = setTimeout(tick, soonest * BUG_PERIOD + 30);
    };
    tick();
    return () => clearTimeout(timer);
  }, [t]);
  return on;
}

export function FlyingBugs({ t }: { t: SharedValue<number> }) {
  const on = useOnScreen(t);
  return (
    <>
      {on[0] ? (
        <Flyer r={ROUTES[0]} t={t}>
          <Bee />
        </Flyer>
      ) : null}
      {on[1] ? (
        <Flyer r={ROUTES[1]} t={t}>
          <Butterfly tint={C.soft} />
        </Flyer>
      ) : null}
      {on[2] ? (
        <Flyer r={ROUTES[2]} t={t}>
          {/* a pale moth — see `Butterfly` on why the second one is not purple */}
          <Butterfly tint={C.white} alpha={0.5} />
        </Flyer>
      ) : null}
    </>
  );
}
