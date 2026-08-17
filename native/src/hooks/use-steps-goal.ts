import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useSyncExternalStore } from 'react';

import { onUserScopedReset } from '@/lib/user-scoped-reset';

/**
 * Daily steps goal — port of the web useStepsGoal (localStorage →
 * AsyncStorage, same key semantics and 1k–50k clamp). Module-level
 * store so Today, the Steps screen and Settings stay in sync.
 */

const STORAGE_KEY = 'ascnd-steps-goal';
const DEFAULT_GOAL = 10000;

let goalState = DEFAULT_GOAL;
const listeners = new Set<() => void>();
let hydrated = false;

function emit() {
  listeners.forEach((l) => l());
}

/**
 * `hydrated` means "the read has been *started*", which is not the same as
 * "the stored value is in hand" — so a second flag records the landing.
 *
 * The daily steps quest is judged against this goal and, once claimed, cannot
 * be un-claimed. Judging it during the window before the read lands means
 * judging somebody who set 15,000 against the default 10,000 and paying them
 * for a day they have not had. `settled` is what lets the quest wait.
 */
let settled = false;

async function hydrate() {
  if (hydrated) return;
  hydrated = true;
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored != null && Number(stored) > 0) {
      goalState = Number(stored);
    }
  } catch {
    // keep default
  } finally {
    settled = true;
    emit();
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/*
  ── the goal is one person's, and it stays in memory after they leave ──

  `clearUserScopedStorage()` deletes `ascnd-steps-goal`, but the number the app
  reads is `goalState`, and `hydrated` means it is never read from disk again.
  So the next account was judged against the previous account's target — and
  the daily steps quest pays coins on that comparison, once, permanently.

  Back to the state a fresh launch has, latch included: `settled` goes with it
  or the quest would be judged during the window that flag exists to cover.
*/
onUserScopedReset(() => {
  goalState = DEFAULT_GOAL;
  hydrated = false;
  settled = false;
  emit();
});

export function setStepsGoal(value: number) {
  const clamped = Math.max(1000, Math.min(50000, Math.round(value)));
  goalState = clamped;
  emit();
  AsyncStorage.setItem(STORAGE_KEY, String(clamped)).catch(() => {});
}

export function useStepsGoal() {
  const goal = useSyncExternalStore(subscribe, () => goalState);
  const ready = useSyncExternalStore(subscribe, () => settled);
  useEffect(() => {
    hydrate();
  }, []);
  return { goal, setGoal: setStepsGoal, ready };
}
