import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { Barcode, Camera, Pencil, Plus, Search } from 'lucide-react-native';
import { useState } from 'react';
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
import { BottomTabInset } from '@/constants/expo-template-theme';
import { colors, radius, spacing, type } from '@/constants/ascnd';
import type { useI18n } from '@/hooks/use-app-settings';

/**
 * Logging a meal, from a button that costs no page.
 *
 * The diary used to end in a full-width 44pt "Ghi bữa ăn" bar. It worked, but
 * it took a card's worth of height at the bottom of a list that is already the
 * longest thing on the tab, and it only offered one of the four ways this app
 * can actually log food — the other three (camera, barcode, search) were buried
 * one screen deeper, inside the manual form.
 *
 * So it is a floating ⊕ instead: no height in the flow at all, always within
 * thumb reach, and it opens the four ways at once.
 *
 * **Why a sheet and not a radial fan.** The tab bar's AI button already fans
 * items out over a dimmed backdrop, and a second fan a few points away would
 * read as the same control. This is a list with a label and a line of
 * explanation each, which is also what makes "Mã vạch" and "Tìm món"
 * distinguishable at a glance — a row of four unlabelled icons is a memory
 * test.
 *
 * It sits above `BottomTabInset` so it clears the tab bar, and it does not hide
 * on scroll the way the tab bar does: the whole point is that it is reachable
 * from wherever you are in the diary.
 */

interface Action {
  key: string;
  icon: typeof Camera;
  color: string;
  label: keyof ReturnType<typeof useI18n>;
  hint: keyof ReturnType<typeof useI18n>;
  route: string;
}

/**
 * Camera first — it is the one people reach for and the one this app is
 * fastest at — then the two lookups, then typing it in, which is the fallback
 * when nothing else knows the food.
 */
const ACTIONS: Action[] = [
  { key: 'camera', icon: Camera, color: colors.metricPurple, label: 'nAddCamera', hint: 'nAddCameraHint', route: '/scan-food' },
  { key: 'barcode', icon: Barcode, color: colors.metricCyan, label: 'nAddBarcode', hint: 'nAddBarcodeHint', route: '/scan-barcode' },
  { key: 'search', icon: Search, color: colors.metricBlue, label: 'nAddSearch', hint: 'nAddSearchHint', route: '/food-list' },
  { key: 'manual', icon: Pencil, color: colors.metricOrange, label: 'nAddManual', hint: 'nAddManualHint', route: '/log-meal' },
];

export function LogMealFab({ i18n }: { i18n: ReturnType<typeof useI18n> }) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);

  // the ⊕ turns into a × as the sheet comes up
  const spin = useSharedValue(0);
  const plusStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value * 45}deg` }],
  }));

  const toggle = (next: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    spin.value = withTiming(next ? 1 : 0, { duration: 180 });
    setOpen(next);
  };

  const pick = (route: string) => {
    Haptics.selectionAsync();
    spin.value = withTiming(0, { duration: 180 });
    setOpen(false);
    // let the sheet start closing before the push, so the two do not animate
    // over each other — the same 120ms the tab bar's AI menu uses
    setTimeout(() => router.push(route as never), 120);
  };

  return (
    <>
      <Pressable
        onPress={() => toggle(true)}
        style={({ pressed }) => [
          styles.fab,
          { bottom: BottomTabInset + insets.bottom + spacing.sm },
          pressed && styles.fabPressed,
        ]}>
        <Animated.View style={plusStyle}>
          <Icon icon={Plus} size={26} color={colors.primaryForeground} strokeWidth={2.5} />
        </Animated.View>
      </Pressable>

      <Modal visible={open} transparent animationType="none" onRequestClose={() => toggle(false)}>
        <Animated.View
          entering={FadeIn.duration(180)}
          exiting={FadeOut.duration(150)}
          style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => toggle(false)} />
          <Animated.View
            entering={FadeInDown.springify().stiffness(400).damping(30)}
            exiting={SlideOutDown.duration(180)}
            style={[styles.sheet, { marginBottom: BottomTabInset + insets.bottom + 72 }]}>
            {ACTIONS.map((a, i) => (
              <Animated.View
                key={a.key}
                entering={FadeInDown.springify().stiffness(400).damping(30).delay(i * 45)}>
                <Pressable
                  onPress={() => pick(a.route)}
                  style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
                  <View style={[styles.rowIcon, { backgroundColor: `${a.color}1f` }]}>
                    <Icon icon={a.icon} size={20} color={a.color} />
                  </View>
                  <View style={styles.rowText}>
                    <Text style={styles.rowLabel}>{i18n[a.label] as string}</Text>
                    <Text style={styles.rowHint} numberOfLines={1}>
                      {i18n[a.hint] as string}
                    </Text>
                  </View>
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
  fab: {
    position: 'absolute',
    right: spacing.md,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    // lifted off the page rather than outlined, so it reads as floating over
    // the diary instead of as another card in it
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  fabPressed: { opacity: 0.9, transform: [{ scale: 0.94 }] },

  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(4,4,6,0.6)' },
  sheet: { marginHorizontal: spacing.md, gap: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: '#16161c',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  rowPressed: { opacity: 0.9, transform: [{ scale: 0.98 }] },
  rowIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  rowLabel: { ...type.headline, color: colors.foreground },
  rowHint: { ...type.caption, color: colors.mutedForeground },
});
