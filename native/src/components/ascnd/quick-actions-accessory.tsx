import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Camera, Heart, Moon, Sparkles, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  SlideOutDown,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ascnd/icon';
import { colors, radius, spacing } from '@/constants/ascnd';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';

/**
 * The quick-actions button and its sheet, in the tab bar's accessory slot.
 *
 * ── it is not an AI button ──
 *
 * The sparkles glyph says AI and the thing behind it is a menu of four: scan a
 * meal, ask the coach, log biometrics, see sleep. Only one of those four is
 * the coach. It was labelled "Ask coach" while it lived in the old tab bar,
 * which named it after a quarter of its contents and left the other three
 * looking like a surprise.
 *
 * So it carries no text at all now — a round button, the way a floating action
 * button is drawn, and the sheet says what is inside the moment it opens. The
 * accessibility label is "Quick actions", which is what a screen reader should
 * say about a control that opens a menu rather than doing the first thing on
 * it.
 *
 * ── why it is here and not among the tabs ──
 *
 * `NativeTabs.BottomAccessory` is the system's own slot above the tab bar. As
 * the middle item of the bar this made one of five equal-looking slots behave
 * unlike the other four: tap it and nothing navigates. An action is not a
 * destination.
 *
 * Only the button moved. The sheet is the same 2×2, with the same staggered
 * rise and the same backdrop.
 */
const ITEMS = [
  { key: 'scan', icon: Camera, label: { en: 'Scan Food', vi: 'Quét thực phẩm' }, route: '/scan-food?from=ai' as const },
  { key: 'coach', icon: Sparkles, label: { en: 'AI Coach', vi: 'AI Coach' }, route: '/ai-coach' as const },
  { key: 'bio', icon: Heart, label: { en: 'Biometrics', vi: 'Sinh trắc học' }, route: '/biometrics' as const },
  { key: 'sleep', icon: Moon, label: { en: 'Sleep', vi: 'Giấc ngủ' }, route: '/sleep-insights' as const },
];

export function QuickActionsAccessory() {
  const insets = useSafeAreaInsets();
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const [open, setOpen] = useState(false);

  // Drives the Sparkles↔X cross-rotation (web: ±90° fade)
  const openSv = useSharedValue(0);
  useEffect(() => {
    openSv.value = withTiming(open ? 1 : 0, { duration: 180 });
  }, [open, openSv]);

  const sparklesStyle = useAnimatedStyle(() => ({
    opacity: 1 - openSv.value,
    transform: [{ rotate: `${openSv.value * 90}deg` }],
  }));
  const closeStyle = useAnimatedStyle(() => ({
    opacity: openSv.value,
    transform: [{ rotate: `${(openSv.value - 1) * 90}deg` }],
  }));

  const go = (route: (typeof ITEMS)[number]['route']) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setOpen(false);
    setTimeout(() => router.push(route), 120);
  };

  return (
    <>
      {/*
        No surface of its own. The accessory slot is already Liquid Glass —
        the system draws it, minimises it with the bar and matches whatever the
        material is this year — so a capsule here would be a second pane of
        glass on top of the first.
      */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={open ? i18n.nQuickActionsClose : i18n.nQuickActions}
        accessibilityState={{ expanded: open }}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          setOpen((v) => !v);
        }}
        style={({ pressed }) => [styles.btn, pressed && styles.pressed]}>
        <Animated.View style={[styles.icon, sparklesStyle]}>
          <Icon icon={Sparkles} size={18} color={colors.foreground} />
        </Animated.View>
        <Animated.View style={[styles.icon, closeStyle]}>
          <Icon icon={X} size={18} color={colors.foreground} />
        </Animated.View>
      </Pressable>

      <Modal visible={open} transparent animationType="none" onRequestClose={() => setOpen(false)}>
        <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(150)} style={styles.backdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              Haptics.selectionAsync();
              setOpen(false);
            }}
          />
          <Animated.View
            entering={FadeInDown.springify().stiffness(400).damping(30)}
            exiting={SlideOutDown.duration(180)}
            style={[styles.panel, { marginBottom: insets.bottom + 120 }]}>
            {ITEMS.map((item, idx) => (
              // Staggered rise, like the web's per-item 50ms delay
              <Animated.View
                key={item.key}
                style={styles.itemWrap}
                entering={FadeInDown.springify().stiffness(400).damping(30).delay(idx * 50)}>
                <Pressable
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
                  onPress={() => go(item.route)}>
                  <View style={styles.itemIcon}>
                    <Icon icon={item.icon} size={20} color="rgba(237,237,237,0.8)" />
                  </View>
                  <Text style={styles.itemLabel}>{lang === 'vi' ? item.label.vi : item.label.en}</Text>
                </Pressable>
              </Animated.View>
            ))}
          </Animated.View>
        </Animated.View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  // Round, and no wider than its glyph — a button that opens a menu, with the
  // accessory slot's own glass behind it
  btn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The two glyphs cross-fade in place, so they share one cell
  icon: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.7 },

  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
  panel: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  itemWrap: { width: '48%' },
  item: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(24,24,27,0.9)',
  },
  itemPressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
  itemIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  itemLabel: { fontSize: 13, fontWeight: '600', color: colors.foreground },
});
