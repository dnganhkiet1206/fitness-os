import { useEffect, useMemo, useSyncExternalStore } from 'react';

import { createAsyncStore } from '@/lib/async-store';
import { onUserScopedReset } from '@/lib/user-scoped-reset';

/**
 * Daily steps goal — port of the web useStepsGoal (localStorage →
 * AsyncStorage, same key semantics and 1k–50k clamp). Module-level
 * store so Today, the Steps screen and Settings stay in sync.
 */

const STORAGE_KEY = 'ascnd-steps-goal';
const DEFAULT_GOAL = 10000;

const store = createAsyncStore<number>({
  storageKey: STORAGE_KEY,
  initial: DEFAULT_GOAL,
  parse: (stored) => {
    const n = Number(stored);
    return n > 0 ? n : undefined;
  },
});

/*
  ── the goal is one person's, and it stays in memory after they leave ──

  `clearUserScopedStorage()` deletes `ascnd-steps-goal`, but the number the app
  reads lives in the store, and `hydrated` means it is never read from disk
  again. So the next account was judged against the previous account's
  target — and the daily steps quest pays coins on that comparison, once,
  permanently.

  Back to the state a fresh launch has, latch included: `settled` goes with it
  or the quest would be judged during the window that flag exists to cover.
*/
onUserScopedReset(() => store.reset());

export function setStepsGoal(value: number) {
  store.set(Math.max(1000, Math.min(50000, Math.round(value))));
}

export function useStepsGoal() {
  const goal = useSyncExternalStore(store.subscribe, store.get);
  const ready = useSyncExternalStore(store.subscribe, store.settled);
  useEffect(() => {
    store.hydrate();
  }, []);
  /* Stable identity: `setStepsGoal` is module-level, `goal`/`ready` are
     primitives — the object only needs to change when they do. */
  return useMemo(() => ({ goal, setGoal: setStepsGoal, ready }), [goal, ready]);
}
