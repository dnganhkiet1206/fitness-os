/**
 * Where the focused screen parks its "scroll back to top".
 *
 * Tapping the tab you are already on should take you to the top of it — the
 * platform convention, and the only way back up a long page without a long
 * flick. The tab bar knows the tap happened but owns no scroll view; the
 * screen owns the scroll view but never hears the tap. This is the one slot
 * between them.
 *
 * **One slot, not a map keyed by route.** Exactly one screen is focused at a
 * time, so a registry would only ever hold one live entry and would need
 * cleaning up on every unmount to avoid scrolling a screen nobody is looking
 * at. `Screen` claims the slot when it gains focus and releases it when it
 * loses it, which is the same lifetime with none of the bookkeeping.
 *
 * Deliberately not React state: it changes on navigation, it is read inside an
 * event handler, and nothing renders differently because of it.
 */

type Scroller = { top: () => void; to: (y: number) => void };
let current: Scroller | null = null;

/** Claim the slot on focus; pass `null` on blur to release it. */
export function setActiveScroller(s: Scroller | null) {
  current = s;
}

/**
 * Scroll the focused screen to the top, if it has said how.
 *
 * Returns whether anything happened, so a caller can fall back — a screen that
 * never registered (no scroll view, or a modal on top) simply does nothing.
 */
export function scrollActiveToTop(): boolean {
  if (!current) return false;
  current.top();
  return true;
}

/**
 * Put the focused screen at offset `y`, with no animation — for a screen that
 * has to hold the reader's place while content is inserted ABOVE them (the
 * Community feed loading back a page it had dropped, #171). Same slot, same
 * lifetime: the screen that can hear the insert never owns the scroll view.
 */
export function scrollActiveTo(y: number): boolean {
  if (!current) return false;
  current.to(y);
  return true;
}
