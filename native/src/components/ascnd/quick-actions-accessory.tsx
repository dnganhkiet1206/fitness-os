import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Camera, Heart, Moon, Sparkles } from 'lucide-react-native';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ascnd/icon';
import { colors, radius, spacing } from '@/constants/ascnd';
import { useAppSettings } from '@/hooks/use-app-settings';

/**
 * The quick actions: scan a meal, ask the coach, log biometrics, see sleep.
 *
 * ── the sheet only; the button belongs to whoever opens it ──
 *
 * This was a button plus its sheet, and it has been three places: the middle
 * item of the old hand-drawn tab bar, then `NativeTabs.BottomAccessory`, now
 * the Today header. The first made one of five equal-looking tab slots behave
 * unlike the other four — tap it and nothing navigates, because an action is
 * not a destination. The second drew as a full-width bar of its own above the
 * tab bar, which is the right slot for a now-playing strip and far too much
 * furniture for one button.
 *
 * So the sheet is controlled and has no trigger of its own. Whatever opens it
 * owns the state, and moving it again is a matter of who renders it.
 *
 * ── it is not an AI button ──
 *
 * The sparkles glyph says AI, and only one of the four things behind it is the
 * coach. It used to be labelled "Ask coach", which named it after a quarter of
 * its contents. The control that opens this should read as "Quick actions" —
 * what a menu is called, not the first item on it.
 */
const ITEMS = [
  { key: 'scan', icon: Camera, label: { en: 'Scan Food', vi: 'Quét thực phẩm' }, route: '/scan-food?from=ai' as const },
  { key: 'coach', icon: Sparkles, label: { en: 'AI Coach', vi: 'AI Coach' }, route: '/ai-coach' as const },
  { key: 'bio', icon: Heart, label: { en: 'Biometrics', vi: 'Sinh trắc học' }, route: '/biometrics' as const },
  { key: 'sleep', icon: Moon, label: { en: 'Sleep', vi: 'Giấc ngủ' }, route: '/sleep-insights' as const },
];

export function QuickActionsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { lang } = useAppSettings();

  const go = (route: (typeof ITEMS)[number]['route']) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onClose();
    // Let the sheet finish closing before the push, or the two animations
    // fight over the screen
    setTimeout(() => router.push(route), 120);
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(150)} style={styles.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => {
            Haptics.selectionAsync();
            onClose();
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
  );
}

const styles = StyleSheet.create({
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
