import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { GlassCard } from '@/components/ascnd/glass-card';
import { Screen } from '@/components/ascnd/screen';
import { colors, spacing, type } from '@/constants/ascnd';
import { useI18n } from '@/hooks/use-app-settings';
import { useMealPlanItems, useMealPlans } from '@/hooks/use-library';

export default function MealPlansScreen() {
  const { data: plans } = useMealPlans();
  const i18n = useI18n();
  const [openId, setOpenId] = useState<string | null>(null);
  const { data: items } = useMealPlanItems(openId);

  const dayLabel = (idx: number) => `${i18n.nDay} ${idx + 1}`;

  const groupedItems = (items ?? []).reduce<Record<number, typeof items>>((acc, it) => {
    (acc[it.day_index] ??= []).push(it);
    return acc;
  }, {});

  return (
    <Screen title={i18n.nMealPlans}>
      {plans && plans.length > 0 ? (
        plans.map((p) => (
          <View key={p.id} style={styles.planBlock}>
            <Pressable
              onPress={() => {
                Haptics.selectionAsync();
                setOpenId(openId === p.id ? null : p.id);
              }}>
              <GlassCard>
                <View style={styles.planRow}>
                  <View style={styles.planInfo}>
                    <Text style={styles.title}>{p.name}</Text>
                    <Text style={styles.hint}>
                      {[p.goal, p.meals_per_day ? `${p.meals_per_day} ${i18n.nMealsPerDay}` : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  </View>
                  <Text style={styles.chevron}>{openId === p.id ? '▾' : '▸'}</Text>
                </View>
              </GlassCard>
            </Pressable>

            {openId === p.id &&
              Object.entries(groupedItems).map(([day, dayItems]) => (
                <GlassCard key={day} style={styles.dayCard}>
                  <Text style={styles.dayTitle}>{dayLabel(Number(day))}</Text>
                  {(dayItems ?? []).map((it) => (
                    <View key={it.id} style={styles.itemRow}>
                      <Text style={styles.itemName} numberOfLines={1}>{it.food_name}</Text>
                      <Text style={styles.itemKcal}>{Math.round(Number(it.kcal))} kcal</Text>
                    </View>
                  ))}
                </GlassCard>
              ))}
          </View>
        ))
      ) : (
        <GlassCard>
          <Text style={styles.title}>{i18n.nNoMealPlans}</Text>
          <Text style={styles.hint}>{i18n.nNoMealPlansHint}</Text>
        </GlassCard>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  planBlock: { gap: spacing.sm },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  planInfo: { flex: 1, minWidth: 0 },
  title: { ...type.headline, color: colors.foreground },
  hint: { ...type.footnote, color: colors.mutedForeground, marginTop: 2, textTransform: 'capitalize' },
  chevron: { ...type.headline, color: colors.mutedForeground },
  dayCard: { paddingVertical: spacing.md, marginLeft: spacing.md },
  dayTitle: { ...type.footnote, fontWeight: '600', color: colors.mutedForeground, marginBottom: spacing.sm },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: 4,
  },
  itemName: { ...type.body, color: colors.foreground, flex: 1 },
  itemKcal: { ...type.footnote, color: colors.mutedForeground },
});
