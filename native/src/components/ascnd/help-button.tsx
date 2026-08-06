import * as Haptics from 'expo-haptics';
import { HelpCircle, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { Icon } from '@/components/ascnd/icon';
import { colors, radius, spacing } from '@/constants/ascnd';
import { useI18n } from '@/hooks/use-app-settings';
import { noteHelpOpened, noteNudged, shouldNudge } from '@/lib/help-nudge';

/**
 * A card's `?`, the sheet behind it, and the hint that it is there.
 *
 * ── why it is shared ──
 *
 * The readiness card got one, then the training card. Both need the same three
 * things wired the same way — a button, a counted hint, and the storage key
 * that ties them together — and the failure mode of doing it twice is not a
 * visual inconsistency. It is a hint that counts under one topic name and is
 * silenced under another, whose only symptom is a tip that never stops
 * appearing on a card somebody opens every morning.
 *
 * See `lib/help-nudge.ts` for the counting rules. The short version: three
 * showings ever, one per app run, none at all once the help has been opened.
 */
export function useHelpTopic(topic: string) {
  const [open, setOpen] = useState(false);
  const [nudge, setNudge] = useState(false);

  useEffect(() => {
    let alive = true;
    void shouldNudge(topic).then((show) => {
      if (!alive || !show) return;
      setNudge(true);
      void noteNudged(topic);
    });
    return () => {
      alive = false;
    };
  }, [topic]);

  return {
    open,
    nudge,
    close: () => setOpen(false),
    openHelp: () => {
      Haptics.selectionAsync();
      setNudge(false);
      setOpen(true);
      void noteHelpOpened(topic);
    },
    /* Dismissing is not reading: the showing was already counted, so it may
       come back tomorrow, up to the budget. */
    dismissNudge: () => {
      Haptics.selectionAsync();
      setNudge(false);
    },
  };
}

/**
 * The button.
 *
 * A nested `Pressable` becomes the touch responder itself, so this does not
 * fall through to a card's own press — several of these cards are wrapped in
 * one that navigates, and tapping `?` must not.
 *
 * 28pt of ink with `hitSlop` 14 is a 56pt target.
 */
export function HelpButton({
  label,
  onPress,
  style,
}: {
  label: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={14}
      onPress={onPress}
      style={({ pressed }) => [styles.btn, style, pressed && styles.pressed]}>
      <Icon icon={HelpCircle} size={17} color={colors.mutedForeground} />
    </Pressable>
  );
}

/**
 * The hint that points at it.
 *
 * Tapping anywhere on the chip opens the help — the chip *is* a shortcut to
 * the button it is advertising, and a hint you have to read and then go find
 * the target of is a hint that costs more than it saves.
 */
export function HelpNudge({
  text,
  onPress,
  onDismiss,
}: {
  text: string;
  onPress: () => void;
  onDismiss: () => void;
}) {
  const i18n = useI18n();
  return (
    <Animated.View entering={FadeIn.duration(220)} exiting={FadeOut.duration(140)}>
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [styles.nudge, pressed && styles.pressed]}>
        <Icon icon={HelpCircle} size={14} color={colors.metricBlue} />
        <Text style={styles.nudgeText}>{text}</Text>
        <View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={i18n.a11yClose}
            hitSlop={12}
            onPress={onDismiss}>
            <Icon icon={X} size={14} color={colors.mutedForeground} />
          </Pressable>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  btn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  nudge: {
    /* Cards that centre their children would otherwise shrink-wrap this into a
       narrow column of text instead of letting it span. */
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(59,166,255,0.25)',
    backgroundColor: 'rgba(59,166,255,0.10)',
  },
  nudgeText: { flex: 1, fontSize: 12, lineHeight: 17, color: colors.foreground },
  pressed: { opacity: 0.7, transform: [{ scale: 0.97 }] },
});
