import Animated, { useAnimatedProps, type SharedValue } from 'react-native-reanimated';
import { Ellipse, type EllipseProps } from 'react-native-svg';

import { useLoopClock } from '@/components/ascnd/studio/loop-clock';
import { C } from '@/components/ascnd/studio/palette';
import { STAGE_GLOW, stageGlowOpacity } from '@/components/ascnd/studio/platform';
import { CX, MOUTH_R, MOUTH_Y } from '@/components/ascnd/studio/spotlight';

/**
 * The room's light, alive.
 *
 * The studio used to be a static scene on principle. That rule was lifted by
 * the user on 2026-07-28 — the room may move now — but the reason behind it
 * has not gone away: this sits under a character running its own clock at the
 * display's rate, on a phone. So everything here shares **one** shared value,
 * derives from it on the UI thread, and does no per-frame work in JS.
 *
 * It lives outside `koa-studio.tsx` for a hard technical reason, not a
 * stylistic one: Reanimated pulls in `react-native`, whose Flow syntax
 * esbuild will not parse, and `preview.mjs` / `stage.mjs` bundle the scene
 * with esbuild. One import of this file inside the studio takes the room's
 * whole verification story down with it. `KoaStudio` takes these as nodes
 * instead, and draws its static originals when they are not passed.
 */

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

/** how far the mouth's glow swings either side of its resting strength */
const PULSE_SWING = 0.16;
/** the stage glow breathes wider than the beam — it is the softer of the two */
const GLOW_SWING = 0.22;

/**
 * The one clock the light and the stage glow share.
 *
 * They used to take one each, which is two invalidation sources at 60fps for
 * one visual idea. `studio-live.tsx` owns it now and hands it to both.
 *
 * `paused` holds it in place while the page scrolls — see `useLoopClock`.
 */
export function useLightClock(paused = false): SharedValue<number> {
  return useLoopClock(PERIOD, paused);
}

/**
 * The lamp's mouth, breathing.
 *
 * **This is deliberately one small ellipse and not the beam.** The first
 * version animated the nine-trapezoid cone stack, and even on its own canvas
 * that meant re-rasterising nine full-height gradient-filled shapes sixty
 * times a second — the phone ran hot within minutes. Shape *count* is not
 * what costs; covered area is. So the cone stack stays still, in the studio's
 * static canvas, and what moves is a glow at the mouth: the eye reads the
 * lamp as alive, and the fill rate is a few hundred pixels rather than most
 * of the screen.
 *
 * **Do not animate the cones, the vignette, the wall or the floor.** Anything
 * that covers a large area must stay still.
 *
 * Two sine terms a cycle apart so the swell is not a metronome, and both are
 * whole numbers of cycles in `t` so the loop closes without a seam.
 */
export function LampPulse({ glow = C.highlight, t }: { glow?: string; t: SharedValue<number> }) {
  const props = useAnimatedProps<{ opacity: number }>(() => {
    const a = 2 * Math.PI * t.value;
    return { opacity: 0.3 + PULSE_SWING * (Math.sin(a) + Math.sin(3 * a) / 3) };
  });
  return (
    <AnimatedEllipse
      cx={CX}
      cy={MOUTH_Y + 1}
      rx={MOUTH_R + 6}
      ry={7}
      fill={glow}
      animatedProps={props}
    />
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
export function LiveStageGlow({
  t,
  glow = C.highlight,
  energy = 0.5,
}: {
  t: SharedValue<number>;
  glow?: string;
  energy?: number;
}) {
  const base = stageGlowOpacity(energy);
  const props = useAnimatedProps<{ opacity: number }>(() => {
    const a = 2 * Math.PI * (t.value - 0.08);
    return { opacity: base * (1 + GLOW_SWING * Math.sin(a)) };
  });
  return <AnimatedEllipse {...STAGE_GLOW} fill={glow} animatedProps={props} />;
}
