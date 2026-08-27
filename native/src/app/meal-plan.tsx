import * as Haptics from 'expo-haptics';
import { useLocalSearchParams } from 'expo-router';
import { nav } from '@/lib/nav';
import { Check, Plus, Trash2, UtensilsCrossed, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { PressScale } from '@/components/ascnd/press-scale';
import { Icon } from '@/components/ascnd/icon';
import { MealPlanWizard } from '@/components/ascnd/meal-plan-wizard';
import { LoadFailed } from '@/components/ascnd/load-failed';
import { Screen } from '@/components/ascnd/screen';
import { colors, glass, radius, spacing, type } from '@/constants/ascnd';
import { useI18n } from '@/hooks/use-app-settings';
import {
  useDeleteMealPlan,
  useDeleteMealPlanItem,
  useMealPlanItems,
  useMealPlans,
} from '@/hooks/use-library';
import { useLogPlannedMeal, useTodayLog } from '@/hooks/use-nutrition';
import { useProfile } from '@/hooks/useTodayData';
import { calorieTargetFor } from '@/lib/macro-targets';
import { MEAL_ORDER, PLAN_DAYS, plannedMealIsLoggedToday } from '@/lib/planned-meal';
import { toast } from '@/lib/toast';
import { errorText } from '@/lib/error-copy';

/**
 * One meal plan, one day at a time.
 *
 * ── what this replaces ──
 *
 * The plans screen was an accordion inside an accordion: a list of plans, each
 * opening into seven day cards, each opening the meals inside it. Everything
 * worked and nothing was findable. Three problems, all structural:
 *
 * **The page had no length.** Open a plan and the screen grew by seven cards;
 * the plan below it was now a scroll and a half away. Where you were in the
 * document depended on what you had expanded, which is a thing a document
 * should never ask you to hold in your head.
 *
 * **Hierarchy was drawn with indentation.** Day cards sat at `marginLeft: 16`
 * to say "these belong to the plan above". That is a file tree. On iOS,
 * belonging is said with a grouped section and a header, and the indent is what
 * you use when you have run out of ways to say it.
 *
 * **Seven days were on screen and none of them was the one you wanted.** A week
 * is a thing to *navigate*, not a thing to stack.
 *
 * ── so: a strip, and a day ──
 *
 * The week runs across the top as seven cells, each carrying its day number and
 * a dot if it has food. One is selected; below it is that day, in full, with
 * nothing else competing. It is the same shape as the training week, which is
 * the point — the app now has one way of showing a week of planned things, and
 * it is used twice.
 *
 * ── grouped, not carded ──
 *
 * A day's meals are sections of one inset list rather than a card each. Apple's
 * own settings, health and reminders all read this way: a quiet header, rows on
 * a single surface, hairlines between them, and the value right-aligned. Seven
 * bordered cards in a column is a lot of edges for what is, in the end, a list
 * of food.
 */

export default function MealPlanScreen() {
  const { plan: planId } = useLocalSearchParams<{ plan?: string }>();
  const i18n = useI18n();

  const { data: plans } = useMealPlans();
  const { data: items, isError, refetch, isRefetching } = useMealPlanItems(planId ?? null);
  const { data: profile } = useProfile();
  const { data: todayMeals } = useTodayLog();
  const deleteItem = useDeleteMealPlanItem();
  const deletePlan = useDeleteMealPlan();
  const logMeal = useLogPlannedMeal();

  const [day, setDay] = useState(0);
  const [adding, setAdding] = useState(false);

  const plan = plans?.find((p) => p.id === planId) ?? null;
  const target = calorieTargetFor(profile);

  const mealLabel = (m: string) =>
    ({
      breakfast: i18n.nBreakfast,
      lunch: i18n.nLunch,
      dinner: i18n.nDinner,
      snack: i18n.nSnack,
      preworkout: i18n.nPreWorkout,
      postworkout: i18n.nPostWorkout,
    })[m] ?? m;

  /** day index → its items and their calories */
  const byDay = useMemo(() => {
    const map = new Map<number, { items: NonNullable<typeof items>; kcal: number }>();
    for (const d of PLAN_DAYS) map.set(d, { items: [], kcal: 0 });
    for (const it of items ?? []) {
      const bucket = map.get(it.day_index);
      // A row for a day outside the week is data this screen cannot place; it
      // is counted nowhere rather than silently folded into day 1.
      if (!bucket) continue;
      bucket.items.push(it);
      bucket.kcal += Math.round(Number(it.kcal) || 0);
    }
    return map;
  }, [items]);

  const today = byDay.get(day)!;
  const weekKcal = PLAN_DAYS.reduce((s, d) => s + byDay.get(d)!.kcal, 0);
  const pct = target > 0 ? Math.round((today.kcal / target) * 100) : 0;

  const eatMeal = (meal: string, foods: NonNullable<typeof items>) => {
    if (foods.length === 0 || logMeal.isPending) return;
    const write = () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      logMeal.mutate(
        { mealType: meal, foods },
        {
          onSuccess: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            toast.success(i18n.nMpEatDone.replace('{m}', mealLabel(meal)));
          },
          onError: (e: Error) => toast.fail(e),
        },
      );
    };
    /*
      Asked, not refused — see `lib/planned-meal`. The accidental second tap and
      the genuine second helping look identical from here, and only one of them
      is a mistake.
    */
    if (plannedMealIsLoggedToday(foods, meal, todayMeals ?? [])) {
      Alert.alert(i18n.nMpAgainTitle, i18n.nMpAgainBody.replace('{m}', mealLabel(meal).toLowerCase()), [
        { text: i18n.cancel, style: 'cancel' },
        { text: i18n.nMpAgainYes, onPress: write },
      ]);
      return;
    }
    write();
  };

  const removePlan = () => {
    if (!plan) return;
    Alert.alert('ASCND', `${i18n.delete} "${plan.name}"?`, [
      { text: i18n.cancel, style: 'cancel' },
      {
        text: i18n.delete,
        style: 'destructive',
        onPress: () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          deletePlan.mutate(plan.id, {
            onSuccess: () => nav.back(),
            onError: (e: Error) => Alert.alert('ASCND', errorText(e, i18n)),
          });
        },
      },
    ]);
  };

  const meals = MEAL_ORDER.filter((m) => today.items.some((it) => it.meal_type === m));

  return (
    <Screen refreshable
      back
      title={plan?.name ?? i18n.nMealPlans}
      headerRight={
        plan ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={i18n.a11yDelete}
            hitSlop={12}
            onPress={removePlan}>
            <Icon icon={Trash2} size={17} color={colors.mutedForeground} />
          </Pressable>
        ) : undefined
      }>
      {/*
        A failed read makes every one of the seven days claim to be empty.

        `items` is the whole plan; undefined turns `byDay` into seven empty
        buckets, the strip loses all its dots, and the day panel says nothing is
        planned. Somebody who spent an evening writing a week reads that as the
        plan having been wiped. Answered once, at the top, rather than seven
        times inside the day panel.
      */}
      {isError ? <LoadFailed i18n={i18n} onRetry={() => void refetch()} busy={isRefetching} /> : null}

      {/*
        The week, as seven cells you can tap.

        The dot is the only thing that distinguishes a written day from an empty
        one, and that is enough: it turns the strip into a map of how far the
        plan has got, readable without opening anything.
      */}
      <View style={styles.strip}>
        {PLAN_DAYS.map((d) => {
          const on = d === day;
          const has = byDay.get(d)!.items.length > 0;
          return (
            <Pressable
              key={d}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${i18n.nDay} ${d + 1}`}
              onPress={() => {
                Haptics.selectionAsync();
                setDay(d);
              }}
              style={styles.cell}>
              <View style={[styles.pill, on && styles.pillOn]}>
                <Text style={[styles.pillNum, on && styles.pillNumOn]}>{d + 1}</Text>
              </View>
              <View style={[styles.dot, has && styles.dotOn]} />
            </Pressable>
          );
        })}
      </View>

      {/*
        The day's number, said once and large.

        It was a line inside every day card — "Ngày 1 · 1.850 kcal" seven times
        down the page. With one day on screen there is one of it, so it can be
        the heading it always was, with the share of the target underneath in
        the place a subtitle goes.
      */}
      <View style={styles.summary}>
        {/*
          The day, in words.

          The strip says which one by filling a pill, and that is the *only*
          place the page said it — so the heading was a calorie count and you
          had to look back up and count cells to know what it was counting.
          An eyebrow over the number is the pattern this app already uses on
          every other screen, and it costs one line.
        */}
        <Text style={styles.eyebrow}>{`${i18n.nDay} ${day + 1}`}</Text>
        <Text style={styles.dayKcal}>
          {today.kcal.toLocaleString()} <Text style={styles.dayKcalUnit}>kcal</Text>
        </Text>
        {/* Nothing rather than an empty line: a `Text` with no words in it
            still takes its line height, and a gap you cannot account for reads
            as a layout mistake. */}
        {target > 0 || weekKcal > 0 ? (
          <Text style={styles.daySub}>
            {[
              target > 0 ? i18n.nMpPctTarget.replace('{p}', String(pct)) : null,
              weekKcal > 0 ? i18n.nMpWeekTotal.replace('{x}', weekKcal.toLocaleString()) : null,
            ]
              .filter(Boolean)
              .join('  ·  ')}
          </Text>
        ) : null}
      </View>

      {meals.length === 0 ? (
        <View style={styles.empty}>
          <Icon icon={UtensilsCrossed} size={20} color={colors.mutedForeground} />
          <Text style={styles.emptyText}>{i18n.nMpDayEmptyHint}</Text>
        </View>
      ) : null}

      {meals.map((m) => {
        const foods = today.items.filter((it) => it.meal_type === m);
        const already = plannedMealIsLoggedToday(foods, m, todayMeals ?? []);
        const kcal = foods.reduce((s, it) => s + Math.round(Number(it.kcal) || 0), 0);
        return (
          <Animated.View key={m} entering={FadeIn.duration(180)} style={styles.section}>
            {/*
              A quiet header outside the list, the way iOS groups anything:
              small, uppercase, muted, with the section's own number on the
              right. The action sits here rather than on each row, because
              logging is something you do to a *meal*.
            */}
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>{mealLabel(m)}</Text>
              <Text style={styles.sectionKcal}>{kcal.toLocaleString()} kcal</Text>
              <PressScale
                accessibilityRole="button"
                accessibilityState={{ disabled: logMeal.isPending }}
                disabled={logMeal.isPending}
                hitSlop={10}
                onPress={() => eatMeal(m, foods)}
                style={[styles.eat, already && styles.eatDone]}>
                <Icon
                  icon={already ? Check : UtensilsCrossed}
                  size={11}
                  color={colors.readinessGreen}
                  strokeWidth={2.5}
                />
                <Text style={styles.eatText}>{already ? i18n.nMpEaten : i18n.nMpEatIt}</Text>
              </PressScale>
            </View>

            {/*
              One surface, hairlines between rows — not a bordered card each.

              Seven cards down a column is a lot of edges for what is, in the
              end, a list of food. The separator stops short of the left margin
              the way a table view's does, which is what makes a group read as
              one object rather than as stripes.
            */}
            <View style={styles.list}>
              {foods.map((it, i) => (
                <View key={it.id}>
                  {/* Its own element, not a border on the row. A `marginLeft`
                      on the row to inset the rule moves the *whole row*, which
                      pulled every ✕ after the first one 16pt left of the first
                      — a column of buttons that did not line up, from a style
                      whose only job was a hairline. */}
                  {i > 0 ? <View style={styles.sep} /> : null}
                  <View style={styles.row}>
                    <Text style={styles.rowName} numberOfLines={1}>{it.food_name}</Text>
                    <Text style={styles.rowKcal}>{Math.round(Number(it.kcal))} kcal</Text>
                    <PressScale
                      accessibilityRole="button"
                      accessibilityLabel={`${i18n.a11yRemove} ${it.food_name}`}
                      hitSlop={12}
                      onPress={() =>
                        deleteItem.mutate(
                          { id: it.id, planId: plan?.id ?? '' },
                          { onError: (e: Error) => toast.fail(e) },
                        )
                      }
                      style={styles.rowX}>
                      <Icon icon={X} size={13} color={colors.mutedForeground} />
                    </PressScale>
                  </View>
                </View>
              ))}
            </View>
          </Animated.View>
        );
      })}

      <PressScale
        accessibilityRole="button"
        accessibilityLabel={`${i18n.nMpAddFood} — ${i18n.nDay} ${day + 1}`}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setAdding(true);
        }}
        style={styles.add}>
        <Icon icon={Plus} size={16} color={colors.primary} strokeWidth={2.5} />
        <Text style={styles.addText}>{i18n.nMpAddFood}</Text>
      </PressScale>

      {/* Once, at the end — not under every meal that has food. */}
      {(items ?? []).length > 0 ? <Text style={styles.note}>{i18n.nMpNoFibre}</Text> : null}

      <MealPlanWizard
        visible={adding}
        planId={planId ?? null}
        initialDay={day}
        onClose={() => setAdding(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  // ── the week ──
  strip: { flexDirection: 'row', justifyContent: 'space-between' },
  cell: { flex: 1, alignItems: 'center', gap: 6, paddingVertical: 2 },
  pill: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.secondary,
  },
  pillOn: { backgroundColor: colors.primary },
  pillNum: { ...type.footnote, color: colors.foreground, fontVariant: ['tabular-nums'] },
  pillNumOn: { color: colors.primaryForeground, fontWeight: '700' },
  /* Always drawn, transparent when the day is empty — a dot that comes and goes
     would shift the strip's height by five points as the plan is filled in. */
  dot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: 'transparent' },
  dotOn: { backgroundColor: colors.primary },

  // ── the day, said once ──
  summary: { gap: 2, marginTop: spacing.xs },
  eyebrow: {
    ...type.caption,
    color: colors.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontWeight: '700',
  },
  dayKcal: { ...type.largeTitle, color: colors.foreground, fontVariant: ['tabular-nums'] },
  dayKcalUnit: { ...type.body, color: colors.mutedForeground, fontWeight: '500' },
  daySub: { ...type.footnote, color: colors.mutedForeground, fontVariant: ['tabular-nums'] },

  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  emptyText: { ...type.footnote, color: colors.mutedForeground },

  // ── a meal ──
  section: { gap: 6 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: 2 },
  sectionTitle: {
    ...type.caption,
    color: colors.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontWeight: '700',
  },
  sectionKcal: { ...type.caption, color: colors.mutedForeground, flex: 1, fontVariant: ['tabular-nums'] },
  eat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
    backgroundColor: 'rgba(43,245,168,0.10)',
  },
  eatDone: { backgroundColor: 'rgba(43,245,168,0.18)' },
  eatText: { ...type.caption, color: colors.readinessGreen, fontWeight: '700' },

  /*
    The surface has to be delineated by its border, not by its fill.

    `colors.card` (#0e0e11) against the page (#070708) measures 1.045:1. That is
    not a faint surface, it is no surface: the rows floated on the page and the
    group they were meant to form did not exist. Nothing available fixes it by
    fill alone — `colors.secondary` is 1.137 — which is exactly why every other
    surface in this app is `glass.bg` *plus* a 12%-white hairline. The border is
    what the eye finds; the fill only stops it looking hollow.
  */
  list: {
    borderRadius: radius.md,
    backgroundColor: glass.bg,
    borderWidth: glass.borderWidth,
    borderColor: glass.border,
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, height: 46 },
  /* Inset from the left, the way a table view's separator is — a rule that runs
     the full width cuts the group into stripes instead of dividing it. */
  sep: { height: StyleSheet.hairlineWidth, marginLeft: spacing.md, backgroundColor: colors.border },
  rowName: { ...type.body, color: colors.foreground, flex: 1 },
  rowKcal: { ...type.footnote, color: colors.mutedForeground, fontVariant: ['tabular-nums'] },
  rowX: { width: 28, alignItems: 'flex-end' },

  add: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: glass.bg,
    borderWidth: glass.borderWidth,
    borderColor: glass.border,
  },
  addText: { ...type.body, color: colors.primary, fontWeight: '600' },
  note: { ...type.caption, color: colors.mutedForeground, textAlign: 'center' },
});
