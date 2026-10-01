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
    exerciseName: string,
    setNumber: number,
    totalSets: number,
    totalSeconds: number,
    /** Absolute end time, ms since epoch. Native derives the countdown from this. */
    endTimestamp: number,
  ): Promise<string>;
  updateRestActivity(
    activityId: string,
    exerciseName: string,
    setNumber: number,
    totalSets: number,
    totalSeconds: number,
    endTimestamp: number,
  ): Promise<void>;
  endRestActivity(activityId: string): Promise<void>;
}

// Optional: null on web / where the native module is not linked.
// Callers in src/native/ios/ null-check before use.
const AscndNativeModule =
  requireOptionalNativeModule<AscndNativeModuleType>('AscndNative');

export default AscndNativeModule;
