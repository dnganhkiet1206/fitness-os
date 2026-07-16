import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { GlassCard } from '@/components/ascnd/glass-card';
import { ReadinessRing } from '@/components/ascnd/readiness-ring';
import { Screen } from '@/components/ascnd/screen';
import { colors, spacing, type } from '@/constants/ascnd';
import { useHealthSync } from '@/hooks/use-health-sync';
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
  const { available: healthAvailable, sync: healthSync } = useHealthSync();

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
    <Screen
      title={greeting(profile?.name)}
      eyebrow={todayLabel()}
      headerRight={
        <View style={styles.headerButtons}>
          <Pressable
            hitSlop={8}
            style={({ pressed }) => [styles.gear, pressed && styles.pressed]}
            onPress={() => router.push('/ai-coach')}>
            {Platform.OS === 'ios' ? (
              <SymbolView name="sparkles" size={20} tintColor={colors.primary} />
            ) : (
              <Text style={styles.gearFallback}>✦</Text>
            )}
          </Pressable>
          <Pressable
            hitSlop={8}
            style={({ pressed }) => [styles.gear, pressed && styles.pressed]}
            onPress={() => router.push('/settings')}>
            {Platform.OS === 'ios' ? (
              <SymbolView name="gearshape.fill" size={20} tintColor={colors.mutedForeground} />
            ) : (
              <Text style={styles.gearFallback}>⚙︎</Text>
            )}
          </Pressable>
        </View>
      }>
      <GlassCard>
        <Text style={styles.cardTitle}>Readiness</Text>
        <Text style={styles.cardHint}>
          {log?.readiness_recommendation ?? 'Log sleep and training to get your score'}
        </Text>
        <View style={styles.ringWrap}>
          <ReadinessRing score={readinessScore} color={readinessColor} />
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

      {healthAvailable && (
        <Pressable
          style={({ pressed }) => [styles.syncButton, pressed && styles.pressed]}
          disabled={healthSync.isPending}
          onPress={() => healthSync.mutate()}>
          {healthSync.isPending ? (
            <ActivityIndicator color={colors.foreground} size="small" />
          ) : (
            <Text style={styles.syncText}>♥ Sync Apple Health</Text>
          )}
        </Pressable>
      )}

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
  ringWrap: {
    marginVertical: spacing.lg,
  },
  headerButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  gear: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  gearFallback: {
    fontSize: 16,
    color: colors.mutedForeground,
  },
  syncButton: {
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncText: {
    ...type.footnote,
    fontWeight: '600',
    color: colors.foreground,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
});
