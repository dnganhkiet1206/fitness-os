import { AlertTriangle, CheckCircle2, Info, XCircle, type LucideIcon } from 'lucide-react-native';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { SlideInUp, SlideOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ascnd/icon';
import { colors, radius, spacing, type } from '@/constants/ascnd';
import { dismissToast, useCurrentToast, type ToastKind } from '@/lib/toast';

const AUTO_HIDE_MS = 3000;

const ACCENT: Record<ToastKind, string> = {
  success: colors.readinessGreen,
  warning: colors.readinessYellow,
  error: colors.readinessRed,
  info: colors.metricBlue,
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
  const t = useCurrentToast();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!t) return;
    const timer = setTimeout(() => dismissToast(t.id), AUTO_HIDE_MS);
    return () => clearTimeout(timer);
  }, [t]);

  if (!t) return null;
  const accent = ACCENT[t.kind];

  return (
    <View style={[styles.wrap, { top: insets.top + 8 }]} pointerEvents="box-none">
      <Animated.View
        key={t.id}
        entering={SlideInUp.springify().stiffness(380).damping(30)}
        exiting={SlideOutUp.duration(160)}
        // Colored shadow = the neon glow; border picks up the same accent
        style={[styles.toast, { borderColor: `${accent}59`, shadowColor: accent }]}>
        <Pressable style={styles.row} onPress={() => dismissToast(t.id)}>
          <View style={[styles.neonBar, { backgroundColor: accent }]} />
          <View style={[styles.iconWrap, { backgroundColor: `${accent}24` }]}>
            <Icon icon={ICONS[t.kind]} size={16} color={accent} />
          </View>
          <Text style={styles.message} numberOfLines={2}>{t.message}</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
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
  message: { ...type.footnote, color: colors.foreground, flex: 1, lineHeight: 18 },
});
