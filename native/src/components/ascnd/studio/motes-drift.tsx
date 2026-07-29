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

import { MOTE_BANDS, MOTE_PHASE, MOTE_SWAY, MOTES, Specks } from '@/components/ascnd/studio/motes';

/**
 * The motes, drifting — the one thing in the studio that moves.
 *
 * **It lives in its own file so that `koa-studio.tsx` never imports
 * Reanimated.** `preview.mjs` and `stage.mjs` bundle the scene with esbuild
 * and call the components as plain functions; Reanimated pulls in
 * `react-native`, whose Flow syntax esbuild will not parse, so a single
 * import here would take the room's whole verification story with it. The
 * studio stays a pure tree of SVG, and the screen that wants movement passes
 * this in — see `KoaStudio`'s `motes` prop.
 *
 * The scene is otherwise static: it draws once and then costs nothing per
 * frame, which is what lets it sit under a character that does animate. So
 * this is kept to the cheapest shape the rule allows — **one** shared value
 * for the whole room, three group matrices derived from it on the UI thread,
 * and no per-frame work in JS. `StageRenderer` only passes it while the
 * screen is focused, so the clock stops with the screen rather than running
 * behind it.
 */

// `matrix` is the only transform RNSVGGroup takes natively, and it is not in
// GProps — the same cast koa-figure.tsx uses for the same reason.
const AnimatedG = Animated.createAnimatedComponent(
  G as unknown as React.ComponentType<GProps & { matrix?: number[] }>,
);

/** one full cycle, in ms — slow enough to read as air rather than as motion */
const PERIOD = 26000;

const bandOf = (i: number) => MOTES.filter((_, k) => k % MOTE_BANDS === i);

/**
 * One band's matrix.
 *
 * Both terms are whole numbers of cycles in `t` — `sin(a)` and `sin(2a)` —
 * so the loop closes on itself and the motes never jump at the seam.
 */
function Band({ i, t }: { i: number; t: SharedValue<number> }) {
  const [ax, ay] = MOTE_SWAY[i];
  const phase = MOTE_PHASE[i];
  const list = bandOf(i);
  const props = useAnimatedProps<{ matrix: number[] }>(() => {
    const a = 2 * Math.PI * (t.value + phase);
    return { matrix: [1, 0, 0, 1, ax * Math.sin(2 * a), ay * Math.sin(a)] };
  });
  return (
    <AnimatedG animatedProps={props}>
      <Specks list={list} />
    </AnimatedG>
  );
}

export function DriftingMotes() {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = 0;
    t.value = withRepeat(withTiming(1, { duration: PERIOD, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(t);
  }, [t]);
  return (
    <>
      {MOTE_SWAY.map((_, i) => (
        <Band key={i} i={i} t={t} />
      ))}
    </>
  );
}
