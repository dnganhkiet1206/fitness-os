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

export type RestActivityStateKind = 'resting' | 'active' | 'ready';

export interface RestActivityState {
  /** What the Island is showing — resting (between sets), active (mid-set), ready (waiting). */
  activityState: RestActivityStateKind;
  /** Current exercise, e.g. "Bench Press". */
  exerciseName: string;
  /** 1-based set number just completed (the rest precedes the next set). */
  setNumber: number;
  /** Total sets in the exercise, for "Set x of y". */
  totalSets: number;
  /** Planned rest duration in seconds (display reference). */
  totalSeconds: number;
  /**
   * Seconds remaining from now — drives the absolute end timestamp sent to
   * Swift. Defaults to totalSeconds (a fresh rest). Pass the current
   * remaining count when pushing an adjustment so the native countdown
   * stays exact instead of restarting from the full duration.
   */
  remainingSeconds?: number;
  /**
   * Absolute start timestamp (ms) of this rest. Swift pairs it with the end
   * timestamp for `Text(timerInterval:)` — the range must be two STORED
   * dates, never `Date.now...endDate`. Defaults to now (a fresh rest).
   */
  startTimestamp?: number;
  /** Localized "Rest" — the Island follows the app language. */
  restingText?: string;
  /** Localized "Set {n}/{t}", pre-formatted. */
  setText?: string;
  /** Localized "Up next" — the Island shows the NEXT set. */
  nextText?: string;
  /** App language code ('vi' | 'en') — Swift looks up localized strings. */
  languageCode?: string;
}

/** Absolute end timestamp (ms) for the native ContentState.endDate. */
function endTimestampFor(state: RestActivityState): number {
  const remaining = state.remainingSeconds ?? state.totalSeconds;
  return Date.now() + Math.max(0, remaining) * 1000;
}

/*
  #209 follow-up: the facade is null-safe by contract (prod never depends on
  the Island), but silent swallows made a real incident undebuggable — a
  JS/native signature skew failed with zero surface. In __DEV__ only, log
  the underlying error so the next skew shows up in the Metro terminal.
*/
function warnDev(fn: string, err: unknown): void {
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.warn(`[AscndNative] ${fn} failed:`, err);
  }
}

/** False on web, on Android, or where Live Activities are unsupported/disabled. */
export function areLiveActivitiesEnabled(): boolean {
  const mod = AscndNativeModule;
  if (!isAscndNativeAvailable() || !mod) return false;
  try {
    return mod.areLiveActivitiesEnabled();
  } catch (err) {
    warnDev('areLiveActivitiesEnabled', err);
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
  const startTimestamp = state.startTimestamp ?? Date.now();
  const endTimestamp = endTimestampFor(state);
  // Bridge is 8 params: Swift looks up localized strings from languageCode.
  const languageCode = state.languageCode ?? 'en';
  try {
    return await mod.startRestActivity(
      state.activityState,
      state.exerciseName,
      state.setNumber,
      state.totalSets,
      state.totalSeconds,
      startTimestamp,
      endTimestamp,
      languageCode,
    );
  } catch (err) {
    warnDev('startRestActivity', err);
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
  const startTimestamp = state.startTimestamp ?? Date.now();
  const endTimestamp = endTimestampFor(state);
  // Bridge is 8 params: Swift looks up localized strings from languageCode.
  const languageCode = state.languageCode ?? 'en';
  try {
    await mod.updateRestActivity(
      activityId,
      state.activityState,
      state.exerciseName,
      state.setNumber,
      state.totalSets,
      state.totalSeconds,
      startTimestamp,
      endTimestamp,
      languageCode,
    );
    return true;
  } catch (err) {
    warnDev('updateRestActivity', err);
    return false;
  }
}

/** Ends and dismisses the activity. Never throws. */
export async function endRestActivity(activityId: string): Promise<void> {
  const mod = AscndNativeModule;
  if (!isAscndNativeAvailable() || !mod) return;
  try {
    await mod.endRestActivity(activityId);
  } catch (err) {
    // Display-only surface: nothing to recover.
    warnDev('endRestActivity', err);
  }
}
