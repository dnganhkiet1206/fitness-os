import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  Camera,
  Dumbbell,
  Heart,
  Home,
  Moon,
  Sparkles,
  TrendingUp,
  Utensils,
  X,
  type LucideIcon,
} from 'lucide-react-native';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  SlideInDown,
  SlideOutDown,
  interpolate,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ascnd/icon';
import { colors, radius, spacing } from '@/constants/ascnd';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { resetTabBar, tabBarVisible } from '@/lib/tab-bar-visibility';

const TAB_ICONS: Record<string, LucideIcon> = {
  index: Home,
  nutrition: Utensils,
  workouts: Dumbbell,
  progress: TrendingUp,
};

const AI_ITEMS = [
  { key: 'scan', icon: Camera, label: { en: 'Scan Food', vi: 'Quét thực phẩm' }, route: '/scan-food?from=ai' as const },
  { key: 'coach', icon: Sparkles, label: { en: 'AI Coach', vi: 'AI Coach' }, route: '/ai-coach' as const },
  { key: 'bio', icon: Heart, label: { en: 'Biometrics', vi: 'Sinh trắc học' }, route: '/biometrics' as const },
  { key: 'sleep', icon: Moon, label: { en: 'Sleep', vi: 'Giấc ngủ' }, route: '/sleep-insights' as const },
];

/**
 * Faithful port of the web BottomTabBar: a floating liquid-glass pill
 * with four tabs and a round AI button in the middle. The active tab
 * expands into a bright pill with its label; the AI button opens the
 * 2×2 quick-actions sheet (Scan / Coach / Biometrics / Sleep).
 */
export function LiquidTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const [aiOpen, setAiOpen] = useState(false);

  const labels: Record<string, string> = {
    index: i18n.navToday,
    nutrition: i18n.navNutrition,
    workouts: i18n.navWorkouts,
    progress: i18n.navProgress,
  };

  const go = (routeName: string, index: number) => {
    const active = state.index === index;
    Haptics.impactAsync(active ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium);
    if (!active) {
      resetTabBar();
      navigation.navigate(routeName);
    }
  };

  // Scroll-aware hide/show (web autoHide behavior)
  const hideStyle = useAnimatedStyle(() => ({
    opacity: tabBarVisible.value,
    transform: [{ translateY: interpolate(tabBarVisible.value, [0, 1], [100, 0]) }],
  }));

  const renderTab = (routeName: string) => {
    const index = state.routes.findIndex((r: { name: string }) => r.name === routeName);
    if (index < 0) return null;
    const active = state.index === index;
    const IconCmp = TAB_ICONS[routeName] ?? Home;
    return (
      <Animated.View key={routeName} layout={LinearTransition.springify().stiffness(350).damping(28)}>
        <Pressable
          onPress={() => go(routeName, index)}
          style={({ pressed }) => [
            styles.tab,
            active && styles.tabActive,
            pressed && styles.pressed,
          ]}>
          <Icon icon={IconCmp} size={20} color={active ? colors.foreground : colors.mutedForeground} />
          {active && (
            <Animated.Text entering={FadeIn.duration(160)} style={styles.tabLabel} numberOfLines={1}>
              {labels[routeName]}
            </Animated.Text>
          )}
        </Pressable>
      </Animated.View>
    );
  };

  const openAiItem = (route: (typeof AI_ITEMS)[number]['route']) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setAiOpen(false);
    setTimeout(() => router.push(route), 120);
  };

  return (
    <>
      <Animated.View
        style={[styles.wrap, { paddingBottom: insets.bottom + 8 }, hideStyle]}
        pointerEvents="box-none">
        <View style={styles.pill}>
          {renderTab('index')}
          {renderTab('nutrition')}

          {/* Center AI button */}
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setAiOpen((v) => !v);
            }}
            style={({ pressed }) => [styles.aiBtn, aiOpen && styles.aiBtnOpen, pressed && styles.pressed]}>
            <Icon icon={aiOpen ? X : Sparkles} size={18} color="rgba(237,237,237,0.9)" />
          </Pressable>

          {renderTab('workouts')}
          {renderTab('progress')}
        </View>
      </Animated.View>

      {/* AI quick-actions overlay (web: dim blur backdrop + 2×2 panel) */}
      <Modal visible={aiOpen} transparent animationType="none" onRequestClose={() => setAiOpen(false)}>
        <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(150)} style={styles.overlayBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => { Haptics.selectionAsync(); setAiOpen(false); }} />
          <Animated.View
            entering={SlideInDown.springify().stiffness(400).damping(30)}
            exiting={SlideOutDown.duration(180)}
            style={[styles.aiPanel, { marginBottom: insets.bottom + 96 }]}>
            {AI_ITEMS.map((item) => (
              <Pressable
                key={item.key}
                style={({ pressed }) => [styles.aiItem, pressed && styles.aiItemPressed]}
                onPress={() => openAiItem(item.route)}>
                <View style={styles.aiItemIcon}>
                  <Icon icon={item.icon} size={20} color="rgba(237,237,237,0.8)" />
                </View>
                <Text style={styles.aiItemLabel}>{lang === 'vi' ? item.label.vi : item.label.en}</Text>
              </Pressable>
            ))}
          </Animated.View>
          {/* Keep the tab bar visually present above the backdrop */}
          <View style={[styles.wrap, { paddingBottom: insets.bottom + 8 }]} pointerEvents="box-none">
            <View style={styles.pill}>
              {renderTab('index')}
              {renderTab('nutrition')}
              <Pressable
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setAiOpen(false); }}
                style={({ pressed }) => [styles.aiBtn, styles.aiBtnOpen, pressed && styles.pressed]}>
                <Icon icon={X} size={18} color="rgba(237,237,237,0.9)" />
              </Pressable>
              {renderTab('workouts')}
              {renderTab('progress')}
            </View>
          </View>
        </Animated.View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 6,
    borderRadius: 28,
    backgroundColor: 'rgba(7,7,8,0.88)',
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.15)',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.full,
    minHeight: 40,
  },
  tabActive: {
    paddingLeft: 14,
    paddingRight: 16,
    backgroundColor: 'rgba(255,255,255,0.13)',
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  tabLabel: { fontSize: 13, fontWeight: '600', color: colors.foreground },
  aiBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginHorizontal: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  aiBtnOpen: { backgroundColor: 'rgba(255,255,255,0.16)' },
  pressed: { opacity: 0.85, transform: [{ scale: 0.9 }] },

  overlayBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(7,7,8,0.7)',
    justifyContent: 'flex-end',
  },
  aiPanel: {
    marginHorizontal: spacing.md,
    borderRadius: radius.xl,
    padding: spacing.card,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm + 4,
    backgroundColor: 'rgba(18,18,22,0.97)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -8 },
  },
  aiItem: {
    width: '47.5%',
    alignItems: 'center',
    gap: 10,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: 'rgba(24,24,27,0.3)',
  },
  aiItemPressed: { backgroundColor: 'rgba(24,24,27,0.55)', transform: [{ scale: 0.95 }] },
  aiItemIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  aiItemLabel: { fontSize: 11, fontWeight: '500', color: 'rgba(237,237,237,0.7)' },
});
