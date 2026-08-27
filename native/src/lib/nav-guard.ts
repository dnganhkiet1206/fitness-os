/**
 * The rule that decides whether a navigation happens.
 *
 * Kept apart from `nav.ts` — and importing nothing at all — so a check can
 * compile it on its own and drive it with real bursts on a fake clock. A rule
 * about timing that is only ever reasoned about is a rule nobody has tested.
 */

/**
 * How long one destination is held.
 *
 * Long enough to swallow a burst of queued presses: those arrive within a few
 * milliseconds of each other once the thread frees, however long the stall
 * lasted. Far shorter than any real round trip to a screen and back, so a
 * genuine second visit is never blocked.
 */
export const GUARD_MS = 700;

/** key -> when it was last accepted */
const seen = new Map<string, number>();

/**
 * Whether this navigation runs, and the record of it if it does.
 *
 * Keyed per destination rather than by a single "last one", so mashing one
 * button is blocked while pressing two different buttons in quick succession
 * is not. Both matter: the first is the bug, and the second is somebody
 * changing their mind, which must still work.
 *
 * Calling this CLAIMS the window, so it must be called exactly once per
 * navigation and only when that navigation is really about to happen.
 */
export function allow(key: string, now: number = Date.now()): boolean {
  const at = seen.get(key);
  if (at !== undefined && now - at < GUARD_MS) return false;
  /*
    Swept on the way past rather than on a timer. The map holds one entry per
    destination pressed in the last 700ms, which is at most a handful — but
    "at most a handful" is an assumption about human hands, and a map that is
    only ever added to is a leak whatever the rate.
  */
  for (const [k, t] of seen) if (now - t >= GUARD_MS) seen.delete(k);
  seen.set(key, now);
  return true;
}
