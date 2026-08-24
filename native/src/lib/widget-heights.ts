/**
 * How tall each Today widget turned out to be, last time it drew.
 *
 * ── the problem this exists to solve without guessing ──
 *
 * While the day's log is loading, Today renders nothing below the greeting.
 * That is deliberate: `screen.tsx` records at length that swapping a ~100pt
 * placeholder for a 208pt ring gauge is what used to make the page move under
 * your thumb, and hiding the widgets until `useDailyLog` settles was the fix.
 *
 * The cost is a blank screen on every cold launch. The apps worth copying —
 * Apple Health, Oura, Whoop — show the page's *shape* instead: a block where
 * each card will be, at the height that card will have.
 *
 * Which needs the heights. Writing them down as constants means fifteen numbers
 * that are right the day they are typed and wrong the first time a card gains a
 * row — and wrong here means the exact page-jump the hiding was introduced to
 * prevent. So nothing is written down. Each widget reports its own height as it
 * lays out, that is remembered, and the next launch draws a block of exactly
 * that size.
 *
 * First launch on a new install has nothing to go on and uses `FALLBACK`. That
 * is the only time an approximation is on screen, it is one launch, and the
 * page is at the top while it happens.
 *
 * ── why the write is throttled by a whole pixel ──
 *
 * Layout fires on every re-render, and a card whose number changed from 9 to 10
 * can report 96.33 instead of 96. Persisting that would mean an AsyncStorage
 * write on most renders of most cards, forever, to store noise.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import { onUserScopedReset } from '@/lib/user-scoped-reset';

const STORAGE_KEY = 'ascnd-widget-heights';

/**
 * The hero slot's height key.
 *
 * The hero cards are one swipeable deck, so the skeleton has one block to draw
 * there, not one per card. Keyed separately from any widget because it is not
 * one — it is however tall the tallest page turned out to be.
 */
export const HERO_DECK = 'hero-deck';

/** A plain card with a title and a couple of rows. Used once, on a fresh install. */
export const FALLBACK_HEIGHT = 104;

const heights: Record<string, number> = {};
let hydrated = false;
let dirty = false;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

/*
  ── the read has to survive arriving late ──

  Reading storage is async and the skeleton renders on the first frame, so the
  cache lands *after* the blocks are already on screen. Without a subscription
  they would sit at the fallback height for the whole load and then be replaced
  by widgets of a different size — the page-jump, reintroduced by the thing
  built to prevent it.

  Same module-store shape `use-steps-goal.ts` uses: one version counter, and
  `useSyncExternalStore` to pull the components along when it moves.
*/
const listeners = new Set<() => void>();
let version = 0;
const emit = () => {
  version++;
  listeners.forEach((l) => l());
};
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

export async function hydrateWidgetHeights(): Promise<void> {
  if (hydrated) return;
  hydrated = true;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      /* Anything unexpected in storage is dropped rather than trusted: a
         corrupt height is a mis-sized block, and the fallback is better than a
         number of unknown origin. */
      if (parsed && typeof parsed === 'object') {
        let any = false;
        for (const [k, v] of Object.entries(parsed)) {
          if (typeof v === 'number' && Number.isFinite(v) && v > 20 && v < 2000) {
            heights[k] = v;
            any = true;
          }
        }
        if (any) emit();
      }
    }
  } catch {
    // an unreadable cache is not an error worth surfacing; the fallback covers it
  }
}

/*
  The cache is measured from *this* account's cards — a different set of
  widgets, in a different order, at different heights. `ascnd-widget-heights`
  is deleted on sign-out; the object it was read into was not, and `hydrated`
  meant the next account never read its own. See `lib/user-scoped-reset.ts`.
*/
onUserScopedReset(() => {
  for (const k of Object.keys(heights)) delete heights[k];
  hydrated = false;
  dirty = false;
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  emit();
});

/**
 * Subscribes the caller to the height cache.
 *
 * The returned number is only a version stamp — the heights themselves are read
 * with `heightFor`. It exists so that a component drawing skeleton blocks
 * re-renders when the cache arrives from storage.
 */
export function useWidgetHeightsVersion(): number {
  return useSyncExternalStore(subscribe, () => version);
}

/** The last measured height for a widget, or the fallback on a fresh install. */
export function heightFor(key: string): number {
  return heights[key] ?? FALLBACK_HEIGHT;
}

/**
 * Record a widget's measured height.
 *
 * Rounded to a pixel and ignored when it has not moved, so the common case —
 * a card re-rendering with the same layout — costs nothing.
 */
export function recordHeight(key: string, h: number): void {
  if (!Number.isFinite(h) || h <= 20) return;
  const rounded = Math.round(h);
  if (heights[key] === rounded) return;
  heights[key] = rounded;
  dirty = true;
  /* No `emit()` here on purpose. The only subscriber is the skeleton, and the
     skeleton is never on screen at the same time as the widgets doing the
     measuring — emitting would be a re-render nobody is waiting for, fired from
     inside a layout pass. The value is in memory for the next mount either
     way. */
  if (flushTimer) return;
  /* One write per burst of layout rather than one per card: a first paint
     measures every widget on the page within the same frame or two. */
  flushTimer = setTimeout(() => {
    flushTimer = null;
    if (!dirty) return;
    dirty = false;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(heights)).catch(() => {});
  }, 1000);
}
