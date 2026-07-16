import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { GlassCard } from '@/components/ascnd/glass-card';
import { Screen } from '@/components/ascnd/screen';
import { colors, radius, spacing, type } from '@/constants/ascnd';
import { useDailyLog, useProfile, useTodayMeals } from '@/hooks/useTodayData';

const MEAL_LABEL: Record<string, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

export default function NutritionScreen() {
  const { data: meals } = useTodayMeals();
  const { data: log } = useDailyLog();
  const { data: profile } = useProfile();

  const kcal = log?.kcal != null ? Math.round(Number(log.kcal)) : 0;
  const target = profile?.tdee_target_kcal != null ? Math.round(Number(profile.tdee_target_kcal)) : null;

  return (
    <Screen title="Nutrition">
      <GlassCard>
        <Text style={styles.cardTitle}>Today</Text>
        <Text style={styles.bigMetric}>
          {kcal.toLocaleString()}
          {target != null && <Text style={styles.metricUnit}> / {target.toLocaleString()} kcal</Text>}
        </Text>
        <View style={styles.macroRow}>
          <Macro label="Protein" value={log?.protein_g} color={colors.metricBlue} />
          <Macro label="Carbs" value={log?.carbs_g} color={colors.metricOrange} />
          <Macro label="Fat" value={log?.fat_g} color={colors.metricPurple} />
        </View>
      </GlassCard>

      <Pressable
        style={({ pressed }) => [styles.logButton, pressed && styles.pressed]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push('/log-meal');
        }}>
        <Text style={styles.logButtonText}>＋ Log Meal</Text>
      </Pressable>

      {meals && meals.length > 0 ? (
        meals.map((m) => (
          <GlassCard key={m.id} style={styles.mealCard}>
            <View style={styles.mealRow}>
              <View>
                <Text style={styles.cardTitle}>{MEAL_LABEL[m.meal_type] ?? m.meal_type}</Text>
                <Text style={styles.cardHint}>
                  {new Date(m.date_time).toLocaleTimeString(undefined, {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
              </View>
              <Text style={styles.mealKcal}>{Math.round(Number(m.total_kcal))} kcal</Text>
            </View>
          </GlassCard>
        ))
      ) : (
        <GlassCard>
          <Text style={styles.cardTitle}>No meals yet</Text>
          <Text style={styles.cardHint}>Log your first meal of the day above</Text>
        </GlassCard>
      )}
    </Screen>
  );
}

function Macro({ label, value, color }: { label: string; value: unknown; color: string }) {
  return (
    <View style={styles.macro}>
      <View style={[styles.macroDot, { backgroundColor: color }]} />
      <Text style={styles.macroValue}>{value != null ? `${Math.round(Number(value))}g` : '—'}</Text>
      <Text style={styles.cardHint}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  cardTitle: { ...type.headline, color: colors.foreground },
  cardHint: { ...type.footnote, color: colors.mutedForeground, marginTop: 2 },
  bigMetric: { ...type.largeTitle, color: colors.foreground, marginTop: spacing.sm },
  metricUnit: { ...type.footnote, color: colors.mutedForeground },
  macroRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  macro: { alignItems: 'center', gap: 2, flex: 1 },
  macroDot: { width: 8, height: 8, borderRadius: 4 },
  macroValue: { ...type.headline, color: colors.foreground },
  logButton: {
    height: 50,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logButtonText: { ...type.headline, color: colors.primaryForeground },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  mealCard: { paddingVertical: spacing.md },
  mealRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  mealKcal: { ...type.headline, color: colors.foreground },
});
