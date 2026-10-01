// #195 spike — availability gate for the `ascnd-native` Swift module.
//
// React Native / TypeScript remains the source of truth for ALL product and
// business state. Swift owns only iOS-specific capabilities (ActivityKit,
// WidgetKit, native haptics bridge validation) and never duplicates business
// calculations.
import AscndNativeModule from 'ascnd-native';

/** True when the native `AscndNative` module is linked (iOS device builds). */
export function isAscndNativeAvailable(): boolean {
  return AscndNativeModule != null;
}
