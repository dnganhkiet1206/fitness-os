import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useSyncExternalStore } from 'react';

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

async function hydrate() {
  if (hydrated) return;
  hydrated = true;
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored != null && Number(stored) > 0) {
      goalState = Number(stored);
      emit();
    }
  } catch {
    // keep default
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function setStepsGoal(value: number) {
  const clamped = Math.max(1000, Math.min(50000, Math.round(value)));
  goalState = clamped;
  emit();
  AsyncStorage.setItem(STORAGE_KEY, String(clamped)).catch(() => {});
}

export function useStepsGoal() {
  const goal = useSyncExternalStore(subscribe, () => goalState);
  useEffect(() => {
    hydrate();
  }, []);
  return { goal, setGoal: setStepsGoal };
}
