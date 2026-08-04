import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Camera, ChevronRight, Heart, Moon, Sparkles, type LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { Screen } from '@/components/ascnd/screen';
import { colors, radius, spacing, type } from '@/constants/ascnd';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { rise } from '@/lib/entrance';

/**
 * Health assistant — the four things the app can do *for* you, on a page.
 *
 * ── why it is a page and not a button ──
 *
 * These four were behind a floating button for a long time, and the button
 * kept having nowhere to live: the middle slot of a hand-drawn tab bar, where
 * it looked like a destination and navigated nowhere; the native accessory
 * slot, which draws as a second full-width bar; a circle floating over the
 * corner, which cannot make the tab bar move aside for it.
 *
 * The last of those is what settled it. A separate island beside the tab bar
 * is an iOS 26 layout, and the system only produces it for a *tab* — it
 * shrinks the capsule to make room and draws the odd one out as a circle.
 * Nothing in an app can ask a `UITabBarController` to stand aside; it can only
 * give it a fifth item and let it do that itself.
 *
 * So this is a destination now, which is also the honest description: a menu
 * of four screens was never an action.
 *
 * ── the trigger's role ──
 *
 * `role="search"` in `app-tabs` is what makes the island. It is the only role
 * iOS draws that way, and it brings a fixed system title with it — so the
 * label is hidden and the tab carries an `accessibilityLabel` instead, which
 * is what a screen reader reads anyway.
 */

interface Action {
  key: string;
  icon: LucideIcon;
  color: string;
  label: { en: string; vi: string };
  hint: { en: string; vi: string };
  route: '/scan-food?from=ai' | '/ai-coach' | '/biometrics' | '/sleep-insights';
}

const ACTIONS: Action[] = [
  {
    key: 'scan',
    icon: Camera,
    color: colors.metricOrange,
    label: { en: 'Scan a meal', vi: 'Quét thực phẩm' },
    hint: { en: 'Point the camera at a plate', vi: 'Hướng máy ảnh vào đĩa ăn' },
    route: '/scan-food?from=ai',
  },
  {
    key: 'coach',
    icon: Sparkles,
    color: colors.metricPurple,
    label: { en: 'AI Coach', vi: 'AI Coach' },
    hint: { en: 'Ask about training or food', vi: 'Hỏi về tập luyện hoặc ăn uống' },
    route: '/ai-coach',
  },
  {
    key: 'bio',
    icon: Heart,
    color: colors.readinessRed,
    label: { en: 'Biometrics', vi: 'Sinh trắc học' },
    hint: { en: 'Heart rate, HRV, oxygen', vi: 'Nhịp tim, HRV, oxy' },
    route: '/biometrics',
  },
  {
    key: 'sleep',
    icon: Moon,
    color: colors.metricBlue,
    label: { en: 'Sleep', vi: 'Giấc ngủ' },
    hint: { en: 'Last night, and the trend', vi: 'Đêm qua, và xu hướng' },
    route: '/sleep-insights',
  },
];

export default function AssistantScreen() {
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const vi = lang === 'vi';

  return (
    <Screen title={i18n.nHealthAssistant}>
      {ACTIONS.map((a, i) => (
        <Animated.View key={a.key} entering={rise(i)}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={vi ? a.label.vi : a.label.en}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push(a.route);
            }}>
            {({ pressed }) => (
              <GlassCard style={[styles.card, pressed && styles.pressed]}>
                <View style={[styles.icon, { backgroundColor: `${a.color}1f` }]}>
                  <Icon icon={a.icon} size={20} color={a.color} />
                </View>
                <View style={styles.text}>
                  <Text style={styles.label}>{vi ? a.label.vi : a.label.en}</Text>
                  <Text style={styles.hint} numberOfLines={1}>
                    {vi ? a.hint.vi : a.hint.en}
                  </Text>
                </View>
                <Icon icon={ChevronRight} size={17} color={colors.mutedForeground} />
              </GlassCard>
            )}
          </Pressable>
        </Animated.View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  icon: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, minWidth: 0, gap: 2 },
  label: { ...type.headline, color: colors.foreground },
  hint: { ...type.footnote, color: colors.mutedForeground },
});
