/**
 * Native iOS Haptic Feedback via Capacitor
 * Falls back to navigator.vibrate on web
 */

type HapticStyle = 'light' | 'medium' | 'heavy' | 'selection' | 'success' | 'warning' | 'error';

let hapticPlugin: any = null;
let hapticChecked = false;

async function getHapticPlugin() {
  if (hapticChecked) return hapticPlugin;
  hapticChecked = true;
  try {
    if ((window as any)?.Capacitor?.isNativePlatform?.()) {
      const mod = await import(/* @vite-ignore */ '@capacitor/haptics');
      hapticPlugin = mod.Haptics;
    }
  } catch {
    // Not available
  }
  return hapticPlugin;
}

// Pre-load on init
getHapticPlugin();

export function haptic(style: HapticStyle = 'light') {
  // Fire-and-forget for performance
  getHapticPlugin().then(plugin => {
    if (plugin) {
      switch (style) {
        case 'light':
          plugin.impact({ style: 'LIGHT' }).catch(() => {});
          break;
        case 'medium':
          plugin.impact({ style: 'MEDIUM' }).catch(() => {});
          break;
        case 'heavy':
          plugin.impact({ style: 'HEAVY' }).catch(() => {});
          break;
        case 'selection':
          plugin.selectionStart?.().catch(() => {});
          break;
        case 'success':
          plugin.notification?.({ type: 'SUCCESS' }).catch(() => {});
          break;
        case 'warning':
          plugin.notification?.({ type: 'WARNING' }).catch(() => {});
          break;
        case 'error':
          plugin.notification?.({ type: 'ERROR' }).catch(() => {});
          break;
      }
    } else if ('vibrate' in navigator) {
      navigator.vibrate(style === 'light' || style === 'selection' ? 6 : 12);
    }
  });
}
