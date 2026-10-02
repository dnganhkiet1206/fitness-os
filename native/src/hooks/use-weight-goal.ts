import { useEffect, useMemo, useSyncExternalStore } from 'react';

import { createAsyncStore } from '@/lib/async-store';
import { onUserScopedReset } from '@/lib/user-scoped-reset';

/**
 * Target weight, stored on the device.
 *
 * ── why it is not on the profile ──
 *
 * There is no column for it. `profiles` carries `weight_kg` (what you weigh)
 * and `goal` (`bulk` / `cut` / `maintain`), and nothing that says what number
 * you are heading for. Adding one is a migration against the live database,
 * which is not something to do on the way to drawing a line on a chart — so
 * this follows `use-steps-goal`, which had exactly the same problem and solved
 * it the same way.
 *
 * The cost is real and worth knowing: **it does not sync.** Set a goal on one
 * phone and a second phone will not have it, and reinstalling loses it. When a
 * target weight is worth a migration this hook is the one place to change.
 *
 * ── always kilograms ──
 *
 * Stored canonical, like every other weight in the app (`weight_logs.weight_kg`,
 * `profiles.weight_kg`), and converted for display at the edge. Storing it in
 * whatever unit happened to be selected would mean a goal that changes value
 * when you switch units.
 *
 * ── null is a real state ──
 *
 * Unlike a steps goal there is no sensible default: 10 000 steps is a
 * reasonable guess for anyone, and no weight is. `null` means "not set", and
 * the chart draws no line rather than a line somebody did not ask for.
 */

const STORAGE_KEY = 'ascnd-weight-goal-kg';

/** the range a human target weight can fall in, in kg */
const MIN_KG = 30;
const MAX_KG = 300;

const store = createAsyncStore<number | null>({
  storageKey: STORAGE_KEY,
  initial: null,
  parse: (stored) => {
    const n = Number(stored);
    return Number.isFinite(n) && n >= MIN_KG && n <= MAX_KG ? n : undefined;
  },
  // `null` clears the goal: the key is removed rather than storing a string
  // that the next read would have to reject.
  serialize: (value) => (value == null ? null : String(value)),
});

/* A target weight is about as personal as this app gets, and deleting the key
   on sign-out left the number itself in the store with `hydrated` set — so
   the line drawn across the next account's chart was the previous person's
   goal. See `lib/user-scoped-reset.ts`. */
onUserScopedReset(() => store.reset());

/**
 * `null` clears the goal; anything else is clamped and rounded to 0.01 kg.
 *
 * Two decimal places, not one, because the picker steps in tenths of the
 * *display* unit — and a tenth of a pound is 0.045 kg. Rounded to 0.1 kg, two
 * adjacent ticks on a pound ruler would store the same number and the picker
 * would jump to a different value than the one it was left on.
 */
export function setWeightGoalKg(value: number | null) {
  if (value == null) {
    store.set(null);
    return;
  }
  store.set(Math.round(Math.max(MIN_KG, Math.min(MAX_KG, value)) * 100) / 100);
}

export function useWeightGoal() {
  const goalKg = useSyncExternalStore(store.subscribe, store.get);
  useEffect(() => {
    store.hydrate();
  }, []);
  /* Stable identity — see use-steps-goal. */
  return useMemo(() => ({ goalKg, setGoalKg: setWeightGoalKg }), [goalKg]);
}
