import { StyleSheet, Text, View } from 'react-native';

import { GlassCard } from '@/components/ascnd/glass-card';
import { Screen } from '@/components/ascnd/screen';
import { colors, spacing, type } from '@/constants/ascnd';
import { useI18n } from '@/hooks/use-app-settings';
import { useWeeklyChallenges } from '@/hooks/use-extras';

export default function ChallengesScreen() {
  const { data: challenges } = useWeeklyChallenges();
  const i18n = useI18n();

  return (
    <Screen title={i18n.nChallenges}>
      {challenges && challenges.length > 0 ? (
        challenges.map((c) => {
          const target = Number(c.target_value) || 1;
          const current = Math.min(Number(c.current_value) || 0, target);
          const pct = Math.round((current / target) * 100);
          return (
            <GlassCard key={c.id}>
              <View style={styles.headerRow}>
                <Text style={styles.icon}>{c.icon ?? '🎯'}</Text>
                <View style={styles.info}>
                  <Text style={styles.title}>{c.title}</Text>
                  {c.description ? <Text style={styles.hint}>{c.description}</Text> : null}
                </View>
                {c.completed && <Text style={styles.done}>✓</Text>}
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
  icon: { fontSize: 28 },
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
