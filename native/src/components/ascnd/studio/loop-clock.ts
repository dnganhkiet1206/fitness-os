import { useFrameCallback, useSharedValue, type SharedValue } from 'react-native-reanimated';

import { reduceMotionSV } from '@/hooks/use-reduced-motion';

/**
 * A 0→1 loop clock that can pause **in place**.
 *
 * The room's live layers used to loop on `withRepeat(withTiming(1, linear))`,
 * which runs at the display's rate and is exactly what a loop wants — except
 * it cannot be stopped without losing its phase. Cancel it and the value
 * freezes wherever it was; start it again and it snaps back to 0. So during a
 * scroll those layers had to keep redrawing, and a handful of small canvases
 * repainting every frame on the UI thread the scroll runs on was the last of
 * the stutter.
 *
 * This is the same linear loop — visually identical — built on an accumulator
 * instead. `paused` holds `t` exactly where it is, and because the accumulator
 * only ever adds the *last frame's* elapsed time, releasing it picks up with
 * no jump. That is what lets the whole room stop dead the instant a scroll
 * begins and carry on untouched when it ends.
 *
 * `pause` is a shared value read on the UI thread, not a React prop: the page
 * writes it straight from the scroll callbacks, so the room freezes on the
 * frame the drag begins with no React render in between — which is what took
 * the last of the stutter out. Holding it keeps `last` current, so releasing
 * it resumes with no jump.
 *
 * Two more guards keep the accumulator honest, both borrowed from
 * `figure-clock`: a fresh activation (or a backwards `timeSinceFirstFrame`)
 * resets the baseline instead of integrating a garbage delta, and a frame that
 * lands more than 200ms after the last — an app returning from the background —
 * is dropped rather than added, so the loop never lurches forward by the time
 * spent away.
 *
 * The clock exists only while its component is mounted; `StudioLive` unmounts
 * once the stage scrolls off screen, so there is no focus gate here.
 */
export function useLoopClock(period: number, pause?: SharedValue<boolean>): SharedValue<number> {
  const t = useSharedValue(0);
  const last = useSharedValue(-1);

  useFrameCallback((frame) => {
    'worklet';
    const now = frame.timeSinceFirstFrame;
    if (last.value < 0 || now < last.value) {
      last.value = now;
      return;
    }
    const dt = now - last.value;
    last.value = now;
    // Reduced motion, a scroll hold, or a gap too large to be a real frame
    // (background resume). `useFrameCallback` gets no reduce-motion handling
    // from Reanimated — unlike `withTiming` and friends — so it is checked here.
    if (reduceMotionSV.value || (pause && pause.value) || dt > 200) return;
    t.value = (t.value + dt / period) % 1;
  });

  return t;
}
