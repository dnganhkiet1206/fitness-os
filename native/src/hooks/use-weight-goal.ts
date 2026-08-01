import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useSyncExternalStore } from 'react';

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

let goalState: number | null = null;
const listeners = new Set<() => void>();
let hydrated = false;

function emit() {
  listeners.forEach((l) => l());
}

async function hydrate() {
  if (hydrated) return;
  hydrated = true;
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    const n = stored == null ? NaN : Number(stored);
    if (Number.isFinite(n) && n >= MIN_KG && n <= MAX_KG) {
      goalState = n;
      emit();
    }
  } catch {
    // keep unset
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** `null` clears the goal; anything else is clamped and rounded to 0.1 kg */
export function setWeightGoalKg(value: number | null) {
  if (value == null) {
    goalState = null;
    emit();
    AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
    return;
  }
  const clamped = Math.round(Math.max(MIN_KG, Math.min(MAX_KG, value)) * 10) / 10;
  goalState = clamped;
  emit();
  AsyncStorage.setItem(STORAGE_KEY, String(clamped)).catch(() => {});
}

export function useWeightGoal() {
  const goalKg = useSyncExternalStore(subscribe, () => goalState);
  useEffect(() => {
    hydrate();
  }, []);
  return { goalKg, setGoalKg: setWeightGoalKg };
}
