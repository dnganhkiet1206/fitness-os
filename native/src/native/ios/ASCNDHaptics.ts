// #195 spike — native haptics THROUGH the Swift bridge.
//
// BRIDGE VALIDATION ONLY. This is NOT a replacement for the product haptics
// wrapper in src/lib/haptics.ts (#194) — that stays the single product API.
// This file exists for one reason: to prove RN -> Swift calls work end-to-end
// on device without involving ActivityKit.
import AscndNativeModule, { type NativeHapticStyle } from 'ascnd-native';
import { isAscndNativeAvailable } from './ASCNDNative';

export type { NativeHapticStyle };

/** Plays a haptic via Swift (UIImpactFeedbackGenerator). False when unavailable. */
export function playNativeHaptic(style: NativeHapticStyle = 'light'): boolean {
  const mod = AscndNativeModule;
  if (!isAscndNativeAvailable() || !mod) return false;
  try {
    mod.playHaptic(style);
    return true;
  } catch {
    return false;
  }
}
