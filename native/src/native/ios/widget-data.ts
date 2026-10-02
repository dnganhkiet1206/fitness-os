/**
 * Widget data push — production wiring for the two iOS widgets.
 *
 * Architecture (see native/docs/native-spike-195.md):
 *   TypeScript -> AscndNative.updateWidgetData(key, json)
 *     -> App Group shared UserDefaults ("group.com.ascnd.fitnessos")
 *     -> WidgetDataStore.read*() (Swift) -> widgets
 *
 * Until the App Group is provisioned in the Apple Developer portal, the Swift
 * side silently no-ops and widgets fall back to MockWidgetDataProvider
 * (SPIKE-ONLY). This module is safe to call regardless — it fire-and-forgets.
 *
 * Data sources (to be wired by caller):
 * - Today's Workout: use-fitness-data.ts (today's template/sessions)
 * - Streak: streak calculation in use-fitness-data.ts or similar
 * - Readiness: useReadinessHistory() in use-fitness-data.ts
 *
 * [WIP] Swift updateWidgetData uncompiled on Linux — needs Xcode to verify.
 */

import AscndNativeModule from 'ascnd-native';
import { isAscndNativeAvailable } from './ASCNDNative';

/** Matches TodayWorkoutData in WidgetData.swift */
export interface TodayWorkoutPayload {
  workoutName: string;
  statusText: string;
  nextExerciseName?: string;
  completedExercises: number;
  totalExercises: number;
}

/** Matches StreakReadinessData in WidgetData.swift */
export interface StreakReadinessPayload {
  streakDays: number;
  readinessScore?: number;
  statusText: string;
}

const TODAY_WORKOUT_KEY = 'ascnd.widget.todayWorkout';
const STREAK_READINESS_KEY = 'ascnd.widget.streakReadiness';

/**
 * Push today's workout data to the widget. Fire-and-forget — resolves false
 * if the native module is unavailable or the App Group is not provisioned.
 */
export async function pushTodayWorkout(data: TodayWorkoutPayload): Promise<boolean> {
  return pushWidgetData(TODAY_WORKOUT_KEY, data);
}

/**
 * Push streak + readiness data to the widget. Fire-and-forget.
 */
export async function pushStreakReadiness(data: StreakReadinessPayload): Promise<boolean> {
  return pushWidgetData(STREAK_READINESS_KEY, data);
}

async function pushWidgetData(key: string, data: unknown): Promise<boolean> {
  const mod = AscndNativeModule;
  if (!isAscndNativeAvailable() || !mod?.updateWidgetData) return false;
  try {
    return await mod.updateWidgetData(key, JSON.stringify(data));
  } catch {
    // Widgets are best-effort — never crash the app for a widget push.
    return false;
  }
}
