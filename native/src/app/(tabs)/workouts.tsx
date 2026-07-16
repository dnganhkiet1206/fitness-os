import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { GlassCard } from '@/components/ascnd/glass-card';
import { Screen } from '@/components/ascnd/screen';
import { colors, radius, spacing, type } from '@/constants/ascnd';
import { useWorkoutSessions } from '@/hooks/use-fitness-data';

export default function WorkoutsScreen() {
  const { data: sessions } = useWorkoutSessions(14);

  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7)); // Monday
  weekStart.setHours(0, 0, 0, 0);

  const thisWeek = (sessions ?? []).filter((s) => new Date(s.date_time) >= weekStart);
  const weekVolume = thisWeek.reduce((sum, s) => sum + Number(s.volume_load || 0), 0);

  return (
    <Screen title="Workouts">
      <View style={styles.row}>
        <GlassCard style={styles.half}>
          <Text style={styles.cardTitle}>This week</Text>
          <Text style={styles.metric}>{thisWeek.length}</Text>
          <Text style={styles.cardHint}>sessions</Text>
        </GlassCard>
        <GlassCard style={styles.half}>
          <Text style={styles.cardTitle}>Volume</Text>
          <Text style={styles.metric}>{weekVolume > 0 ? weekVolume.toLocaleString() : '—'}</Text>
          <Text style={styles.cardHint}>kg lifted</Text>
        </GlassCard>
      </View>

      <Pressable
        style={({ pressed }) => [styles.logButton, pressed && styles.pressed]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push('/log-workout');
        }}>
        <Text style={styles.logButtonText}>＋ Log Workout</Text>
      </Pressable>

      {sessions && sessions.length > 0 ? (
        sessions.map((s) => (
          <GlassCard key={s.id} style={styles.sessionCard}>
            <View style={styles.sessionRow}>
              <View style={styles.sessionInfo}>
                <Text style={styles.cardTitle}>{s.template_name ?? 'Workout'}</Text>
                <Text style={styles.cardHint}>
                  {new Date(s.date_time).toLocaleDateString(undefined, {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })}
                </Text>
              </View>
              <View style={styles.sessionStats}>
                {s.volume_load != null && Number(s.volume_load) > 0 && (
                  <Text style={styles.sessionStat}>{Number(s.volume_load).toLocaleString()} kg</Text>
                )}
                {s.session_rpe != null && (
                  <Text style={styles.cardHint}>RPE {Number(s.session_rpe)}</Text>
                )}
              </View>
            </View>
          </GlassCard>
        ))
      ) : (
        <GlassCard>
          <Text style={styles.cardTitle}>No workouts yet</Text>
          <Text style={styles.cardHint}>Log your first session — readiness adapts to your training load</Text>
        </GlassCard>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md },
  half: { flex: 1 },
  cardTitle: { ...type.headline, color: colors.foreground },
  cardHint: { ...type.footnote, color: colors.mutedForeground, marginTop: 2 },
  metric: { ...type.largeTitle, color: colors.foreground, marginTop: spacing.sm },
  logButton: {
    height: 50,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logButtonText: { ...type.headline, color: colors.primaryForeground },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  sessionCard: { paddingVertical: spacing.md },
  sessionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sessionInfo: { flex: 1, minWidth: 0 },
  sessionStats: { alignItems: 'flex-end' },
  sessionStat: { ...type.headline, color: colors.foreground },
});
