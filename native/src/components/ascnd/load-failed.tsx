import * as Haptics from 'expo-haptics';
import { CloudOff, RotateCw } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { colors, radius, spacing, type } from '@/constants/ascnd';
import type { useI18n } from '@/hooks/use-app-settings';

/**
 * "We could not read this" — as distinct from "there is nothing here".
 *
 * ── the bug this exists for ──
 *
 * Not one of the app's forty queries had a consumer that read `isError`. A
 * failed read left `data` undefined, every screen fell through to its zero
 * case, and the result was a page saying `0 kcal`, `Nothing logged today`,
 * `Not enough data yet` — indistinguishable from a real empty day. The one
 * thing a person does on seeing that is log the meal they already logged.
 *
 * The persisted cache and the offline banner cover most of this: a returning
 * user sees their last-seen data, and a user with no signal sees the banner. It
 * is the case in between that lied — online, server unhappy, nothing cached
 * yet. That is a first install, or a fresh sign-in, or a table the account has
 * never successfully read.
 *
 * ── why a card and not a toast ──
 *
 * A toast is for something that happened; this is a description of what is on
 * the screen right now. Put in the place the data would have been, it answers
 * the question the blank space raises, and it goes away by itself when the read
 * succeeds. A toast would announce the failure once and leave the zeros sitting
 * there afterwards, which is the original bug with an apology attached.
 *
 * ── on the retry ──
 *
 * `onRetry` is the screen's own refresh, not a per-query refetch. Screens here
 * read six to eighteen queries and one failure usually means several; refetching
 * only the one that reported would fix a corner of the page. It is also the
 * gesture the user already has (pull to refresh) exposed as a button, which is
 * one behaviour to learn instead of two.
 */
export function LoadFailed({
  i18n,
  onRetry,
  busy = false,
}: {
  i18n: ReturnType<typeof useI18n>;
  onRetry?: () => void;
  /** the screen's refresh is already running — the button says so and waits */
  busy?: boolean;
}) {
  return (
    <GlassCard style={styles.card}>
      <View style={styles.icon}>
        <Icon icon={CloudOff} size={20} color={colors.mutedForeground} />
      </View>
      <Text style={styles.title}>{i18n.nLoadFailed}</Text>
      <Text style={styles.hint}>{i18n.nLoadFailedHint}</Text>
      {onRetry ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={i18n.nRetry}
          disabled={busy}
          onPress={() => {
            Haptics.selectionAsync();
            onRetry();
          }}
          style={({ pressed }) => [styles.retry, (pressed || busy) && styles.retryPressed]}>
          <Icon icon={RotateCw} size={15} color={colors.foreground} />
          <Text style={styles.retryText}>{i18n.nRetry}</Text>
        </Pressable>
      ) : null}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.lg },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginBottom: spacing.xs,
  },
  title: { ...type.headline, color: colors.foreground, textAlign: 'center' },
  hint: { ...type.footnote, color: colors.mutedForeground, textAlign: 'center' },
  retry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    height: 44,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.07)',
    marginTop: spacing.sm,
  },
  retryPressed: { opacity: 0.75 },
  retryText: { ...type.footnote, fontWeight: '600', color: colors.foreground },
});
