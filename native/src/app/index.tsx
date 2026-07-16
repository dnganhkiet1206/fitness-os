import { StyleSheet, Text, View } from 'react-native';

import { GlassCard } from '@/components/ascnd/glass-card';
import { Screen } from '@/components/ascnd/screen';
import { colors, spacing, type } from '@/constants/ascnd';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function todayLabel(): string {
  return new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Today dashboard — native port in progress. Cards below are structural
 * placeholders wired next (readiness engine + Supabase hooks are already
 * ported in src/lib).
 */
export default function TodayScreen() {
  return (
    <Screen title={greeting()} eyebrow={todayLabel()}>
      <GlassCard>
        <Text style={styles.cardTitle}>Readiness</Text>
        <Text style={styles.cardHint}>Sleep, HRV and training load — ported from readiness-engine</Text>
        <View style={styles.ringPlaceholder}>
          <Text style={styles.ringValue}>—</Text>
        </View>
      </GlassCard>

      <View style={styles.row}>
        <GlassCard style={styles.half}>
          <Text style={styles.cardTitle}>Activity</Text>
          <Text style={styles.metric}>—</Text>
          <Text style={styles.cardHint}>steps</Text>
        </GlassCard>
        <GlassCard style={styles.half}>
          <Text style={styles.cardTitle}>Nutrition</Text>
          <Text style={styles.metric}>—</Text>
          <Text style={styles.cardHint}>kcal today</Text>
        </GlassCard>
      </View>

      <GlassCard>
        <Text style={styles.cardTitle}>Sleep</Text>
        <Text style={styles.cardHint}>Last night</Text>
        <Text style={styles.metric}>—</Text>
      </GlassCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  half: {
    flex: 1,
  },
  cardTitle: {
    ...type.headline,
    color: colors.foreground,
  },
  cardHint: {
    ...type.footnote,
    color: colors.mutedForeground,
    marginTop: 2,
  },
  metric: {
    ...type.largeTitle,
    color: colors.foreground,
    marginTop: spacing.sm,
  },
  ringPlaceholder: {
    alignSelf: 'center',
    marginVertical: spacing.lg,
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 6,
    borderColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringValue: {
    ...type.title,
    color: colors.mutedForeground,
  },
});
