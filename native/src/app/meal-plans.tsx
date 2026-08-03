import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { ChevronDown, ChevronRight, Plus, Search, Trash2, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated from 'react-native-reanimated';

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
import { supabase } from '@/integrations/supabase/client';

const MEALS_PER_DAY = [3, 4, 5, 6];
const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const;

export default function MealPlansScreen() {
  const { data: plans } = useMealPlans();
  const createPlan = useCreateMealPlan();
  const deletePlan = useDeleteMealPlan();
  const addItem = useAddMealPlanItem();
  const deleteItem = useDeleteMealPlanItem();
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const [openId, setOpenId] = useState<string | null>(null);
  const { data: items } = useMealPlanItems(openId);

  // Add-food panel (per open plan): day + meal type + food search
  const [addOpen, setAddOpen] = useState(false);
  const [addDay, setAddDay] = useState(0);
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
    })[m] ?? m;

  const addFood = (f: {
    id: string;
    name: string;
    kcal: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    serving_g: number;
  }) => {
    if (!openId) return;
    addItem.mutate(
      {
        meal_plan_id: openId,
        day_index: addDay,
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

  const dayLabel = (idx: number) => `${i18n.nDay} ${idx + 1}`;

  const groupedItems = (items ?? []).reduce<Record<number, typeof items>>((acc, it) => {
    (acc[it.day_index] ??= []).push(it);
    return acc;
  }, {});

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
        plans.map((p, pi) => (
          <Animated.View key={p.id} style={styles.planBlock} entering={rise(pi)}>
            <Pressable
              onPress={() => {
                Haptics.selectionAsync();
                const next = openId === p.id ? null : p.id;
                setOpenId(next);
                setAddOpen(false);
                setFoodQuery('');
                setFoodDebounced('');
              }}>
              <GlassCard>
                <View style={styles.planRow}>
                  <View style={styles.planInfo}>
                    <Text style={styles.title}>{p.name}</Text>
                    <Text style={styles.hint}>
                      {[goalLabel(p.goal), p.meals_per_day ? `${p.meals_per_day} ${i18n.nMealsPerDay}` : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  </View>
                  <Pressable accessibilityRole="button" accessibilityLabel={i18n.a11yDelete} hitSlop={10} onPress={() => confirmDelete(p.id, p.name)}>
                    <Icon icon={Trash2} size={16} color={colors.mutedForeground} />
                  </Pressable>
                  <Icon icon={openId === p.id ? ChevronDown : ChevronRight} size={20} color={colors.mutedForeground} />
                </View>
              </GlassCard>
            </Pressable>

            {openId === p.id && (
              <>
                {Object.entries(groupedItems).map(([day, dayItems]) => (
                  <GlassCard key={day} style={styles.dayCard}>
                    <Text style={styles.dayTitle}>{dayLabel(Number(day))}</Text>
                    {(dayItems ?? []).map((it) => (
                      <View key={it.id} style={styles.itemRow}>
                        <Text style={styles.itemName} numberOfLines={1}>
                          {it.meal_type ? `${mealLabel(it.meal_type)} · ` : ''}{it.food_name}
                        </Text>
                        <Text style={styles.itemKcal}>{Math.round(Number(it.kcal))} kcal</Text>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={i18n.a11yRemove}
                          hitSlop={8}
                          onPress={() => deleteItem.mutate({ id: it.id, planId: p.id })}>
                          <Icon icon={X} size={14} color={colors.mutedForeground} />
                        </Pressable>
                      </View>
                    ))}
                  </GlassCard>
                ))}

                {/* Add-food panel (web: food search + day/meal type) */}
                <GlassCard style={styles.dayCard}>
                  {!addOpen ? (
                    <Pressable
                      style={({ pressed }) => [styles.addFoodBtn, pressed && styles.pressed]}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setAddOpen(true);
                      }}>
                      <Icon icon={Plus} size={14} color={colors.primary} strokeWidth={2.5} />
                      <Text style={styles.addFoodText}>{lang === 'vi' ? 'Thêm món' : 'Add food'}</Text>
                    </Pressable>
                  ) : (
                    <View style={styles.addPanel}>
                      {/* Day chips (7-day plan) */}
                      <View style={styles.chipRow}>
                        {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                          <Pressable
                            key={d}
                            style={[styles.miniChip, addDay === d && styles.chipActive]}
                            onPress={() => { Haptics.selectionAsync(); setAddDay(d); }}>
                            <Text style={[styles.miniChipText, addDay === d && styles.chipTextActive]}>
                              {dayLabel(d)}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                      {/* Meal type chips */}
                      <View style={styles.chipRow}>
                        {MEAL_TYPES.map((m) => (
                          <Pressable
                            key={m}
                            style={[styles.miniChip, addMeal === m && styles.chipActive]}
                            onPress={() => { Haptics.selectionAsync(); setAddMeal(m); }}>
                            <Text style={[styles.miniChipText, addMeal === m && styles.chipTextActive]}>
                              {mealLabel(m)}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                      {/* Food search */}
                      <View style={styles.searchWrap}>
                        <Icon icon={Search} size={14} color={colors.mutedForeground} />
                        <TextInput
                          style={styles.searchInput}
                          placeholder={i18n.nutritionSearchFood}
                          placeholderTextColor={colors.mutedForeground}
                          value={foodQuery}
                          onChangeText={setFoodQuery}
                          autoCorrect={false}
                        />
                        <Pressable accessibilityRole="button" accessibilityLabel={i18n.a11yClose} hitSlop={8} onPress={() => { Haptics.selectionAsync(); setAddOpen(false); setFoodQuery(''); }}>
                          <Icon icon={X} size={15} color={colors.mutedForeground} />
                        </Pressable>
                      </View>
                      {/* Searching → results; otherwise pick from your food
                          list (web: choose from list or search) */}
                      {foodDebounced.length >= 2
                        ? (foodResults ?? []).map((f) => (
                            <Pressable
                              key={f.id}
                              style={({ pressed }) => [styles.resultRow, pressed && styles.pressedDim]}
                              onPress={() => addFood(f)}>
                              <Text style={styles.resultName} numberOfLines={1}>{f.name}</Text>
                              <Text style={styles.resultKcal}>{Math.round(Number(f.kcal))} kcal</Text>
                              <Icon icon={Plus} size={14} color={colors.primary} strokeWidth={2.5} />
                            </Pressable>
                          ))
                        : (myFoods && myFoods.length > 0 ? (
                            <>
                              <Text style={styles.pickLabel}>
                                {lang === 'vi' ? 'Từ danh sách của bạn' : 'From your list'}
                              </Text>
                              {myFoods.map((f) => (
                                <Pressable
                                  key={f.id}
                                  style={({ pressed }) => [styles.resultRow, pressed && styles.pressedDim]}
                                  onPress={() => addFood({ ...f, serving_g: Number(f.serving_g) || 100 })}>
                                  <Text style={styles.resultName} numberOfLines={1}>{f.name}</Text>
                                  <Text style={styles.resultKcal}>{Math.round(Number(f.kcal))} kcal</Text>
                                  <Icon icon={Plus} size={14} color={colors.primary} strokeWidth={2.5} />
                                </Pressable>
                              ))}
                            </>
                          ) : null)}
                    </View>
                  )}
                </GlassCard>
              </>
            )}
          </Animated.View>
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
  planInfo: { flex: 1, minWidth: 0 },
  title: { ...type.headline, color: colors.foreground },
  hint: { ...type.footnote, color: colors.mutedForeground, marginTop: 2, textTransform: 'capitalize' },
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
  pressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
  pressedDim: { opacity: 0.6, transform: [{ scale: 0.98 }] },

  addFoodBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 4 },
  addFoodText: { fontSize: 13, fontWeight: '600', color: colors.primary },
  addPanel: { gap: spacing.sm },
  miniChip: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: colors.secondary,
  },
  miniChipText: { fontSize: 11, color: colors.secondaryForeground },
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
  resultName: { ...type.footnote, color: colors.foreground, flex: 1 },
  resultKcal: { ...type.caption, color: colors.mutedForeground },
  pickLabel: {
    ...type.caption,
    color: colors.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: spacing.xs,
  },
});
