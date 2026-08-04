import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import * as Haptics from 'expo-haptics';
import { HeartPulse } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ascnd/icon';
import { QuickActionsSheet } from '@/components/ascnd/quick-actions-accessory';
import { colors } from '@/constants/ascnd';
import { useI18n } from '@/hooks/use-app-settings';

/**
 * The health assistant — a round button of its own, off the right end of the
 * tab bar.
 *
 * ── it is not in the capsule, on purpose ──
 *
 * The tab bar is five destinations. This is one action that opens four more —
 * scan a meal, ask the coach, log biometrics, see sleep — and it was inside
 * the bar twice before: as the middle item of the old hand-drawn one, and in
 * `NativeTabs.BottomAccessory`. The first made one of five equal-looking slots
 * behave unlike the other four, because tapping it navigates nowhere. The
 * second drew as a second full-width bar above the first.
 *
 * A separate circular island beside the bar is iOS 26's own answer to this
 * shape — it is how the search item is drawn there — and it says what the
 * capsule cannot: this is not one of the five.
 *
 * ── why it sits above the bar rather than beside it ──
 *
 * On iOS 26 the system shrinks the tab capsule to make room for the island
 * next to it. Nothing here can do that: the bar is a real `UITabBarController`
 * and it lays itself out across the width. A circle placed level with it would
 * land on top of the fifth tab. So it clears the bar's height and sits above
 * its right end — the same relationship, without covering a destination.
 *
 * ── the icon ──
 *
 * A pulse, not sparkles. The old glyph said AI, which named the control after
 * one of the four things behind it; this one names what it is for.
 */

/** the tab bar's own height, cleared so the button never covers a tab */
const BAR_H = 56;

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
        style={[styles.wrap, { bottom: insets.bottom + BAR_H + 12 }]}>
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
          <Icon icon={HeartPulse} size={22} color={colors.foreground} />
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
