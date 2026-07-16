import { StyleSheet, Text, View } from 'react-native';

import { GlassCard } from '@/components/ascnd/glass-card';
import { Screen } from '@/components/ascnd/screen';
import { colors, spacing, type } from '@/constants/ascnd';
import { useDailyLog, useProfile, useTodaySleep } from '@/hooks/useTodayData';

function greeting(name?: string | null): string {
  const h = new Date().getHours();
  const base = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  return name ? `${base}, ${name.split(' ')[0]}` : base;
}

function todayLabel(): string {
  return new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

const READINESS_COLOR: Record<string, string> = {
  green: colors.readinessGreen,
  yellow: colors.readinessYellow,
  red: colors.readinessRed,
};

export default function TodayScreen() {
  const { data: profile } = useProfile();
  const { data: log } = useDailyLog();
  const { data: sleep } = useTodaySleep();

  const readinessScore = log?.readiness_score != null ? Math.round(Number(log.readiness_score)) : null;
  const readinessColor = READINESS_COLOR[log?.readiness_status ?? ''] ?? colors.secondary;

  const kcal = log?.kcal != null ? Math.round(Number(log.kcal)) : null;
  const kcalTarget = profile?.tdee_target_kcal != null ? Math.round(Number(profile.tdee_target_kcal)) : null;
  const steps = log?.steps != null ? Number(log.steps) : null;

  const sleepMin = log?.sleep_duration_min != null ? Number(log.sleep_duration_min) : null;
  const sleepLabel =
    sleepMin != null
      ? `${Math.floor(sleepMin / 60)}h ${String(sleepMin % 60).padStart(2, '0')}m`
      : sleep?.quality != null
        ? `Quality ${sleep.quality}/5`
        : '—';

  return (
    <Screen title={greeting(profile?.name)} eyebrow={todayLabel()}>
      <GlassCard>
        <Text style={styles.cardTitle}>Readiness</Text>
        <Text style={styles.cardHint}>
          {log?.readiness_recommendation ?? 'Log sleep and training to get your score'}
        </Text>
        <View style={[styles.ring, { borderColor: readinessScore != null ? readinessColor : colors.secondary }]}>
          <Text style={[styles.ringValue, readinessScore != null && { color: colors.foreground }]}>
            {readinessScore ?? '—'}
          </Text>
        </View>
      </GlassCard>

      <View style={styles.row}>
        <GlassCard style={styles.half}>
          <Text style={styles.cardTitle}>Activity</Text>
          <Text style={styles.metric}>{steps != null ? steps.toLocaleString() : '—'}</Text>
          <Text style={styles.cardHint}>steps</Text>
        </GlassCard>
        <GlassCard style={styles.half}>
          <Text style={styles.cardTitle}>Nutrition</Text>
          <Text style={styles.metric}>{kcal != null ? kcal.toLocaleString() : '—'}</Text>
          <Text style={styles.cardHint}>{kcalTarget != null ? `of ${kcalTarget.toLocaleString()} kcal` : 'kcal today'}</Text>
        </GlassCard>
      </View>

      <GlassCard>
        <Text style={styles.cardTitle}>Sleep</Text>
        <Text style={styles.cardHint}>Last night</Text>
        <Text style={styles.metric}>{sleepLabel}</Text>
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
  ring: {
    alignSelf: 'center',
    marginVertical: spacing.lg,
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringValue: {
    fontSize: 40,
    fontWeight: '700',
    color: colors.mutedForeground,
  },
});
