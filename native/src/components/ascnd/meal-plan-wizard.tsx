import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Check, Plus, Search, X } from 'lucide-react-native';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ascnd/icon';
import { colors, radius, spacing, type } from '@/constants/ascnd';
import { useI18n } from '@/hooks/use-app-settings';
import {
  useAddMealPlanItem,
  useCreateMealPlan,
  useMealPlanItems,
  useMealPlans,
} from '@/hooks/use-library';
import { dedupeSeedShadows, useMyFoods } from '@/hooks/use-nutrition';
import { supabase } from '@/integrations/supabase/client';

/**
 * Making a meal plan, from nothing to food on a day, as one flow.
 *
 * ── the four decisions were four rooms ──
 *
 * Creating a plan was a form. Choosing a day was a `+` on a card. Choosing a
 * meal was a row of chips inside a sheet you had already opened. Choosing a
 * food was that sheet's list. Each was fine on its own and together they were
 * a chain you had to already know the shape of — and the one thing none of
 * them ever showed was how far along you were.
 *
 * They are four steps of one thing now, on one surface, in the order they are
 * asked, with a line across the top that says which are answered.
 *
 * ── two entrances, one flow ──
 *
 * From the Nutrition tab there is no plan yet, so it starts at step one. From
 * a day in `/meal-plans` the plan and the day are both already known, so it
 * opens on the food with three dots already filled. Same component, same
 * steps, different amount already done — which is exactly what a progress line
 * is for.
 *
 * ── why it is a page and not a sheet ──
 *
 * A sheet is dismissed by dragging it down, and that is a gesture you either
 * know or do not. This fills the screen and closes with a button. On iOS
 * `pageSheet` still slides in and still drags away for whoever reaches for it;
 * nothing depends on it.
 */

const MEALS_PER_DAY = [3, 4, 5, 6];
const DAYS = [0, 1, 2, 3, 4, 5, 6];
const MEAL_ORDER = ['breakfast', 'lunch', 'dinner', 'snack', 'preworkout', 'postworkout'] as const;

export function MealPlanWizard({
  visible,
  planId,
  initialDay,
  onClose,
  onPlanCreated,
}: {
  visible: boolean;
  /** the plan being added to, or `null` to start by making one */
  planId: string | null;
  /** which day the flow opens on when the plan is already known */
  initialDay?: number;
  onClose: () => void;
  /** so the screen behind can open the plan that was just made */
  onPlanCreated?: (id: string) => void;
}) {
  const i18n = useI18n();
  const insets = useSafeAreaInsets();

  const { data: plans } = useMealPlans();
  const createPlan = useCreateMealPlan();
  const addItem = useAddMealPlanItem();
  const { data: myFoods } = useMyFoods();

  /** the plan this flow is writing into — the one passed in, or the one it made */
  const [madeId, setMadeId] = useState<string | null>(null);
  const activeId = planId ?? madeId;
  const plan = plans?.find((p) => p.id === activeId) ?? null;

  const [name, setName] = useState('');
  const [goal, setGoal] = useState('maintain');
  const [mealsPerDay, setMealsPerDay] = useState(3);

  const [day, setDay] = useState(initialDay ?? 0);
  const [meal, setMeal] = useState<string>('breakfast');
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [added, setAdded] = useState(0);

  /*
    Every opening starts clean.

    Reset when it becomes visible rather than when it closes: closing can happen
    through a back gesture or a swipe that never reaches `onClose`, and a flow
    that reopens holding the last session's day, search and count is a flow that
    lies about where you are.
  */
  useEffect(() => {
    if (!visible) return;
    setMadeId(null);
    setName('');
    setGoal('maintain');
    setMealsPerDay(3);
    setDay(initialDay ?? 0);
    setMeal('breakfast');
    setQuery('');
    setDebounced('');
    setAdded(0);
  }, [visible, initialDay]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  const { data: results } = useQuery({
    queryKey: ['mealplan_food_search', debounced],
    enabled: debounced.length >= 2,
    queryFn: async () => {
      const { data } = await supabase
        .from('food_items')
        .select('id, user_id, name, kcal, protein_g, carbs_g, fat_g, serving_g')
        .ilike('name', `%${debounced}%`)
        .order('name')
        .limit(15);
      return dedupeSeedShadows(data ?? []);
    },
  });

  const { data: items } = useMealPlanItems(activeId);

  /**
   * The foods already in the day and meal being written to.
   *
   * Scoped to both, which is the only scope that is a mistake: the same chicken
   * on Monday and on Tuesday is a plan, and twice in Monday's breakfast is a
   * slip — usually a second tap on a row that gave no sign the first one landed.
   */
  const alreadyHere = useMemo(() => {
    const taken = new Set<string>();
    for (const it of items ?? []) {
      if (it.day_index === day && it.meal_type === meal) taken.add(it.food_name.trim().toLowerCase());
    }
    return taken;
  }, [items, day, meal]);

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

  const slots = MEAL_ORDER.slice(0, Math.max(1, Math.min(MEAL_ORDER.length, plan?.meals_per_day ?? 3)));

  const submitPlan = () => {
    if (!name.trim() || createPlan.isPending) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    createPlan.mutate(
      { name: name.trim(), goal, meals_per_day: mealsPerDay },
      {
        onSuccess: (row) => {
          setMadeId(row.id);
          onPlanCreated?.(row.id);
        },
        onError: (e: Error) => Alert.alert('ASCND', e.message),
      },
    );
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
    if (!activeId) return;
    addItem.mutate(
      {
        meal_plan_id: activeId,
        day_index: day,
        meal_type: meal,
        food_name: f.name,
        serving_g: Number(f.serving_g) || 100,
        kcal: Math.round(Number(f.kcal) || 0),
        protein_g: Math.round(Number(f.protein_g) || 0),
        carbs_g: Math.round(Number(f.carbs_g) || 0),
        fat_g: Math.round(Number(f.fat_g) || 0),
        food_item_id: f.id,
      },
      {
        // It stays open: adding one food to a meal is almost never the whole of
        // that meal. Only the query is cleared, so the next search starts from
        // nothing rather than from the last thing added.
        onSuccess: () => {
          setAdded((n) => n + 1);
          setQuery('');
          setDebounced('');
        },
        onError: (e: Error) => Alert.alert('ASCND', e.message),
      },
    );
  };

  /*
    The four steps, and what each one currently says.

    The value rather than the label, once there is one: a step that has been
    decided has no use for the name of the question. Before it is decided the
    label is all there is, so it stands in.
  */
  const steps = [
    { key: 'plan', value: plan?.name ?? i18n.nMealPlanNew, done: !!plan },
    { key: 'day', value: dayLabel(day), done: !!plan },
    { key: 'meal', value: mealLabel(meal), done: !!plan },
    {
      key: 'food',
      value: added > 0 ? i18n.nMpAddedN.replace('{n}', String(added)) : i18n.nMpPickFood,
      done: added > 0,
    },
  ];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.full} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.head}>
          <Text style={styles.title}>{plan ? i18n.nMpAddTitle : i18n.nutritionCreatePlan}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={i18n.a11yClose}
            hitSlop={12}
            onPress={() => {
              Haptics.selectionAsync();
              onClose();
            }}
            style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
            <Icon icon={X} size={18} color={colors.foreground} />
          </Pressable>
        </View>

        {/*
          The progress line.

          Four dots and the rails between them, filling left to right. A rail is
          drawn by the dot it leads into, so the row cannot end on a stub, and
          the first and last keep a transparent one so every dot sits at the
          same place in its column and the row does not lean.
        */}
        <View style={styles.steps}>
          {steps.map((st, i) => (
            <View key={st.key} style={styles.step}>
              <View style={styles.stepTop}>
                <View style={[styles.rail, i === 0 && styles.railClear, steps[i - 1]?.done && styles.railOn]} />
                <View style={[styles.dot, st.done && styles.dotOn]}>
                  {st.done ? <Icon icon={Check} size={10} color={colors.primaryForeground} strokeWidth={3} /> : null}
                </View>
                <View
                  style={[styles.rail, i === steps.length - 1 && styles.railClear, st.done && styles.railOn]}
                />
              </View>
              <Text style={[styles.stepValue, st.done && styles.stepValueOn]} numberOfLines={1}>
                {st.value}
              </Text>
            </View>
          ))}
        </View>

        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag">
          {!plan ? (
            <>
              <Text style={styles.stepHead}>{i18n.nutritionPlanName}</Text>
              <Text style={styles.stepHint}>{i18n.nMpStepPlanHint}</Text>
              <TextInput
                style={styles.input}
                placeholder={i18n.nMpPlanNameEg}
                placeholderTextColor={colors.mutedForeground}
                value={name}
                onChangeText={setName}
                returnKeyType="done"
                onSubmitEditing={submitPlan}
              />

              <Text style={styles.stepHead}>{i18n.settingsGoal}</Text>
              <View style={styles.chipRow}>
                {[
                  { key: 'bulk', label: i18n.goalBulk },
                  { key: 'cut', label: i18n.goalCut },
                  { key: 'maintain', label: i18n.goalMaintain },
                ].map((g) => (
                  <Chip
                    key={g.key}
                    label={g.label}
                    on={goal === g.key}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setGoal(g.key);
                    }}
                  />
                ))}
              </View>

              <Text style={styles.stepHead}>{i18n.nutritionMealsPerDay}</Text>
              <Text style={styles.stepHint}>{i18n.nMpStepSlotsHint}</Text>
              <View style={styles.chipRow}>
                {MEALS_PER_DAY.map((n) => (
                  <Chip
                    key={n}
                    label={`${n} ${i18n.nutritionMeals}`}
                    on={mealsPerDay === n}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setMealsPerDay(n);
                    }}
                  />
                ))}
              </View>
            </>
          ) : (
            <>
              <Text style={styles.stepHead}>{i18n.nMpStepDay}</Text>
              <Text style={styles.stepHint}>{i18n.nMpStepDayHint}</Text>
              <View style={styles.chipRow}>
                {DAYS.map((d) => (
                  <Chip
                    key={d}
                    label={dayLabel(d)}
                    on={day === d}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setDay(d);
                    }}
                  />
                ))}
              </View>

              <Text style={styles.stepHead}>{i18n.nMpStepMeal}</Text>
              <Text style={styles.stepHint}>{i18n.nMpStepMealHint}</Text>
              <View style={styles.chipRow}>
                {slots.map((m) => (
                  <Chip
                    key={m}
                    label={mealLabel(m)}
                    on={meal === m}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setMeal(m);
                    }}
                  />
                ))}
              </View>

              <Text style={styles.stepHead}>{i18n.nMpStepFood}</Text>
              <Text style={styles.stepHint}>{i18n.nMpStepFoodHint}</Text>
              <View style={styles.searchWrap}>
                <Icon icon={Search} size={14} color={colors.mutedForeground} />
                <TextInput
                  style={styles.searchInput}
                  placeholder={i18n.nutritionSearchFood}
                  placeholderTextColor={colors.mutedForeground}
                  value={query}
                  onChangeText={setQuery}
                  autoCorrect={false}
                  returnKeyType="search"
                />
                {query.length > 0 ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={i18n.a11yClearSearch}
                    hitSlop={10}
                    onPress={() => setQuery('')}>
                    <Icon icon={X} size={14} color={colors.mutedForeground} />
                  </Pressable>
                ) : null}
              </View>

              {/*
                Plain views, not a second scroll view. The page scrolls as one
                thing; a list that scrolls inside a page that scrolls is the
                arrangement where neither responds to the flick you made.
              */}
              <View style={styles.results}>
                {debounced.length >= 2 ? (
                  (results ?? []).length > 0 ? (
                    (results ?? []).map((f) => (
                      <FoodRow
                        key={f.id}
                        name={f.name}
                        kcal={Number(f.kcal)}
                        added={alreadyHere.has(f.name.trim().toLowerCase())}
                        i18n={i18n}
                        onAdd={() => addFood(f)}
                      />
                    ))
                  ) : (
                    <Text style={styles.empty}>{i18n.nMpNoMatch.replace('{x}', debounced)}</Text>
                  )
                ) : myFoods && myFoods.length > 0 ? (
                  <>
                    <Text style={styles.pickLabel}>{i18n.nMpFromList}</Text>
                    {myFoods.map((f) => (
                      <FoodRow
                        key={f.id}
                        name={f.name}
                        kcal={Number(f.kcal)}
                        added={alreadyHere.has(f.name.trim().toLowerCase())}
                        i18n={i18n}
                        onAdd={() => addFood({ ...f, serving_g: Number(f.serving_g) || 100 })}
                      />
                    ))}
                  </>
                ) : null}
              </View>
            </>
          )}
        </ScrollView>

        {/*
          One button, and it says what pressing it does next.

          While there is no plan it makes the plan and the flow carries on into
          the same screen — which is the whole point of merging these: creating
          a plan and putting the first food in it were never two errands.
        */}
        <View style={[styles.foot, { paddingBottom: insets.bottom + spacing.sm }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !plan && (!name.trim() || createPlan.isPending) }}
            disabled={!plan && (!name.trim() || createPlan.isPending)}
            onPress={() => {
              if (plan) {
                Haptics.selectionAsync();
                onClose();
              } else {
                submitPlan();
              }
            }}
            style={({ pressed }) => [
              styles.primary,
              !plan && (!name.trim() || createPlan.isPending) && styles.primaryOff,
              pressed && styles.pressed,
            ]}>
            {createPlan.isPending ? (
              <ActivityIndicator color={colors.primaryForeground} size="small" />
            ) : (
              <Text style={styles.primaryText}>
                {!plan
                  ? i18n.nMpNextAddFood
                  : added > 0
                    ? `${i18n.nMpDone}  ·  ${i18n.nMpAddedN.replace('{n}', String(added))}`
                    : i18n.nMpDone}
              </Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      hitSlop={{ top: 6, bottom: 6 }}
      style={[styles.chip, on && styles.chipOn]}
      onPress={onPress}>
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

/**
 * One choosable food.
 *
 * A food already in this meal stays on the list and stops being a button: it
 * dims, its plus becomes a tick, and it says so. Removing it instead would be
 * worse — the row you just tapped would vanish, which reads as a mis-tap.
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
      accessibilityLabel={added ? `${name}, ${i18n.nMpAlready}` : `${name}, ${Math.round(kcal)} kcal`}
      disabled={added}
      style={({ pressed }) => [styles.row, added && styles.rowAdded, pressed && styles.pressedDim]}
      onPress={onAdd}>
      <Text style={styles.rowName} numberOfLines={1}>{name}</Text>
      <Text style={styles.rowKcal}>{added ? i18n.nMpAlready : `${Math.round(kcal)} kcal`}</Text>
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
  full: { flex: 1, backgroundColor: colors.background },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  title: { ...type.title2, color: colors.foreground, flex: 1 },
  close: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.secondary,
  },

  steps: {
    flexDirection: 'row',
    paddingHorizontal: spacing.sm,
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
  railClear: { backgroundColor: 'transparent' },
  stepValue: { ...type.caption, color: colors.mutedForeground },
  stepValueOn: { color: colors.foreground, fontWeight: '600' },

  body: { flex: 1 },
  bodyContent: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.sm },
  /* The question, then what it means. A row of chips is only obviously a
     control once you know what it is choosing between. */
  stepHead: { ...type.footnote, color: colors.foreground, fontWeight: '700', marginTop: spacing.sm },
  stepHint: { ...type.caption, color: colors.mutedForeground, marginBottom: 2 },

  input: {
    height: 46,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.secondary,
    color: colors.foreground,
    fontSize: 15,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.secondary,
  },
  chipOn: { backgroundColor: colors.primary },
  chipText: { ...type.footnote, color: colors.foreground },
  chipTextOn: { color: colors.primaryForeground, fontWeight: '700' },

  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.secondary,
  },
  searchInput: { flex: 1, color: colors.foreground, fontSize: 15 },
  results: { gap: spacing.sm, paddingTop: spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  rowAdded: { opacity: 0.55 },
  rowName: { ...type.body, color: colors.foreground, flex: 1 },
  rowKcal: { ...type.caption, color: colors.mutedForeground },
  pickLabel: { ...type.caption, color: colors.mutedForeground },
  empty: { ...type.footnote, color: colors.mutedForeground, textAlign: 'center', paddingVertical: spacing.md },

  foot: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  primary: {
    height: 50,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  primaryOff: { opacity: 0.4 },
  primaryText: { ...type.body, color: colors.primaryForeground, fontWeight: '700' },
  pressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
  pressedDim: { opacity: 0.8 },
});
