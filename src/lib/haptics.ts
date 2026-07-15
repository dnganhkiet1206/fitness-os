/**
 * Native iOS Haptic Feedback via Capacitor
 * Falls back to navigator.vibrate on web
 */

import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

type HapticStyle = 'light' | 'medium' | 'heavy' | 'selection' | 'success' | 'warning' | 'error';

const canVibrate = typeof navigator !== 'undefined' && 'vibrate' in navigator;

export function haptic(style: HapticStyle = 'light') {
  // Fire-and-forget for performance
  if (Capacitor.isNativePlatform()) {
    switch (style) {
      case 'light':
        Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
        break;
      case 'medium':
        Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
        break;
      case 'heavy':
        Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {});
        break;
      case 'selection':
        Haptics.selectionChanged().catch(() => {});
        break;
      case 'success':
        Haptics.notification({ type: NotificationType.Success }).catch(() => {});
        break;
      case 'warning':
        Haptics.notification({ type: NotificationType.Warning }).catch(() => {});
        break;
      case 'error':
        Haptics.notification({ type: NotificationType.Error }).catch(() => {});
        break;
    }
  } else if (canVibrate) {
    navigator.vibrate(style === 'light' || style === 'selection' ? 6 : 12);
  }
}
