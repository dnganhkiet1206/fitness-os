import * as Haptics from 'expo-haptics';
import type { LucideIcon } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ascnd/icon';
import { PressScale } from '@/components/ascnd/press-scale';
import { colors, radius, spacing, type } from '@/constants/ascnd';

/**
 * The screen somebody sees before they have used it.
 *
 * ── why this is one component now ──
 *
 * Twenty-six screens drew an empty state and no two drew it the same way.
 * There were ten naming schemes for the same element — `empty`, `emptyText`,
 * `emptyTitle`, `emptyMsg`, `emptyHint`, `emptyBody`, `emptyLine`, `emptyCard`,
 * `emptyCta`, `emptyBtn` — which is what happens when a thing is rebuilt each
 * time instead of being made once. A user meets several of these in their first
 * five minutes, and they were not recognisably the same app.
 *
 * ── and why most of them needed a button ──
 *
 * Five of the twenty-six offered a way out. The rest said the shelf was empty
 * and stopped: Sleep Insights told a new user there was no sleep data and left
 * them to find the log sheet on another tab.
 *
 * That is the whole difference between an empty state and a dead end. Every
 * app worth copying treats this the same way — an icon, one line saying what
 * goes here, and the button that puts the first one in. It is the least visited
 * screen state in a mature account and the most visited one in a new account,
 * which is exactly backwards from how much attention it usually gets.
 *
 * ── the action is optional, and the omission is meaningful ──
 *
 * Some of these genuinely have no button. What the coach remembers is learned
 * from conversation, not typed in; a chart saying it needs four readings to
 * draw a trend is asking for time, not a tap. Inventing a destination for those
 * would be worse than the dead end, because a button that does not lead to the
 * thing it promises is a lie rather than an absence. So `action` is optional
 * and left out on purpose in those places.
 */
export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon: LucideIcon;
  /** One line. What goes here, not an apology for it being missing. */
  title: string;
  /** Optional second line — why it is empty, or what to do about it. */
  hint?: string;
  /** Omit when there is genuinely nothing to press. */
  action?: { label: string; onPress: () => void };
}) {
  return (
    <View style={styles.root}>
      {/* A tinted chip rather than a bare glyph: a lone outline icon on a dark
          card reads as a broken image. */}
      <View style={styles.chip}>
        <Icon icon={icon} size={20} color={colors.mutedForeground} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      {action ? (
        <PressScale
          style={styles.button}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          onPress={() => {
            Haptics.selectionAsync();
            action.onPress();
          }}>
          <Text style={styles.buttonText}>{action.label}</Text>
        </PressScale>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  chip: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  title: { ...type.headline, color: colors.foreground, textAlign: 'center' },
  hint: { ...type.footnote, color: colors.mutedForeground, textAlign: 'center', lineHeight: 18 },
  button: {
    marginTop: spacing.xs,
    height: 40,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { ...type.footnote, fontWeight: '600', color: colors.primaryForeground },
});
