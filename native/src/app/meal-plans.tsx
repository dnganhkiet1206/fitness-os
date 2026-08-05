import * as Haptics from 'expo-haptics';
import { useLocalSearchParams } from 'expo-router';
import { Check, ChevronDown, Plus, Trash2, UtensilsCrossed, X } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { GlassCard } from '@/components/ascnd/glass-card';
import { MealPlanWizard } from '@/components/ascnd/meal-plan-wizard';
import { Icon } from '@/components/ascnd/icon';
import { Screen } from '@/components/ascnd/screen';
import { colors, glass, radius, spacing, type } from '@/constants/ascnd';
import { rise } from '@/lib/entrance';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import {
  useCreateMealPlan,
  useDeleteMealPlan,
  useDeleteMealPlanItem,
  useMealPlanItems,
  useMealPlans,
} from '@/hooks/use-library';
import { useLogPlannedMeal } from '@/hooks/use-nutrition';
import { useProfile } from '@/hooks/useTodayData';
import { calorieTargetFor } from '@/lib/macro-targets';
import { toast } from '@/lib/toast';

/**
 * A week of planned eating.
 *
 * ── what was hard to follow ──
 *
 * The plan's *shape* was invisible. Days were rendered from the items that
 * existed — `Object.entries(groupedItems)` — so a week with food on Wednesday
 * only showed one card, headed "Day 3", and nothing said the plan had seven
 * days or how many of them were still empty. A plan you cannot see the holes in
 * is a plan you cannot fill.
 *
 * Adding was detached from where it landed. One panel at the bottom of the
 * whole plan asked for a day (seven chips), then a meal (four chips), then a
 * food — so putting an egg on Thursday breakfast meant scrolling past every day
 * to a panel that had no idea which day you had been looking at, and hunting a
 * 11pt chip. The day is now the thing you press: every day has its own **Add
 * food**, and it opens a sheet that already knows where the food goes — its
 * title says so.
 *
 * A sheet rather than a panel inside the day, because a list of foods is as
 * long as your library and a card that grows to hold it pushes the rest of the
 * week off the screen while you are choosing. The sheet takes its own space,
 * scrolls its own list, and leaves the week where it was. `Modal` is safe on
 * this screen — it is pushed normally, not presented as a modal, which is what
 * made the workout builder's sheets fail.
 *
 * `meals_per_day` was asked for at creation and then never used again except as
 * a caption. You could choose six meals a day and still only ever file food
 * under four, because the meal chips were a hard-coded list of four. They come
 * from the setting now, drawn from the app's own six `meal_type` values in the
 * order a day runs — the same list and the same order the diary groups by, so
 * a plan and a logged day describe meals the same way.
 *
 * ── what a plan is now for ──
 *
 * Numbers. The screen showed each food's calories and never added them up, so
 * the one question a meal plan exists to answer — does this day come out where
 * I need it — could not be asked. Every day carries its own total, the plan
 * header carries the average per day, and the profile's calorie target sits
 * beside it as the thing to compare against.
 *
 * All of it is derived at render from rows already fetched. No column, no
 * migration, nothing new stored.
 *
 * ── nothing was taken away ──
 *
 * Create a plan (name, goal, meals per day), delete a plan, search the food
 * library, pick from your own foods, add to any day and any meal, remove an
 * item. The seven day-chips are gone as a *control*, not as a capability: the
 * day is chosen by which day's button you press, which is one decision fewer
 * and no destination fewer.
 */

const DAYS = [0, 1, 2, 3, 4, 5, 6];

/**
 * The six `meal_type` values the diary writes, in the order a day runs.
 *
 * The same list `today-meals` groups by. A plan that filed food under names the
 * diary does not know would be a second vocabulary for the same idea, and the
 * first thing to break would be the app's ability to say "you planned this".
 */
const MEAL_ORDER = ['breakfast', 'lunch', 'dinner', 'snack', 'preworkout', 'postworkout'] as const;

export default function MealPlansScreen() {
  /*
    Arriving with a plan already chosen.

    The Nutrition tab's plan section lists the plans now, so a tap there has
    somewhere specific to land — otherwise it dropped you at the top of an
    identical list and asked you to find the one you had just pressed.
  */
  const { plan: planParam } = useLocalSearchParams<{ plan?: string }>();
  const { data: plans } = useMealPlans();
  const { data: profile } = useProfile();
  const createPlan = useCreateMealPlan();
  const deletePlan = useDeleteMealPlan();
  const deleteItem = useDeleteMealPlanItem();
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const [openId, setOpenId] = useState<string | null>(planParam ?? null);
  const { data: items } = useMealPlanItems(openId);

  /**
   * Which day's picker is open, or `null`.
   *
   * One number instead of the old `addOpen` boolean plus a separate `addDay`:
   * the two could disagree — the panel open while `addDay` still pointed at
   * whatever was chosen last time — and there was nothing on screen to reveal
   * it, because the panel was nowhere near the day it was about to write to.
   */
  const [addingDay, setAddingDay] = useState<number | null>(null);

  const mealLabel = (m: string) =>
    ({
      breakfast: i18n.nBreakfast,
      lunch: i18n.nLunch,
      dinner: i18n.nDinner,
      snack: i18n.nSnack,
      preworkout: i18n.nPreWorkout,
      postworkout: i18n.nPostWorkout,
    })[m] ?? m;

  const dayLabel = (idx: number) => `${i18n.nDay} ${idx + 1}`;

  /**
   * The plan the sheet is writing into, and the meal slots it offers.
   *
   * Computed here rather than inside the list, because the sheet is one view
   * for the whole screen — a copy per day would be seven modals waiting to
   * disagree about which one is open.
   */
  const openPlan = plans?.find((p) => p.id === openId);
  const slots = MEAL_ORDER.slice(
    0,
    Math.max(1, Math.min(MEAL_ORDER.length, openPlan?.meals_per_day ?? 3)),
  );

  /**
   * Meals written into today's diary since this screen opened.
   *
   * Keyed `plan:day:meal`, and deliberately only for this visit. Whether a meal
   * "has been eaten" is not a fact the plan holds — a plan day is the second day
   * of a routine, not a date — and the diary cannot answer it either, because
   * two eggs for breakfast is one meal logged twice as legitimately as it is a
   * double tap. So this claims only what it saw: you pressed it, here, just now.
   * A relaunch forgets, which is honest, because after a relaunch it does not
   * know.
   */
  const [logged, setLogged] = useState<Set<string>>(new Set());
  /**
   * How many foods this sitting of the picker has added.
   *
   * The third step is the only one that starts unanswered — the day arrives
   * from the button you pressed and the meal has a default — so this is what
   * the progress bar is actually tracking. Reset when the picker opens, not
   * when it closes: closing it can happen by a back gesture that never reaches
   * `closePicker`.
   */
  const [addedCount, setAddedCount] = useState(0);
  const logMeal = useLogPlannedMeal();

  const eatMeal = (planId: string, day: number, meal: string, foods: typeof items) => {
    const key = `${planId}:${day}:${meal}`;
    if (!foods || foods.length === 0 || logged.has(key) || logMeal.isPending) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    logMeal.mutate(
      { mealType: meal, foods },
      {
        onSuccess: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setLogged((prev) => new Set(prev).add(key));
          toast.success(i18n.nMpEatDone.replace('{m}', mealLabel(meal)));
        },
        onError: (e: Error) => toast.error(e.message),
      },
    );
  };

  const closePicker = () => setAddingDay(null);



  const GOALS = [
    { key: 'bulk', label: i18n.goalBulk },
    { key: 'cut', label: i18n.goalCut },
    { key: 'maintain', label: i18n.goalMaintain },
  ];
  // goal is stored as an English key — render the localized label
  const goalLabel = (g: string | null) => GOALS.find((x) => x.key === g)?.label ?? g;

  /** what the profile says a day should come to, for the plan to be read against */
  const target = calorieTargetFor(profile);

  /** day index → its items, and what they add up to */
  const byDay = useMemo(() => {
    const map = new Map<number, { items: NonNullable<typeof items>; kcal: number }>();
    for (const d of DAYS) map.set(d, { items: [], kcal: 0 });
    for (const it of items ?? []) {
      const day = map.get(it.day_index);
      // A row for a day outside the week is data this screen cannot place; it
      // is counted nowhere rather than silently folded into day 1.
      if (!day) continue;
      day.items.push(it);
      day.kcal += Math.round(Number(it.kcal) || 0);
    }
    return map;
  }, [items]);

  /**
   * The average over the days that have anything on them.
   *
   * Not over seven. A plan half-written would otherwise read as half the
   * calories it actually prescribes, which is exactly the number somebody would
   * act on.
   */
  const perDay = useMemo(() => {
    const used = DAYS.map((d) => byDay.get(d)!).filter((d) => d.items.length > 0);
    if (used.length === 0) return null;
    return Math.round(used.reduce((s, d) => s + d.kcal, 0) / used.length);
  }, [byDay]);



  const confirmDelete = (id: string, planName: string) => {
    Alert.alert('ASCND', `${i18n.delete} "${planName}"?`, [
      { text: i18n.cancel, style: 'cancel' },
      {
        text: i18n.delete,
        style: 'destructive',
        onPress: () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          deletePlan.mutate(id, { onError: (e: Error) => Alert.alert('ASCND', e.message) });
        },
      },
    ]);
  };

  return (
    <Screen back title={i18n.nMealPlans}>
      {/*
        No "create" button, and no heading either.

        The Nutrition tab makes plans now — that is where you are when you
        decide you want one — and this screen's own title already says what it
        is a list of. A second create button here would open the same flow from
        a screen you had to reach first, and the heading under the heading was
        the page saying its name twice.
      */}

      {plans && plans.length > 0 ? (
        plans.map((p, pi) => {
          const open = openId === p.id;
          /*
            How many meal slots this plan has, from the number chosen when it
            was created. Clamped to the six the app knows: `meals_per_day` is a
            free column and a plan written elsewhere could say anything.
          */
          const planSlots = MEAL_ORDER.slice(
            0,
            Math.max(1, Math.min(MEAL_ORDER.length, p.meals_per_day ?? 3)),
          );

          return (
            <Animated.View key={p.id} style={styles.planBlock} entering={rise(pi)}>
              <GlassCard>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: open }}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setOpenId(open ? null : p.id);
                    closePicker();
                  }}
                  style={({ pressed }) => [styles.planRow, pressed && styles.pressedDim]}>
                  <View style={styles.planInfo}>
                    <Text style={styles.title} numberOfLines={1}>{p.name}</Text>
                    <Text style={styles.hint}>
                      {[goalLabel(p.goal), `${planSlots.length} ${i18n.nMealsPerDay}`]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                    {/* Only once it is open, because the items it counts are
                        only fetched for the open plan — a closed card claiming
                        "0 kcal/day" would be reporting a query that never ran. */}
                    {open && perDay != null ? (
                      <Text style={styles.planTotals}>
                        {i18n.nMpAvgPerDay.replace('{x}', perDay.toLocaleString())}
                        {'  ·  '}
                        {i18n.nMpTarget.replace('{x}', target.toLocaleString())}
                      </Text>
                    ) : null}
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={i18n.a11yDelete}
                    hitSlop={10}
                    onPress={() => confirmDelete(p.id, p.name)}
                    style={styles.iconBtn}>
                    <Icon icon={Trash2} size={16} color={colors.mutedForeground} />
                  </Pressable>
                  <Icon
                    icon={ChevronDown}
                    size={18}
                    color={open ? colors.foreground : colors.mutedForeground}
                  />
                </Pressable>
              </GlassCard>

              {/*
                Every day, always — including the empty ones.

                The week's shape is the thing you are working on, and a view
                built only from the days that already have food hides exactly
                the days that still need some.
              */}
              {open
                ? DAYS.map((d) => {
                    const day = byDay.get(d)!;
                    return (
                      <Animated.View
                        key={d}
                        entering={FadeInDown.duration(220).delay(Math.min(d, 6) * 30)}>
                        {/*
                          An empty day is one line, not a card.

                          Every day is still shown — the week's shape is the
                          thing being worked on, and hiding the empty ones hides
                          exactly the days that need food. But a full card
                          holding a title, the words "chưa có món nào" and a
                          button is three lines of furniture for a day with
                          nothing in it, and on a fresh plan that is seven of
                          them stacked down the screen. The row says the day and
                          offers the one thing you can do with it.
                        */}
                        {day.items.length === 0 ? (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`${i18n.nMpAddFood} — ${dayLabel(d)}`}
                            onPress={() => {
                              Haptics.selectionAsync();
                              setAddingDay(d);
                            }}
                            style={({ pressed }) => [styles.emptyRow, pressed && styles.pressedDim]}>
                            <Text style={styles.emptyRowDay}>{dayLabel(d)}</Text>
                            <Text style={styles.emptyRowHint}>{i18n.nMpEmptyDay}</Text>
                            <Icon icon={Plus} size={14} color={colors.primary} strokeWidth={2.5} />
                          </Pressable>
                        ) : (
                        <GlassCard style={styles.dayCard}>
                          <View style={styles.dayHead}>
                            <Text style={styles.dayTitle}>{dayLabel(d)}</Text>
                            {day.kcal > 0 ? (
                              <Text style={styles.dayKcal}>{day.kcal.toLocaleString()} kcal</Text>
                            ) : null}
                          </View>

                          {/* Grouped by meal, in the order a day runs — so a day
                              reads as breakfast then lunch then dinner rather
                              than as the order things happened to be added.

                              All six, not just this plan's `slots`: a plan whose
                              meal count was lowered, or a row written by the web
                              app, still has food filed under the meals that are
                              no longer offered, and food you cannot see is food
                              you cannot remove. */}
                          {MEAL_ORDER.filter((m) => day.items.some((it) => it.meal_type === m)).map(
                            (m) => (
                              <View key={m} style={styles.mealGroup}>
                                <View style={styles.mealHead}>
                                  <Text style={styles.mealLabel}>{mealLabel(m)}</Text>
                                  {/*
                                    The whole point of a plan: eat it without
                                    writing it out again. It says "today"
                                    because that is where it lands — a plan's
                                    "Day 2" is the second day of a routine, not
                                    a date.
                                  */}
                                  <Pressable
                                    accessibilityRole="button"
                                    accessibilityState={{
                                      disabled: logged.has(`${p.id}:${d}:${m}`),
                                    }}
                                    disabled={logged.has(`${p.id}:${d}:${m}`) || logMeal.isPending}
                                    hitSlop={8}
                                    onPress={() =>
                                      eatMeal(
                                        p.id,
                                        d,
                                        m,
                                        day.items.filter((it) => it.meal_type === m),
                                      )
                                    }
                                    style={({ pressed }) => [
                                      styles.eatBtn,
                                      logged.has(`${p.id}:${d}:${m}`) && styles.eatBtnDone,
                                      pressed && styles.pressed,
                                    ]}>
                                    <Icon
                                      icon={logged.has(`${p.id}:${d}:${m}`) ? Check : UtensilsCrossed}
                                      size={12}
                                      color={colors.readinessGreen}
                                      strokeWidth={2.5}
                                    />
                                    <Text style={styles.eatBtnText}>
                                      {logged.has(`${p.id}:${d}:${m}`)
                                        ? i18n.nMpEaten
                                        : i18n.nMpEatIt}
                                    </Text>
                                  </Pressable>
                                </View>
                                {day.items
                                  .filter((it) => it.meal_type === m)
                                  .map((it) => (
                                    <View key={it.id} style={styles.itemRow}>
                                      <Text style={styles.itemName} numberOfLines={1}>
                                        {it.food_name}
                                      </Text>
                                      <Text style={styles.itemKcal}>
                                        {Math.round(Number(it.kcal))} kcal
                                      </Text>
                                      <Pressable
                                        accessibilityRole="button"
                                        accessibilityLabel={i18n.a11yRemove}
                                        hitSlop={10}
                                        onPress={() =>
                                          deleteItem.mutate({ id: it.id, planId: p.id })
                                        }
                                        style={styles.iconBtn}>
                                        <Icon icon={X} size={13} color={colors.mutedForeground} />
                                      </Pressable>
                                    </View>
                                  ))}
                              </View>
                            ),
                          )}

                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`${i18n.nMpAddFood} — ${dayLabel(d)}`}
                            style={({ pressed }) => [styles.addFoodBtn, pressed && styles.pressed]}
                            onPress={() => {
                              Haptics.selectionAsync();
                              setAddingDay(d);
                            }}>
                            <Icon icon={Plus} size={14} color={colors.primary} strokeWidth={2.5} />
                            <Text style={styles.addFoodText}>{i18n.nMpAddFood}</Text>
                          </Pressable>
                        </GlassCard>
                        )}
                      </Animated.View>
                    );
                  })
                : null}

              {/*
                Once, under the week — not under every day that has food.

                It was printed inside each day card, so a full plan repeated the
                same caveat seven times. A note you have read six times is a note
                you have stopped reading, and it is the only thing on this screen
                that says what "Ghi vào hôm nay" does not carry.
              */}
              {open && (items ?? []).length > 0 ? (
                <Text style={styles.fibreNote}>{i18n.nMpNoFibre}</Text>
              ) : null}
            </Animated.View>
          );
        })
      ) : (
        <GlassCard>
          <Text style={styles.title}>{i18n.nNoMealPlans}</Text>
          <Text style={styles.hint}>{i18n.nNoMealPlansHint}</Text>
        </GlassCard>
      )}

      {/*
        Adding a food — and, from the create button, making the plan first.

        Both used to live here: a form in a card at the top of the page, and a
        sheet over the week for the food. They are four steps of one thing, so
        they are one component now (`meal-plan-wizard`), reached from here with
        the plan and the day already known and from the Nutrition tab with
        neither.
      */}
      {/*
        Always with a plan in hand: this screen is only ever reached from one,
        and creating happens on the Nutrition tab. `planId` is never null here,
        so the flow opens on the food with the first three steps already done.
      */}
      <MealPlanWizard
        visible={addingDay !== null}
        planId={openId}
        initialDay={addingDay ?? 0}
        onClose={closePicker}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({

  createCard: { gap: spacing.sm },
  formTitle: { ...type.headline, color: colors.foreground, marginBottom: 2 },
  fieldLabel: { ...type.caption, color: colors.mutedForeground, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 4 },
  input: {
    height: 44,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    color: colors.foreground,
    fontSize: 15,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.secondary,
  },
  chipActive: { backgroundColor: colors.primary },
  chipText: { ...type.footnote, color: colors.secondaryForeground },
  chipTextActive: { color: colors.primaryForeground, fontWeight: '600' },
  submitBtn: {
    height: 46,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  submitDisabled: { opacity: 0.4 },
  submitText: { ...type.headline, color: colors.primaryForeground },

  planBlock: { gap: spacing.sm },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  planInfo: { flex: 1, minWidth: 0, gap: 2 },
  title: { ...type.headline, color: colors.foreground },
  hint: { ...type.footnote, color: colors.mutedForeground, textTransform: 'capitalize' },
  planTotals: { ...type.caption, color: colors.foreground, fontVariant: ['tabular-nums'] },

  /* Indented, so the days read as belonging to the plan above them rather than
     as a second list of equals. */
  dayCard: { paddingVertical: spacing.md, marginLeft: spacing.md, gap: spacing.xs },
  dayHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dayTitle: { ...type.footnote, fontWeight: '700', color: colors.foreground },
  dayKcal: { ...type.caption, color: colors.mutedForeground, fontVariant: ['tabular-nums'] },
  /* The slim row an untouched day gets. Indented to the same margin as the day
     cards so the week still reads as one column, and shorter than a card by
     enough that a plan with three days filled looks like three days filled. */
  emptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 44,
    paddingHorizontal: spacing.md,
    marginLeft: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  emptyRowDay: { ...type.footnote, color: colors.foreground, fontWeight: '600' },
  emptyRowHint: { ...type.caption, color: colors.mutedForeground, flex: 1 },

  mealGroup: { marginTop: spacing.xs },
  mealHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  /* Quiet green, because it is an affirmative action on a screen full of neutral
     rows — and small, because it repeats once per meal and a loud button six
     times over is a screen shouting at itself. */
  eatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    // 28pt of ink with hitSlop 8 — 44pt of target, which is the minimum
    height: 28,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radius.full,
    backgroundColor: 'rgba(43,245,168,0.12)',
  },
  eatBtnDone: { backgroundColor: 'transparent' },
  eatBtnText: { ...type.caption, fontWeight: '700', color: colors.readinessGreen },
  fibreNote: {
    ...type.caption,
    color: colors.mutedForeground,
    marginLeft: spacing.md,
    marginTop: spacing.xs,
  },
  mealLabel: {
    ...type.caption,
    color: colors.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 2 },
  itemName: { ...type.body, color: colors.foreground, flex: 1, minWidth: 0 },
  itemKcal: { ...type.caption, color: colors.mutedForeground, fontVariant: ['tabular-nums'] },
  // 28pt of ink with hitSlop 10 — 48pt of target, past the 44pt minimum
  iconBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },

  pressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
  pressedDim: { opacity: 0.6 },

  addFoodBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 38,
    marginTop: spacing.xs,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  addFoodText: { ...type.caption, fontWeight: '700', color: colors.primary },

  /*
    A page, not a sheet.

    It was a bottom sheet at 86% height with a grabber, dismissed by dragging
    down. That gesture is one you either know or do not, and everything about
    the panel — three decisions, a search field, a list of two hundred foods —
    was a page's worth of content wearing a sheet's clothes. `pageSheet` on iOS
    still slides and still drags away for whoever reaches for it; nothing
    depends on it now.
  */
  full: { flex: 1, backgroundColor: colors.background },
  fullHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  fullTitle: { ...type.title2, color: colors.foreground },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.secondary,
  },

  // ── the progress line ──
  steps: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  step: { flex: 1, alignItems: 'center', gap: 6 },
  stepTop: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' },
  dot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.secondary,
  },
  dotOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  rail: { flex: 1, height: 2, backgroundColor: colors.border },
  railOn: { backgroundColor: colors.primary },
  /* Hidden rather than absent: the first and last dots keep a rail-sized gap,
     so all three sit at the same place in their column and the row does not
     lean. */
  railHidden: { backgroundColor: 'transparent' },
  stepValue: { ...type.caption, color: colors.mutedForeground },
  stepValueOn: { color: colors.foreground, fontWeight: '600' },

  fullBody: { flex: 1 },
  fullBodyContent: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.sm },
  /* The question, then what it means. The heading alone was what the old sheet
     had — a row of chips under a word — and a row of chips is only obviously a
     control once you already know what it is choosing between. */
  stepHead: { ...type.footnote, color: colors.foreground, fontWeight: '700', marginTop: spacing.sm },
  stepHint: { ...type.caption, color: colors.mutedForeground, marginBottom: 2 },

  fullFoot: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  doneBtn: {
    height: 50,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  doneText: { ...type.body, color: colors.primaryForeground, fontWeight: '700' },

  resultsContent: { gap: spacing.sm, paddingBottom: spacing.sm },
  miniChip: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 7,
    borderRadius: radius.full,
    backgroundColor: colors.secondary,
  },
  miniChipText: { ...type.caption, color: colors.secondaryForeground },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 42,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
  },
  searchInput: { flex: 1, color: colors.foreground, fontSize: 15 },
  /*
    A card each, with air between them, rather than lines between text rows.

    They were 13pt names on ~32pt rows divided by a hairline: legible, but under
    the 44pt a finger is entitled to, and dense enough that picking the third
    chicken out of six near-identical names meant aiming. A surface of its own
    makes a row a thing you press, and `resultsContent` supplies the gap — so no
    row has to carry a border to say where it ends.
  */
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm + 4,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: glass.bg,
    borderWidth: glass.borderWidth,
    borderColor: 'transparent',
  },
  /* Dimmed and outlined, not hidden — see the note on `FoodRow`. The border is
     what keeps it legible as a row once the fill has faded with it. */
  rowAdded: { opacity: 0.55, borderColor: colors.border },
  resultName: { ...type.body, color: colors.foreground, flex: 1, minWidth: 0 },
  resultKcal: { ...type.footnote, color: colors.mutedForeground, fontVariant: ['tabular-nums'] },
  pickLabel: {
    ...type.caption,
    color: colors.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: spacing.xs,
  },
});
