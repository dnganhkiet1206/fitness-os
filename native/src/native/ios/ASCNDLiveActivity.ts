// #195 spike — display-only rest timer Live Activity facade.
//
// React Native owns ALL workout/rest business state (exercise, sets, timer).
// This file only forwards display state to Swift; it never computes anything.
//
// Display-only by design (Kiệt's call on #195): start / update / end.
// No "Skip" button, no interactive controls in this spike.
//
// Countdown strategy: TypeScript passes an ABSOLUTE end timestamp. Swift
// stores it in ContentState.endDate and the Live Activity UI derives the
// remaining time natively via Text(timerInterval:) — no per-second bridge
// traffic while the timer runs.
import AscndNativeModule from 'ascnd-native';
import { isAscndNativeAvailable } from './ASCNDNative';

export interface RestActivityState {
  /** Current exercise, e.g. "Bench Press". */
  exerciseName: string;
  /** 1-based set number just completed (the rest precedes the next set). */
  setNumber: number;
  /** Total sets in the exercise, for "Set x of y". */
  totalSets: number;
  /** Planned rest duration in seconds. */
  totalSeconds: number;
}

/** False on web, on Android, or where Live Activities are unsupported/disabled. */
export function areLiveActivitiesEnabled(): boolean {
  const mod = AscndNativeModule;
  if (!isAscndNativeAvailable() || !mod) return false;
  try {
    return mod.areLiveActivitiesEnabled();
  } catch {
    return false;
  }
}

/**
 * Starts the display-only rest Live Activity.
 * @returns the native activity id, or null when unavailable/failed.
 */
export async function startRestActivity(state: RestActivityState): Promise<string | null> {
  const mod = AscndNativeModule;
  if (!isAscndNativeAvailable() || !mod) return null;
  const endTimestamp = Date.now() + state.totalSeconds * 1000;
  try {
    return await mod.startRestActivity(
      state.exerciseName,
      state.setNumber,
      state.totalSets,
      state.totalSeconds,
      endTimestamp,
    );
  } catch {
    return null;
  }
}

/** Pushes fresh display state (e.g. user extended the rest). Null-safe. */
export async function updateRestActivity(
  activityId: string,
  state: RestActivityState,
): Promise<boolean> {
  const mod = AscndNativeModule;
  if (!isAscndNativeAvailable() || !mod) return false;
  const endTimestamp = Date.now() + state.totalSeconds * 1000;
  try {
    await mod.updateRestActivity(
      activityId,
      state.exerciseName,
      state.setNumber,
      state.totalSets,
      state.totalSeconds,
      endTimestamp,
    );
    return true;
  } catch {
    return false;
  }
}

/** Ends and dismisses the activity. Never throws. */
export async function endRestActivity(activityId: string): Promise<void> {
  const mod = AscndNativeModule;
  if (!isAscndNativeAvailable() || !mod) return;
  try {
    await mod.endRestActivity(activityId);
  } catch {
    // Display-only surface: nothing to recover.
  }
}
