import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import * as Haptics from 'expo-haptics';
import { HeartPulse } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ascnd/icon';
import { QuickActionsSheet } from '@/components/ascnd/quick-actions-accessory';

import { useI18n } from '@/hooks/use-app-settings';

/**
 * The health assistant — a round button of its own, off the right end of the
 * tab bar.
 *
 * ── it is not in the capsule, on purpose ──
 *
 * The tab bar is destinations. This is one action that opens four more —
 * scan a meal, ask the coach, log biometrics, see sleep — and it was inside
 * the bar twice before: as the middle item of the old hand-drawn one, and in
 * `NativeTabs.BottomAccessory`. The first made it one equal-looking slot among
 * the tabs that behaved unlike the rest, because tapping it navigates nowhere.
 * The second drew as a second full-width bar above the first.
 *
 * A separate circular island beside the bar is iOS 26's own answer to this
 * shape — it is how the search item is drawn there — and it says what the
 * capsule cannot: this is not one of the destinations.
 *
 * ── beside the bar, not above it ──
 *
 * It spent a version stacked above the bar's right end, because with five tabs
 * a circle level with the capsule would have landed on top of the fifth one.
 * Settings then left the bar, and four tabs need enough less width that there
 * is room at the right for the island to sit where it belongs — level with the
 * capsule, beside it, clear of it.
 *
 * `SIT` is the one number here that cannot be derived. The system lays the
 * capsule out itself and does not report its height or its float, so this is
 * the offset that centres a 52pt circle against a bar of about 56 resting just
 * above the safe area. If a future iOS moves the bar, this is the line to
 * nudge — and the symptom will be a circle sitting slightly high or low
 * against it, not anything breaking.
 *
 * ── the icon ──
 *
 * A pulse, not sparkles. The old glyph said AI, which named the control after
 * one of the four things behind it; this one names what it is for.
 */

/** how far above the safe area the circle sits, to line up with the capsule */
const SIT = 6;

export function HealthAssistantFab() {
  const insets = useSafeAreaInsets();
  const i18n = useI18n();
  const [open, setOpen] = useState(false);
  const glass = isLiquidGlassAvailable();

  return (
    <>
      <View
        // The button is the only thing here that should take a touch; the rest
        // of this box is over the page.
        pointerEvents="box-none"
        style={[styles.wrap, { bottom: insets.bottom + SIT }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={i18n.nHealthAssistant}
          accessibilityState={{ expanded: open }}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setOpen(true);
          }}
          style={({ pressed }) => [styles.btn, pressed && styles.pressed]}>
          {glass ? (
            <GlassView glassEffectStyle="regular" style={StyleSheet.absoluteFill} />
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.fallback]} />
          )}
          <Icon icon={HeartPulse} size={22} />
        </Pressable>
      </View>

      <QuickActionsSheet visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', right: 16, zIndex: 20 },
  btn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
    // Enough to lift it off the page it floats over, and no more: on a dark
    // background RN draws a shadow as a halo rather than a falloff
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  fallback: { backgroundColor: 'rgba(28,28,32,0.92)' },
  pressed: { opacity: 0.9, transform: [{ scale: 0.94 }] },
});
