import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Check, ChevronDown, Plus, Search, Trash2, X } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { Screen } from '@/components/ascnd/screen';
import { colors, radius, spacing, type } from '@/constants/ascnd';
import { rise } from '@/lib/entrance';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import {
  useAddMealPlanItem,
  useCreateMealPlan,
  useDeleteMealPlan,
  useDeleteMealPlanItem,
  useMealPlanItems,
  useMealPlans,
} from '@/hooks/use-library';
import { dedupeSeedShadows, useMyFoods } from '@/hooks/use-nutrition';
import { useProfile } from '@/hooks/useTodayData';
import { supabase } from '@/integrations/supabase/client';
import { calorieTargetFor } from '@/lib/macro-targets';

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

const MEALS_PER_DAY = [3, 4, 5, 6];
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
  const { data: plans } = useMealPlans();
  const { data: profile } = useProfile();
  const createPlan = useCreateMealPlan();
  const deletePlan = useDeleteMealPlan();
  const addItem = useAddMealPlanItem();
  const deleteItem = useDeleteMealPlanItem();
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const insets = useSafeAreaInsets();
  const [openId, setOpenId] = useState<string | null>(null);
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
  const [addMeal, setAddMeal] = useState<string>('breakfast');
  const [foodQuery, setFoodQuery] = useState('');
  const [foodDebounced, setFoodDebounced] = useState('');
  const { data: myFoods } = useMyFoods();

  useEffect(() => {
    const t = setTimeout(() => setFoodDebounced(foodQuery.trim()), 250);
    return () => clearTimeout(t);
  }, [foodQuery]);

  const { data: foodResults } = useQuery({
    queryKey: ['mealplan_food_search', foodDebounced],
    enabled: foodDebounced.length >= 2,
    queryFn: async () => {
      const { data } = await supabase
        .from('food_items')
        .select('id, user_id, name, kcal, protein_g, carbs_g, fat_g, serving_g')
        .ilike('name', `%${foodDebounced}%`)
        .order('name')
        .limit(15);
      return dedupeSeedShadows(data ?? []);
    },
  });

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

  const closePicker = () => {
    setAddingDay(null);
    setFoodQuery('');
    setFoodDebounced('');
  };

  const addFood = (f: {
    id: string;
    name: string;
    kcal: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    serving_g: number;
  }) => {
    if (!openId || addingDay === null) return;
    addItem.mutate(
      {
        meal_plan_id: openId,
        day_index: addingDay,
        meal_type: addMeal,
        food_name: f.name,
        serving_g: Number(f.serving_g) || 100,
        kcal: Math.round(Number(f.kcal) || 0),
        protein_g: Math.round(Number(f.protein_g) || 0),
        carbs_g: Math.round(Number(f.carbs_g) || 0),
        fat_g: Math.round(Number(f.fat_g) || 0),
        food_item_id: f.id,
      },
      {
        // The picker stays open: adding one food to a meal is almost never the
        // whole of that meal. Only the query is cleared, so the next search
        // starts from nothing rather than from the last thing added.
        onSuccess: () => {
          setFoodQuery('');
          setFoodDebounced('');
        },
        onError: (e: Error) => Alert.alert('ASCND', e.message),
      },
    );
  };

  // Create form (web: "Create Meal Plan" dialog — name / goal / meals per day)
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('maintain');
  const [mealsPerDay, setMealsPerDay] = useState(3);

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

  /**
   * The foods already in the meal the sheet is about to write to.
   *
   * Scoped to this day *and* this meal, which is the only scope that is a
   * mistake: the same chicken on Monday and on Tuesday is a plan, and twice in
   * Monday's breakfast is a slip — usually a second tap on a row that gave no
   * sign the first one had landed.
   *
   * Matched on the name, because that is what `addFood` writes and what a
   * duplicate line would read as. Matching on `food_item_id` would be exact and
   * is not available — `useMealPlanItems` does not select it — and would be
   * worse anyway: the library carries a user's copy shadowing a seed food under
   * the same name, and two rows reading "Ức gà" in one meal is the duplicate
   * this is here to stop, whichever row each came from.
   */
  const alreadyInSlot = useMemo(() => {
    const taken = new Set<string>();
    if (addingDay === null) return taken;
    for (const it of byDay.get(addingDay)?.items ?? []) {
      if (it.meal_type === addMeal) taken.add(it.food_name.trim().toLowerCase());
    }
    return taken;
  }, [byDay, addingDay, addMeal]);

  const submitPlan = () => {
    if (!name.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    createPlan.mutate(
      { name: name.trim(), goal, meals_per_day: mealsPerDay },
      {
        onSuccess: () => {
          setCreating(false);
          setName('');
        },
        onError: (e: Error) => Alert.alert('ASCND', e.message),
      },
    );
  };

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
      {/* Header row: your plans + create button (web plans tab) */}
      <View style={styles.headRow}>
        <Text style={styles.headTitle}>{i18n.nutritionYourPlans}</Text>
        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [styles.createBtn, pressed && styles.pressed]}
          onPress={() => {
            Haptics.selectionAsync();
            setCreating((v) => !v);
          }}>
          <Icon icon={Plus} size={13} color={colors.primaryForeground} strokeWidth={2.5} />
          <Text style={styles.createBtnText}>{i18n.nutritionCreateNew}</Text>
        </Pressable>
      </View>

      {creating && (
        <GlassCard style={styles.createCard}>
          <Text style={styles.formTitle}>{i18n.nutritionCreatePlan}</Text>

          <Text style={styles.fieldLabel}>{i18n.nutritionPlanName}</Text>
          <TextInput
            style={styles.input}
            placeholder={lang === 'vi' ? 'VD: Meal Prep Tuần 1' : 'e.g. Meal Prep Week 1'}
            placeholderTextColor={colors.mutedForeground}
            value={name}
            onChangeText={setName}
          />

          <Text style={styles.fieldLabel}>{i18n.settingsGoal}</Text>
          <View style={styles.chipRow}>
            {GOALS.map((g) => (
              <Pressable
                key={g.key}
                accessibilityRole="button"
                accessibilityState={{ selected: goal === g.key }}
                style={[styles.chip, goal === g.key && styles.chipActive]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setGoal(g.key);
                }}>
                <Text style={[styles.chipText, goal === g.key && styles.chipTextActive]}>{g.label}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.fieldLabel}>{i18n.nutritionMealsPerDay}</Text>
          <View style={styles.chipRow}>
            {MEALS_PER_DAY.map((n) => (
              <Pressable
                key={n}
                accessibilityRole="button"
                accessibilityState={{ selected: mealsPerDay === n }}
                style={[styles.chip, mealsPerDay === n && styles.chipActive]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setMealsPerDay(n);
                }}>
                <Text style={[styles.chipText, mealsPerDay === n && styles.chipTextActive]}>
                  {n} {i18n.nutritionMeals}
                </Text>
              </Pressable>
            ))}
          </View>

          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.submitBtn,
              (!name.trim() || createPlan.isPending) && styles.submitDisabled,
              pressed && name.trim() && !createPlan.isPending && styles.pressed,
            ]}
            disabled={!name.trim() || createPlan.isPending}
            onPress={submitPlan}>
            {createPlan.isPending ? (
              <ActivityIndicator color={colors.primaryForeground} size="small" />
            ) : (
              <Text style={styles.submitText}>{i18n.nutritionCreateBtn}</Text>
            )}
          </Pressable>
        </GlassCard>
      )}

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
                    setAddMeal(planSlots[0]);
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
                        <GlassCard style={styles.dayCard}>
                          <View style={styles.dayHead}>
                            <Text style={styles.dayTitle}>{dayLabel(d)}</Text>
                            {day.kcal > 0 ? (
                              <Text style={styles.dayKcal}>{day.kcal.toLocaleString()} kcal</Text>
                            ) : null}
                          </View>

                          {day.items.length === 0 ? (
                            <Text style={styles.emptyDay}>{i18n.nMpEmptyDay}</Text>
                          ) : null}

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
                                <Text style={styles.mealLabel}>{mealLabel(m)}</Text>
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
                              setFoodQuery('');
                              setFoodDebounced('');
                              setAddMeal(planSlots[0]);
                              setAddingDay(d);
                            }}>
                            <Icon icon={Plus} size={14} color={colors.primary} strokeWidth={2.5} />
                            <Text style={styles.addFoodText}>{i18n.nMpAddFood}</Text>
                          </Pressable>
                        </GlassCard>
                      </Animated.View>
                    );
                  })
                : null}
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
        Choosing the food, as a sheet over the week.

        One for the whole screen, driven by `addingDay`. Seven copies — one per
        day card — would be seven modals that can disagree about which is open,
        and the day is already carried by the state rather than by which copy
        rendered it.

        `Modal` is right here and would not be in the workout builder: that
        screen is itself presented as a modal, and a modal inside one renders
        blank on this stack. This screen is pushed normally, like the routine
        planner, whose template picker is built the same way.
      */}
      <Modal
        visible={addingDay !== null}
        transparent
        animationType="slide"
        onRequestClose={closePicker}>
        <Pressable
          style={styles.backdrop}
          accessibilityLabel={i18n.a11yClose}
          onPress={closePicker}
        />
        {/* `box-none` so the dimmed week behind the sheet still takes the tap
            that closes it — this fills the window to do its keyboard work. */}
        <KeyboardAvoidingView
          style={styles.sheetHolder}
          pointerEvents="box-none"
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
            <View style={styles.grabber} />

            <View style={styles.pickerHead}>
              <Text style={styles.pickerTitle} numberOfLines={1}>
                {addingDay !== null
                  ? i18n.nMpAddTo
                      .replace('{d}', dayLabel(addingDay))
                      .replace('{m}', mealLabel(addMeal))
                  : ''}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={i18n.a11yClose}
                hitSlop={10}
                onPress={() => {
                  Haptics.selectionAsync();
                  closePicker();
                }}
                style={styles.iconBtn}>
                <Icon icon={X} size={16} color={colors.mutedForeground} />
              </Pressable>
            </View>

            <View style={styles.chipRow}>
              {slots.map((m) => (
                <Pressable
                  key={m}
                  accessibilityRole="button"
                  accessibilityState={{ selected: addMeal === m }}
                  style={[styles.miniChip, addMeal === m && styles.chipActive]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setAddMeal(m);
                  }}>
                  <Text style={[styles.miniChipText, addMeal === m && styles.chipTextActive]}>
                    {mealLabel(m)}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.searchWrap}>
              <Icon icon={Search} size={14} color={colors.mutedForeground} />
              <TextInput
                style={styles.searchInput}
                placeholder={i18n.nutritionSearchFood}
                placeholderTextColor={colors.mutedForeground}
                value={foodQuery}
                onChangeText={setFoodQuery}
                autoCorrect={false}
                returnKeyType="search"
              />
              {foodQuery.length > 0 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={i18n.a11yClearSearch}
                  hitSlop={10}
                  onPress={() => setFoodQuery('')}
                  style={styles.iconBtn}>
                  <Icon icon={X} size={14} color={colors.mutedForeground} />
                </Pressable>
              ) : null}
            </View>

            {/*
              The list scrolls inside the sheet.

              Your own foods can run to two hundred rows, which is the reason
              this stopped being a panel inside a day card: a card that grows to
              hold them pushes the rest of the week off the screen while you are
              still choosing.
            */}
            <ScrollView
              style={styles.results}
              contentContainerStyle={styles.resultsContent}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag">
              {foodDebounced.length >= 2 ? (
                (foodResults ?? []).length > 0 ? (
                  (foodResults ?? []).map((f) => (
                    <FoodRow
                      key={f.id}
                      name={f.name}
                      kcal={Number(f.kcal)}
                      added={alreadyInSlot.has(f.name.trim().toLowerCase())}
                      i18n={i18n}
                      onAdd={() => addFood(f)}
                    />
                  ))
                ) : (
                  <Text style={styles.emptyDay}>
                    {i18n.nMpNoMatch.replace('{x}', foodDebounced)}
                  </Text>
                )
              ) : myFoods && myFoods.length > 0 ? (
                <>
                  <Text style={styles.pickLabel}>{i18n.nMpFromList}</Text>
                  {myFoods.map((f) => (
                    <FoodRow
                      key={f.id}
                      name={f.name}
                      kcal={Number(f.kcal)}
                      added={alreadyInSlot.has(f.name.trim().toLowerCase())}
                      i18n={i18n}
                      onAdd={() => addFood({ ...f, serving_g: Number(f.serving_g) || 100 })}
                    />
                  ))}
                </>
              ) : null}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </Screen>
  );
}

/**
 * One choosable food — the same row whether it came from a search or your list.
 *
 * A food already in this meal stays on the list and stops being a button: it
 * dims, its plus becomes a tick, and it says so. Removing it from the list
 * instead would be worse — the row you just tapped would vanish, which reads as
 * a mistake rather than as a confirmation, and the search you were part-way
 * through would shuffle under your finger.
 */
function FoodRow({
  name,
  kcal,
  added,
  i18n,
  onAdd,
}: {
  name: string;
  kcal: number;
  added: boolean;
  i18n: ReturnType<typeof useI18n>;
  onAdd: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: added }}
      accessibilityLabel={
        added ? `${name}, ${i18n.nMpAlready}` : `${name}, ${Math.round(kcal)} kcal`
      }
      disabled={added}
      style={({ pressed }) => [styles.resultRow, added && styles.rowAdded, pressed && styles.pressedDim]}
      onPress={onAdd}>
      <Text style={styles.resultName} numberOfLines={1}>{name}</Text>
      <Text style={styles.resultKcal}>
        {added ? i18n.nMpAlready : `${Math.round(kcal)} kcal`}
      </Text>
      <Icon
        icon={added ? Check : Plus}
        size={14}
        color={added ? colors.readinessGreen : colors.primary}
        strokeWidth={2.5}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headTitle: { ...type.headline, color: colors.foreground },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
  },
  createBtnText: { fontSize: 12, fontWeight: '600', color: colors.primaryForeground },

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
  emptyDay: { ...type.caption, color: colors.mutedForeground, paddingVertical: 2 },

  mealGroup: { marginTop: spacing.xs },
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

  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  /* Pins the sheet to the bottom of whatever the keyboard leaves. */
  sheetHolder: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    /*
      A height, not a ceiling.

      It was `maxHeight`, so the sheet was as tall as whatever happened to be in
      it — short with four foods, tall with forty — and a panel that is a
      different size every time you open it reads as unfinished rather than as
      responsive. Fixed at 86%, the list scrolls inside it and the week stays
      visible behind the last 14%, which is what says this is a detour and not a
      destination.

      A percentage of the keyboard-avoider, so it shrinks with the space the
      keyboard leaves rather than sliding out from under it.
    */
    height: '86%',
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.xs,
  },
  // Takes whatever the header, chips and search field leave over
  results: { flex: 1 },
  resultsContent: { paddingBottom: spacing.sm },
  pickerHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  pickerTitle: { ...type.title2, color: colors.foreground, flex: 1 },
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
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(43,43,49,0.4)',
  },
  /* Dimmed, not hidden — see the note on `FoodRow`. */
  rowAdded: { opacity: 0.5 },
  resultName: { ...type.footnote, color: colors.foreground, flex: 1, minWidth: 0 },
  resultKcal: { ...type.caption, color: colors.mutedForeground, fontVariant: ['tabular-nums'] },
  pickLabel: {
    ...type.caption,
    color: colors.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: spacing.xs,
  },
});
