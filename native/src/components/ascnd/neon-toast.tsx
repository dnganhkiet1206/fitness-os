import { AlertTriangle, CheckCircle2, Info, XCircle, type LucideIcon } from 'lucide-react-native';
import { useEffect } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, FadeInDown, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ascnd/icon';
import { useI18n } from '@/hooks/use-app-settings';
import { radius, spacing, type } from '@/constants/ascnd';
import { makeStyles, type PaletteKey } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import { dismissToast, useCurrentToast, type ToastKind } from '@/lib/toast';

/** One nested entry keeps the dictionary off `Record<string, string>`, so the
 *  lookup is checked rather than cast. */
function errorCopy(dict: Record<string, unknown>, key: string, fallback: string): string {
  const copy = dict[key];
  return typeof copy === 'string' ? copy : fallback;
}

const AUTO_HIDE_MS = 3000;

/*
  Khoá của bảng màu, không phải mã màu: một mã màu ở phạm vi module bị ĐÓNG BĂNG
  lúc import và sẽ giữ màu của theme tối kể cả khi người dùng bật theme sáng.
  Bảng vẫn là hằng thật; chỗ vẽ — nơi luôn có `c` — mới đổi khoá thành màu.
*/
const ACCENT: Record<ToastKind, PaletteKey> = {
  success: 'readinessGreen',
  warning: 'readinessYellow',
  error: 'readinessRed',
  info: 'metricBlue',
};

const ICONS: Record<ToastKind, LucideIcon> = {
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
  info: Info,
};

/**
 * Neon toast bar — drops in under the status bar with a colored glow
 * per kind (green success / yellow warning / red error / blue info),
 * auto-hides after 3s, tap to dismiss. Fire via toast.success(...) etc.
 * from '@/lib/toast'.
 */
export function NeonToastHost() {
  const c = usePalette();
  const styles = stylesFor(c);
  const t = useCurrentToast();
  const i18n = useI18n();
  const insets = useSafeAreaInsets();

  /*
    ── the sentence, resolved here and nowhere else ──

    `toast.fail` stores an i18n KEY when the thrown thing came from PostgreSQL
    or GoTrue, because the store is module-level and the language is in React
    context. Resolving it at render is what makes a language switch re-word a
    toast that is already on screen, and it keeps every screen from having to
    know the difference between an error written for a person and one written
    for a developer.

    The fallback is the raw text, which is correct: a key is only ever set for
    a system error, so anything without one is a sentence the app wrote.
  */
  const text = t == null ? '' : t.failureKey ? errorCopy(i18n, t.failureKey, t.message) : t.message;

  useEffect(() => {
    if (!t) return;
    /*
      ── said out loud, because this bar is the only thing that says it ──

      Nothing here spoke to VoiceOver: no live region, no announcement. And this
      is the app's **sole** channel for "meal saved", "workout saved", "queued
      offline" and every `toast.error` — the log sheets pop themselves on
      success, so there is no other surface left to read. A blind user tapped
      Save and received a haptic and nothing else; on failure, the same haptic
      and nothing else.

      It also cannot be reached by navigating: it removes itself after
      `AUTO_HIDE_MS`, which is shorter than it takes to swipe to it. So the
      announcement has to be pushed, not offered.

      `announceForAccessibility` is the push, and it is what carries this on
      iOS; `accessibilityLiveRegion` on the view below is the Android half of
      the same idea. Both are cheap and neither is a substitute for the other.
    */
    AccessibilityInfo.announceForAccessibility(text);
    const timer = setTimeout(() => dismissToast(t.id), AUTO_HIDE_MS);
    return () => clearTimeout(timer);
  }, [t, text]);

  if (!t) return null;
  const accent = c[ACCENT[t.kind]];

  return (
    <View
      style={[styles.wrap, { top: insets.top + 8 }]}
      pointerEvents="box-none"
      accessibilityLiveRegion="polite">
      <Animated.View
        key={t.id}
        // Calm entrance: a short fade + gentle drop, no spring overshoot
        entering={FadeInDown.duration(240).easing(Easing.out(Easing.quad))}
        exiting={FadeOutUp.duration(180)}
        // Colored shadow = the neon glow; border picks up the same accent
        style={[styles.toast, { borderColor: `${accent}59`, shadowColor: accent }]}>
        <Pressable
          accessibilityRole="button"
          /* The message is the label: a bar that announces "button" and nothing
             else is what an unlabelled control sounds like. */
          accessibilityLabel={text}
          style={styles.row}
          onPress={() => dismissToast(t.id)}>
          <View style={[styles.neonBar, { backgroundColor: accent }]} />
          <View style={[styles.iconWrap, { backgroundColor: `${accent}24` }]}>
            <Icon icon={ICONS[t.kind]} size={16} color={accent} />
          </View>
          <Text style={styles.message} numberOfLines={2}>{text}</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const stylesFor = makeStyles((c) => ({
  wrap: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    zIndex: 60,
    alignItems: 'center',
  },
  toast: {
    alignSelf: 'stretch',
    borderRadius: radius.md,
    borderWidth: 1,
    backgroundColor: 'rgba(12,12,16,0.94)',
    shadowOpacity: 0.55,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    paddingVertical: spacing.sm + 4,
    paddingLeft: spacing.sm + 2,
    paddingRight: spacing.md,
  },
  neonBar: {
    width: 3,
    alignSelf: 'stretch',
    borderRadius: 2,
  },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  message: { ...type.footnote, color: c.foreground, flex: 1, lineHeight: 18 },
}));
