/**
 * The figure's clock, kept honest across pause and resume.
 *
 * A `useFrameCallback` reports `timeSinceFirstFrame`, and Reanimated resets
 * that to 0 every time the callback is re-activated — `setActive(false)`
 * clears the registry's `startTime`. So the value is NOT a monotonic clock:
 * it restarts at zero each time a screen regains focus.
 *
 * Reading it as one is what froze the character. The 30fps throttle compared
 * the fresh `timeSinceFirstFrame` against the previous run's accumulated
 * total, so after the first blur → focus cycle the difference was hugely
 * negative, never reached a frame's worth, and the clock stopped for good.
 *
 * This accumulates elapsed time instead of copying the reported value, which
 * makes it immune to the restart and has the character resume where it
 * paused rather than snapping back to the start of every loop.
 *
 * Kept in its own module, over plain `{ value }` holders, so a plain Node
 * test can drive it — the browser diff that checks the drawing cannot see a
 * clock that has stopped.
 */

export interface Cell {
  value: number;
}

/** `last` at this value means "the next frame starts a fresh run" */
export const CLOCK_RESET = -1;

/**
 * Slack on the frame budget, in ms.
 *
 * A 30fps budget is 33.33ms and two frames of a 60Hz display are also
 * 33.33ms, so an exact comparison lands on the boundary and floating point
 * decides it — sometimes two display frames qualify, sometimes it takes
 * three. That is 22fps with visible jitter rather than a steady 30. A
 * millimetre of slack makes the common case land every time, on 60Hz and
 * 120Hz alike.
 */
const SLACK_MS = 1;

export function stepClock(clock: Cell, last: Cell, t: number, frameMs: number): void {
  'worklet';
  // a fresh activation, or the reported time restarted behind us
  if (last.value < 0 || t < last.value) {
    last.value = t;
    return;
  }
  const dt = t - last.value;
  if (dt < frameMs - SLACK_MS) return;
  last.value = t;
  clock.value += dt;
}
