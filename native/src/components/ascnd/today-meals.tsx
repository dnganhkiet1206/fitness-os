import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { ChevronDown, ChevronUp, UtensilsCrossed } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { colors, spacing, type } from '@/constants/ascnd';
import type { useI18n } from '@/hooks/use-app-settings';
import type { LoggedItem, LoggedMeal } from '@/hooks/use-nutrition';

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
 *
 * ── one card per meal, and closed until asked ──
 *
 * Every item was listed under its meal, always. Eight foods across the day is
 * an ordinary Tuesday and it turned the diary into a page of scrolling before
 * you could reach anything else on the tab. So a meal is now a **summary line**
 * — name, what it cost, how many items are inside — and the items appear when
 * you tap it. The day's shape stays readable at a glance, and the detail is one
 * tap away rather than always in the way.
 *
 * Meals of the same type are also **merged**: logging breakfast twice used to
 * draw two "Breakfast" cards that each told half the story. One card now, with
 * the totals added up and the entry count beside the item count, so `1,632
 * kcal · 2 meals · 8 items` is the whole of breakfast in one line.
 */

/** the six `meal_type` values `log-meal.tsx` writes, in the order a day runs */
const ORDER = ['breakfast', 'lunch', 'dinner', 'snack', 'preworkout', 'postworkout'];

/** one meal type's whole day: totals, every item, and how many entries made it */
interface MealGroup {
  type: string;
  entries: number;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  items: LoggedItem[];
}

/**
 * Merge the day's logged meals by type, in the order a day runs.
 *
 * Rounding happens once, on the sum, rather than per entry — adding rounded
 * halves is how a card ends up disagreeing with the ring above it.
 */
function groupByType(meals: LoggedMeal[]): MealGroup[] {
  const by = new Map<string, MealGroup>();
  for (const m of meals) {
    const g = by.get(m.meal_type) ?? {
      type: m.meal_type,
      entries: 0,
      kcal: 0,
      protein_g: 0,
      carbs_g: 0,
      fat_g: 0,
      items: [],
    };
    g.entries += 1;
    g.kcal += m.kcal;
    g.protein_g += m.protein_g;
    g.carbs_g += m.carbs_g;
    g.fat_g += m.fat_g;
    g.items.push(...m.items);
    by.set(m.meal_type, g);
  }
  return [...by.values()]
    .map((g) => ({
      ...g,
      kcal: Math.round(g.kcal),
      protein_g: Math.round(g.protein_g),
      carbs_g: Math.round(g.carbs_g),
      fat_g: Math.round(g.fat_g),
    }))
    .sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type));
}

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

  const groups = groupByType(meals);

  if (groups.length === 0) {
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
      {/* No "log a meal" button down here any more — it was a full-width bar
          at the end of the longest list on the tab, and it offered only the
          manual form. The floating ⊕ (`LogMealFab`) costs no height and opens
          all four ways in. */}
      {groups.map((g) => (
        <MealCard key={g.type} g={g} label={label[g.type] ?? g.type} i18n={i18n} />
      ))}
    </View>
  );
}

/**
 * One meal, closed by default.
 *
 * The header alone answers "what did breakfast cost me"; the items are behind
 * the chevron. Open state is local to the card, so opening lunch does not close
 * breakfast, and nothing above it re-renders when you tap.
 */
function MealCard({
  g,
  label,
  i18n,
}: {
  g: MealGroup;
  label: string;
  i18n: ReturnType<typeof useI18n>;
}) {
  const [open, setOpen] = useState(false);
  const count = g.items.length;
  const countText =
    count === 1 ? i18n.nDiaryItemsOne : i18n.nDiaryItems.replace('{n}', String(count));
  // only worth saying when breakfast was logged more than once
  const entriesText =
    g.entries > 1 ? `${i18n.nDiaryEntries.replace('{n}', String(g.entries))} · ` : '';

  return (
    <GlassCard style={styles.meal}>
      <Pressable
        onPress={() => {
          Haptics.selectionAsync();
          setOpen((v) => !v);
        }}
        style={({ pressed }) => [styles.mealHead, pressed && styles.pressed]}>
        <View style={styles.mealHeadText}>
          <Text style={styles.mealName}>{label}</Text>
          <Text style={styles.mealSub}>
            {entriesText}
            {countText} · P{g.protein_g} · C{g.carbs_g} · F{g.fat_g}
          </Text>
        </View>
        <Text style={styles.mealKcal}>
          {g.kcal.toLocaleString()} <Text style={styles.unit}>kcal</Text>
        </Text>
        <Icon icon={open ? ChevronUp : ChevronDown} size={18} color={colors.mutedForeground} />
      </Pressable>

      {open
        ? g.items.map((it) => (
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
          ))
        : null}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  meal: { gap: 2, paddingVertical: spacing.md },
  mealHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  mealHeadText: { flex: 1, minWidth: 0, gap: 2 },
  mealName: { ...type.headline, color: colors.foreground },
  mealSub: { ...type.caption, color: colors.mutedForeground },
  mealKcal: { ...type.headline, color: colors.foreground, fontVariant: ['tabular-nums'] },
  unit: { ...type.caption, color: colors.mutedForeground },
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
  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
});
