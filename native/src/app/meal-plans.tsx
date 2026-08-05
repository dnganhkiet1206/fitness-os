import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { ChevronRight, UtensilsCrossed } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Icon } from '@/components/ascnd/icon';
import { Screen } from '@/components/ascnd/screen';
import { colors, radius, spacing, type } from '@/constants/ascnd';
import { useI18n } from '@/hooks/use-app-settings';
import { useMealPlans } from '@/hooks/use-library';
import { rise } from '@/lib/entrance';

/**
 * Every meal plan you have, and nothing else.
 *
 * ── what it used to be ──
 *
 * This screen was the whole feature: a list of plans, each expanding into seven
 * day cards, each of those into the meals inside it, with the create form
 * stacked on top. Nested accordions in a scroll view, with hierarchy drawn by
 * indentation — a file tree rather than an iOS screen. Opening one plan pushed
 * the next one a screen and a half away, so where you were in the page depended
 * on what you had expanded.
 *
 * Plans are made on the Nutrition tab now, and a plan is read on `/meal-plan`,
 * one day at a time. What is left here is the one job a list of things should
 * do: name them, say enough to tell them apart, and get out of the way.
 *
 * ── and it is a list, not a stack of cards ──
 *
 * One surface, hairlines between rows, a chevron on each. Three plans as three
 * bordered cards is three times the edges for what a table view says with one.
 */
export default function MealPlansScreen() {
  const i18n = useI18n();
  const { data: plans } = useMealPlans();

  const goalLabel = (g: string | null) =>
    g === 'bulk' ? i18n.goalBulk : g === 'cut' ? i18n.goalCut : g === 'maintain' ? i18n.goalMaintain : null;

  return (
    <Screen back title={i18n.nMealPlans}>
      {plans && plans.length > 0 ? (
        <View style={styles.list}>
          {plans.map((p, i) => (
            <Animated.View key={p.id} entering={rise(i)}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={p.name}
                onPress={() => {
                  Haptics.selectionAsync();
                  router.push({ pathname: '/meal-plan', params: { plan: p.id } });
                }}
                style={({ pressed }) => [styles.row, i > 0 && styles.ruled, pressed && styles.pressed]}>
                <View style={styles.text}>
                  <Text style={styles.name} numberOfLines={1}>{p.name}</Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    {[goalLabel(p.goal), p.meals_per_day ? `${p.meals_per_day} ${i18n.nMealsPerDay}` : null]
                      .filter(Boolean)
                      .join('  ·  ')}
                  </Text>
                </View>
                <Icon icon={ChevronRight} size={16} color={colors.mutedForeground} />
              </Pressable>
            </Animated.View>
          ))}
        </View>
      ) : (
        <View style={styles.empty}>
          <Icon icon={UtensilsCrossed} size={22} color={colors.mutedForeground} />
          <Text style={styles.emptyTitle}>{i18n.nNoMealPlans}</Text>
          <Text style={styles.emptyBody}>{i18n.nMealPlanWhat}</Text>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { borderRadius: radius.lg, backgroundColor: colors.card, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, height: 62 },
  /* Inset from the left, like a table view's separator — a rule that runs the
     full width cuts the group into stripes instead of dividing it. */
  ruled: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    marginLeft: spacing.md,
    paddingLeft: 0,
  },
  text: { flex: 1, minWidth: 0, gap: 2 },
  name: { ...type.body, color: colors.foreground, fontWeight: '600' },
  meta: { ...type.footnote, color: colors.mutedForeground },
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  emptyTitle: { ...type.body, color: colors.foreground, fontWeight: '600' },
  emptyBody: {
    ...type.footnote,
    color: colors.mutedForeground,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
  },
  pressed: { opacity: 0.8 },
});
