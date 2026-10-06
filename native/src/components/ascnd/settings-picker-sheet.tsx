import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';

import { radius, spacing, type } from '@/constants/ascnd';
import { usePalette } from '@/hooks/use-palette';
import { haptics as Haptics } from '@/lib/haptics';
import { Icon } from '@/components/ascnd/icon';
import { Check } from 'lucide-react-native';

export interface PickerOption {
  /** Stable key for the option */
  key: string;
  /** Main label */
  label: string;
  /** Optional description below the label */
  description?: string;
  /** Leading visual — flag emoji, icon name, or custom node */
  leading?: ReactNode;
  /** Accessibility label override */
  accessibilityLabel?: string;
}

interface SettingsPickerSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  options: PickerOption[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  cancelLabel: string;
}

/**
 * iOS-style bottom sheet for picking one option from a short list.
 * Used for Language and Appearance in Settings.
 *
 * ── why a custom sheet and not FormSheet ──
 *
 * FormSheet is a full-screen form frame (pageSheet presentation, header with
 * close button, primary action pinned at bottom). A picker is not a form —
 * it's a transient choice that should feel like iOS Settings: slide up from
 * bottom, tap an option, done. No save button, no header chrome.
 *
 * ── behavior ──
 *
 * - Tap an option → onSelect fires immediately, sheet dismisses
 * - Tap scrim or Cancel → dismiss without change
 * - Haptic on select (selection) — matches Settings row taps
 * - 44pt minimum touch targets, full-width rows
 */
export function SettingsPickerSheet({
  visible,
  onClose,
  title,
  subtitle,
  options,
  selectedKey,
  onSelect,
  cancelLabel,
}: SettingsPickerSheetProps) {
  const c = usePalette();
  const insets = useSafeAreaInsets();
  const styles = StyleSheet.create({
    scrim: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.4)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: c.card,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      paddingBottom: Math.max(insets.bottom, spacing.md),
      maxHeight: '80%',
    },
    handle: {
      width: 36,
      height: 5,
      borderRadius: 3,
      backgroundColor: c.border,
      alignSelf: 'center',
      marginTop: spacing.sm,
      marginBottom: spacing.sm,
    },
    header: {
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.md,
    },
    title: {
      ...type.title,
      color: c.foreground,
      textAlign: 'center',
    },
    subtitle: {
      ...type.footnote,
      color: c.mutedForeground,
      textAlign: 'center',
      marginTop: spacing.xs,
    },
    list: {
      paddingHorizontal: spacing.md,
    },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 56,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: radius.md,
    },
    optionSelected: {
      backgroundColor: c.secondary,
    },
    leading: {
      width: 32,
      alignItems: 'center',
      marginRight: spacing.sm,
    },
    leadingText: {
      fontSize: 22,
    },
    textWrap: {
      flex: 1,
    },
    label: {
      ...type.body,
      color: c.foreground,
    },
    description: {
      ...type.footnote,
      color: c.mutedForeground,
      marginTop: 2,
    },
    check: {
      marginLeft: spacing.sm,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: c.border,
      marginVertical: spacing.xs,
      marginHorizontal: spacing.md,
    },
    cancelButton: {
      marginTop: spacing.md,
      marginHorizontal: spacing.md,
      minHeight: 52,
      borderRadius: radius.md,
      backgroundColor: c.secondary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cancelText: {
      ...type.body,
      color: c.foreground,
      fontWeight: '600',
    },
  });

  const handleSelect = (key: string) => {
    Haptics.selection();
    onSelect(key);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent>
      <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(180)} style={styles.scrim}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={cancelLabel}
        />
        <Animated.View
          entering={SlideInDown.duration(320)}
          exiting={SlideOutDown.duration(200)}
          style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title} accessibilityRole="header">
              {title}
            </Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
          <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
            {options.map((opt, idx) => {
              const selected = opt.key === selectedKey;
              return (
                <View key={opt.key}>
                  {idx > 0 ? <View style={styles.divider} /> : null}
                  <Pressable
                    style={[styles.option, selected && styles.optionSelected]}
                    onPress={() => handleSelect(opt.key)}
                    accessibilityRole="radio"
                    accessibilityLabel={opt.accessibilityLabel ?? opt.label}
                    accessibilityState={{ selected, checked: selected }}
                    aria-checked={selected}
                    aria-selected={selected}>
                    {opt.leading ? <View style={styles.leading}>{opt.leading}</View> : null}
                    <View style={styles.textWrap}>
                      <Text style={styles.label}>{opt.label}</Text>
                      {opt.description ? <Text style={styles.description}>{opt.description}</Text> : null}
                    </View>
                    {selected ? (
                      <View style={styles.check}>
                        <Icon icon={Check} size={20} color={c.primary} />
                      </View>
                    ) : null}
                  </Pressable>
                </View>
              );
            })}
          </ScrollView>
          <Pressable
            style={styles.cancelButton}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={cancelLabel}>
            <Text style={styles.cancelText}>{cancelLabel}</Text>
          </Pressable>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}
