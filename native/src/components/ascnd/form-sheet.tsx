import * as Haptics from 'expo-haptics';
import { X } from 'lucide-react-native';
import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ascnd/icon';
import { colors, radius, spacing, type } from '@/constants/ascnd';
import { useI18n } from '@/hooks/use-app-settings';

/**
 * The frame every "fill this in" sheet in the app uses.
 *
 * ── why it is a frame and not another modal ──
 *
 * Two of these exist — adding food to a meal plan, adding an exercise to the
 * library — and a third will. They had nothing in common but the idea, so they
 * had different heights, different ways out, and different ideas about where
 * the primary button goes. Sharing the frame makes them one thing that appears
 * in two places rather than two things that resemble each other.
 *
 * ── full screen, with a button ──
 *
 * A bottom sheet is dismissed by dragging it down, and that is a gesture you
 * either know or you do not. This fills the screen and closes with a 34pt
 * button at the top. On iOS `pageSheet` still slides in and still drags away
 * for whoever reaches for it — nothing depends on it.
 *
 * The primary action is pinned at the bottom, above the home indicator, where
 * the thumb already is after filling in the last field. The body scrolls
 * between the two, so a long form never buries the thing that finishes it.
 *
 * ── one scroll ──
 *
 * `children` go into the frame's own `ScrollView`. Nothing inside should bring
 * a second one: a list that scrolls inside a page that scrolls is the
 * arrangement where neither responds to the flick you actually made.
 */
export function FormSheet({
  visible,
  title,
  onClose,
  belowHeader,
  footer,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  /** pinned under the title — a progress line, a filter row */
  belowHeader?: ReactNode;
  /** pinned at the bottom, over the safe area */
  footer?: ReactNode;
  children: ReactNode;
}) {
  const i18n = useI18n();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.head}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={i18n.a11yClose}
            hitSlop={12}
            onPress={() => {
              Haptics.selectionAsync();
              onClose();
            }}
            style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
            <Icon icon={X} size={18} color={colors.foreground} />
          </Pressable>
        </View>

        {belowHeader}

        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag">
          {children}
        </ScrollView>

        {footer ? (
          <View style={[styles.foot, { paddingBottom: insets.bottom + spacing.sm }]}>{footer}</View>
        ) : null}
      </KeyboardAvoidingView>
    </Modal>
  );
}

/**
 * A question, the reason for it, and the control that answers it.
 *
 * The hint is not decoration. A row of chips is only obviously a control once
 * you already know what it is choosing between, and a label alone — "Nhóm cơ"
 * over eleven pills — tells somebody what the field is called rather than what
 * it does.
 */
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  title: { ...type.title2, color: colors.foreground, flex: 1 },
  close: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.secondary,
  },
  body: { flex: 1 },
  bodyContent: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.md },
  foot: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  field: { gap: 6 },
  fieldLabel: { ...type.footnote, color: colors.foreground, fontWeight: '700' },
  fieldHint: { ...type.caption, color: colors.mutedForeground, marginTop: -2 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
});
