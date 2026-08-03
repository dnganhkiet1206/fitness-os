import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { makeMutable, type SharedValue } from 'react-native-reanimated';

/**
 * Whether the person has asked the system to reduce motion.
 *
 * ── what Reanimated already does, and what it does not ──
 *
 * `withTiming`, `withSpring`, `withRepeat`, `withDelay` and `withSequence` all
 * default to `ReduceMotion.System`, so every one of those in this app already
 * respects the setting without being told to. The audit claimed the app had no
 * reduced-motion support at all; that was wrong, and it was wrong because it
 * was measured by grepping for the word rather than by reading what the library
 * promises.
 *
 * What is *not* covered is `useFrameCallback`. It is a raw per-frame callback
 * on the UI thread, and nothing about it consults an accessibility setting —
 * which is exactly where this app puts its most persistent motion. Koa breathes,
 * blinks and sways from a frame clock the whole time the Today tab is on screen,
 * and the studio scene loops from another. Those are the two that kept moving.
 *
 * ── a shared value, not a prop ──
 *
 * Both clocks are worklets. Reading React state from a worklet means threading
 * a prop down through the scene graph and re-rendering the figure when it
 * changes, which is a lot of machinery for a flag that changes about twice in a
 * device's lifetime. A module-level mutable is read directly on the UI thread
 * by whoever needs it.
 *
 * ── freeze, do not remove ──
 *
 * Koa stays on screen and stops moving. Both clocks already know how to hold a
 * frame — it is what they do while the page is being scrolled — so reduced
 * motion reuses that path rather than inventing a second kind of stillness. The
 * mascot is the product's personality; taking him away to satisfy an
 * accessibility setting would trade one exclusion for another.
 */
export const reduceMotionSV: SharedValue<boolean> = makeMutable(false);

/**
 * Keep `reduceMotionSV` current. Mount once, at the root.
 *
 * The initial read is asynchronous, so there is a moment at launch where the
 * value is `false` and the clocks run. That is one frame of motion for someone
 * who asked for none, and it is the price of the platform API being a promise;
 * the alternative is holding the whole app back until it resolves.
 */
export function useReducedMotionSync() {
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((on) => {
      if (alive) reduceMotionSV.value = on;
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (on) => {
      reduceMotionSV.value = on;
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
}

/** The same flag for code that renders rather than animates. */
export function useReducedMotion(): boolean {
  const [on, setOn] = useState(reduceMotionSV.value);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setOn);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setOn);
    return () => sub.remove();
  }, []);
  return on;
}
