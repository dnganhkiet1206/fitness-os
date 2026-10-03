// #195 spike — TypeScript entry point of the `ascnd-native` Expo module.
//
// The native implementation lives in ios/ (Swift, compiled into the app
// target by Expo autolinking). The widget extension target does NOT link
// ExpoModulesCore, so it compiles only Shared/ + Widgets/ Swift sources —
// see plugins/with-ascnd-widgets.js.
import { requireOptionalNativeModule } from 'expo-modules-core';

export type NativeHapticStyle = 'light' | 'medium' | 'heavy';

export interface AscndNativeModuleType {
  /** Bridge-validation only. Product haptics stay in src/lib/haptics.ts (#194). */
  playHaptic(style: NativeHapticStyle): void;
  areLiveActivitiesEnabled(): boolean;
  startRestActivity(
    activityState: string,
    exerciseName: string,
    setNumber: number,
    totalSets: number,
    totalSeconds: number,
    /** Absolute end time, ms since epoch. Native derives the countdown from this. */
    endTimestamp: number,
    /** App language ('vi' | 'en') — Swift looks up localized Island strings. */
    languageCode: string,
  ): Promise<string>;
  updateRestActivity(
    activityId: string,
    activityState: string,
    exerciseName: string,
    setNumber: number,
    totalSets: number,
    totalSeconds: number,
    /** Absolute end time, ms since epoch. Native derives the countdown from this. */
    endTimestamp: number,
    /** App language ('vi' | 'en') — Swift looks up localized Island strings. */
    languageCode: string,
  ): Promise<void>;
  /**
   * Push widget data to the App Group shared UserDefaults (production wiring,
   * replaces the SPIKE-ONLY mock in WidgetData.swift).
   * @param key 'ascnd.widget.todayWorkout' | 'ascnd.widget.streakReadiness'
   * @param json JSON string matching TodayWorkoutData / StreakReadinessData
   * @returns true if written, false if App Group not provisioned (silent no-op)
   * [WIP] Swift side uncompiled on Linux — needs Xcode to verify.
   */
  updateWidgetData(key: string, json: string): Promise<boolean>;
  endRestActivity(activityId: string): Promise<void>;
  /**
   * Last island intent payload (JSON) from the App Group — the foreground
   * reconcile path for pause/resume/±15s taps that fired while JS was
   * suspended. Null when none pending or the module is unavailable.
   * (Interactive Island, 02/10/2026.)
   */
  getIslandRestState(): Promise<string | null>;
}

// Optional: null on web / where the native module is not linked.
// Callers in src/native/ios/ null-check before use.
const AscndNativeModule =
  requireOptionalNativeModule<AscndNativeModuleType>('AscndNative');

export default AscndNativeModule;
