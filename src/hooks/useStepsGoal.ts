import { useState, useCallback } from 'react';

const STORAGE_KEY = 'steps_daily_goal';
const DEFAULT_GOAL = 10000;

export function useStepsGoal() {
  const [goal, setGoalState] = useState<number>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? Number(stored) : DEFAULT_GOAL;
  });

  const setGoal = useCallback((value: number) => {
    const clamped = Math.max(1000, Math.min(50000, value));
    setGoalState(clamped);
    localStorage.setItem(STORAGE_KEY, String(clamped));
  }, []);

  return { goal, setGoal };
}

export function getStepsGoal(): number {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored ? Number(stored) : DEFAULT_GOAL;
}
