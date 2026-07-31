import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { Plus, UtensilsCrossed } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { colors, radius, spacing, type } from '@/constants/ascnd';
import type { useI18n } from '@/hooks/use-app-settings';
import type { LoggedMeal } from '@/hooks/use-nutrition';

/**
 * What was eaten today, meal by meal.
 *
 * The Nutrition tab used to open on a food *library* — search, my foods,
 * favourites, recents — which is a useful thing that answers a question nobody
 * arrives with. Coming from the dashboard's calorie ring you want to know what
 * you have eaten, and the page could not tell you. This is that answer, and it
 * is the first thing on the tab now.
 *
 * ── grouped by meal, not flattened into foods ──
 *
 * A flat list of every item eaten would be shorter to build and worse to read:
 * three eggs, a coffee and a slice of bread are *breakfast*, and losing that
 * loses the shape of the day. Each entry keeps its own totals on the right, so
 * "what did lunch cost me" is answerable without adding anything up.
 */

/** the six `meal_type` values `log-meal.tsx` writes, in the order a day runs */
const ORDER = ['breakfast', 'lunch', 'dinner', 'snack', 'preworkout', 'postworkout'];

export function TodayMeals({
  meals,
  i18n,
  lang,
}: {
  meals: LoggedMeal[];
  i18n: ReturnType<typeof useI18n>;
  lang: 'vi' | 'en';
}) {
  const label: Record<string, string> = {
    breakfast: i18n.nBreakfast,
    lunch: i18n.nLunch,
    dinner: i18n.nDinner,
    snack: i18n.nSnack,
    preworkout: i18n.nPreWorkout,
    postworkout: i18n.nPostWorkout,
  };

  const sorted = [...meals].sort(
    (a, b) => ORDER.indexOf(a.meal_type) - ORDER.indexOf(b.meal_type),
  );

  if (sorted.length === 0) {
    return (
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push('/log-meal');
        }}>
        {({ pressed }) => (
          <GlassCard style={[styles.empty, pressed && styles.pressed]}>
            <Icon icon={UtensilsCrossed} size={20} color={colors.mutedForeground} />
            <Text style={styles.emptyText}>
              {lang === 'vi'
                ? 'Chưa ghi bữa nào hôm nay — nhấn để ghi'
                : 'Nothing logged today — tap to log a meal'}
            </Text>
          </GlassCard>
        )}
      </Pressable>
    );
  }

  return (
    <View style={styles.list}>
      {sorted.map((m) => (
        <GlassCard key={m.id} style={styles.meal}>
          <View style={styles.mealHead}>
            <Text style={styles.mealName}>{label[m.meal_type] ?? m.meal_type}</Text>
            <Text style={styles.mealKcal}>
              {m.kcal.toLocaleString()} <Text style={styles.unit}>kcal</Text>
            </Text>
          </View>
          <Text style={styles.mealMacros}>
            P{m.protein_g} · C{m.carbs_g} · F{m.fat_g}
          </Text>

          {m.items.map((it) => (
            <View key={it.id} style={styles.item}>
              <View style={styles.itemInfo}>
                <Text style={styles.itemName} numberOfLines={1}>
                  {it.food_name}
                  {/* Only when it is not one portion. "×1" on every line is
                      noise that makes the one line that says ×2 harder to see. */}
                  {it.servings !== 1 ? <Text style={styles.serving}>  ×{it.servings}</Text> : null}
                </Text>
                <Text style={styles.itemMacros}>
                  P{it.protein_g} · C{it.carbs_g} · F{it.fat_g}
                </Text>
              </View>
              <Text style={styles.itemKcal}>{it.kcal}</Text>
            </View>
          ))}
        </GlassCard>
      ))}

      <Pressable
        style={({ pressed }) => [styles.add, pressed && styles.pressed]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push('/log-meal');
        }}>
        <Icon icon={Plus} size={14} color={colors.primaryForeground} strokeWidth={2.5} />
        <Text style={styles.addText}>{i18n.nLogMealBtn}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  meal: { gap: 2, paddingVertical: spacing.md },
  mealHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  mealName: { ...type.headline, color: colors.foreground },
  mealKcal: { ...type.headline, color: colors.foreground, fontVariant: ['tabular-nums'] },
  unit: { ...type.caption, color: colors.mutedForeground },
  mealMacros: { ...type.caption, color: colors.mutedForeground, marginBottom: spacing.xs },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  itemInfo: { flex: 1 },
  itemName: { ...type.footnote, color: colors.foreground },
  serving: { ...type.caption, color: colors.mutedForeground },
  itemMacros: { ...type.caption, color: colors.mutedForeground },
  itemKcal: { ...type.footnote, color: colors.mutedForeground, fontVariant: ['tabular-nums'] },
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg },
  emptyText: { ...type.footnote, color: colors.mutedForeground, textAlign: 'center' },
  add: {
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  addText: { ...type.headline, color: colors.primaryForeground },
  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
});
