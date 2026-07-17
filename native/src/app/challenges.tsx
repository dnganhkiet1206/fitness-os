import { Check, Target } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { Screen } from '@/components/ascnd/screen';
import { colors, spacing, type } from '@/constants/ascnd';
import { useI18n } from '@/hooks/use-app-settings';
import {
  useInitWeeklyChallenges,
  useUpdateChallengeProgress,
  useWeeklyChallenges,
} from '@/hooks/use-extras';

export default function ChallengesScreen() {
  const { data: challenges } = useWeeklyChallenges();
  const initChallenges = useInitWeeklyChallenges();
  const updateProgress = useUpdateChallengeProgress();
  const initializedRef = useRef(false);
  const i18n = useI18n();

  // Web flow: seed this week's challenges if empty, then refresh progress
  useEffect(() => {
    if (initializedRef.current || challenges === undefined) return;
    initializedRef.current = true;
    if (challenges.length === 0) {
      initChallenges.mutate(undefined, { onSuccess: () => updateProgress.mutate() });
    } else {
      updateProgress.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [challenges]);

  return (
    <Screen back title={i18n.nChallenges}>
      {challenges && challenges.length > 0 ? (
        challenges.map((c) => {
          const target = Number(c.target_value) || 1;
          const current = Math.min(Number(c.current_value) || 0, target);
          const pct = Math.round((current / target) * 100);
          return (
            <GlassCard key={c.id}>
              <View style={styles.headerRow}>
                <View style={styles.iconWrap}>
                  <Icon icon={Target} size={20} color={colors.primary} />
                </View>
                <View style={styles.info}>
                  <Text style={styles.title}>{c.title}</Text>
                  {c.description ? <Text style={styles.hint}>{c.description}</Text> : null}
                </View>
                {c.completed && <Icon icon={Check} size={18} color={colors.readinessGreen} strokeWidth={3} />}
              </View>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${pct}%` },
                    c.completed && { backgroundColor: colors.readinessGreen },
                  ]}
                />
              </View>
              <Text style={styles.progressLabel}>
                {c.completed ? i18n.nCompleted : `${current} / ${target}`}
              </Text>
            </GlassCard>
          );
        })
      ) : (
        <GlassCard>
          <Text style={styles.title}>{i18n.nNoChallenges}</Text>
          <Text style={styles.hint}>{i18n.nNoChallengesHint}</Text>
        </GlassCard>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  iconWrap: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.secondary, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, minWidth: 0, gap: 2 },
  title: { ...type.headline, color: colors.foreground },
  hint: { ...type.footnote, color: colors.mutedForeground },
  done: { fontSize: 20, color: colors.readinessGreen, fontWeight: '700' },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.secondary,
    overflow: 'hidden',
    marginTop: spacing.md,
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  progressLabel: {
    ...type.caption,
    color: colors.mutedForeground,
    marginTop: spacing.sm,
    textAlign: 'right',
  },
});
