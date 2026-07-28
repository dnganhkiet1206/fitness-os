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
import { Ellipse, G, type EllipseProps, type GProps } from 'react-native-svg';

import { C } from '@/components/ascnd/studio/palette';
import { STAGE_GLOW, stageGlowOpacity } from '@/components/ascnd/studio/platform';
import { ConeDefs, Cones, Lamp } from '@/components/ascnd/studio/spotlight';

/**
 * The room's light, alive.
 *
 * The studio used to be a static scene on principle. That rule was lifted by
 * the user on 2026-07-28 — the room may move now — but the reason behind it
 * has not gone away: this sits under a character running its own 30fps
 * clock, on a phone. So everything here shares **one** shared value, derives
 * from it on the UI thread, and does no per-frame work in JS.
 *
 * It lives outside `koa-studio.tsx` for a hard technical reason, not a
 * stylistic one: Reanimated pulls in `react-native`, whose Flow syntax
 * esbuild will not parse, and `preview.mjs` / `stage.mjs` bundle the scene
 * with esbuild. One import of this file inside the studio takes the room's
 * whole verification story down with it. `KoaStudio` takes these as nodes
 * instead, and draws its static originals when they are not passed.
 */

const AnimatedG = Animated.createAnimatedComponent(
  G as unknown as React.ComponentType<GProps & { opacity?: number }>,
);
const AnimatedEllipse = Animated.createAnimatedComponent(
  Ellipse as unknown as React.ComponentType<EllipseProps & { opacity?: number }>,
);

/**
 * One slow cycle for the whole room, in ms.
 *
 * Long and prime-ish against the motes' 26s so the two never fall into step
 * and start reading as one pulse.
 */
const PERIOD = 7300;

/** how far the beam's brightness swings either side of nominal */
const BEAM_SWING = 0.075;
/** the stage glow breathes wider than the beam — it is the softer of the two */
const GLOW_SWING = 0.22;

function useLightClock(): SharedValue<number> {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = 0;
    t.value = withRepeat(withTiming(1, { duration: PERIOD, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(t);
  }, [t]);
  return t;
}

/**
 * The lamp, with the beam breathing under it.
 *
 * Two sine terms a cycle apart — `sin(a)` and a third of `sin(3a)` — so the
 * swell is not a metronome. Both are whole numbers of cycles in `t`, so the
 * loop closes on itself with no jump at the seam.
 *
 * Only `Cones` moves. The shade is a solid object: modulating its opacity
 * would let the wall show through it, which is why `Lamp` is drawn outside
 * the animated group rather than inside it.
 */
export function LiveLight() {
  const t = useLightClock();
  const props = useAnimatedProps<{ opacity: number }>(() => {
    const a = 2 * Math.PI * t.value;
    return { opacity: 1 + BEAM_SWING * (Math.sin(a) + Math.sin(3 * a) / 3) };
  });
  return (
    <>
      <ConeDefs />
      <AnimatedG animatedProps={props}>
        <Cones />
      </AnimatedG>
      <Lamp />
    </>
  );
}

/**
 * The glow the stage gives back.
 *
 * The glow itself belongs to the scene and lives in `platform.tsx`, so a
 * still of the room has it. This only makes it breathe — on the same clock
 * as the beam but slightly behind it, because light reaches the floor after
 * it leaves the lamp, and a stage that swells in perfect lockstep with its
 * own lamp reads as one flat flicker rather than as a room.
 */
export function LiveStageGlow({ glow = C.highlight, energy = 0.5 }: { glow?: string; energy?: number }) {
  const t = useLightClock();
  const base = stageGlowOpacity(energy);
  const props = useAnimatedProps<{ opacity: number }>(() => {
    const a = 2 * Math.PI * (t.value - 0.08);
    return { opacity: base * (1 + GLOW_SWING * Math.sin(a)) };
  });
  return <AnimatedEllipse {...STAGE_GLOW} fill={glow} animatedProps={props} />;
}
