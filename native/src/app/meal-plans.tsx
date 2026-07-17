import * as Haptics from 'expo-haptics';
import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { Screen } from '@/components/ascnd/screen';
import { colors, radius, spacing, type } from '@/constants/ascnd';
import { useI18n } from '@/hooks/use-app-settings';
import { useCreateMealPlan, useDeleteMealPlan, useMealPlanItems, useMealPlans } from '@/hooks/use-library';

const MEALS_PER_DAY = [3, 4, 5, 6];

export default function MealPlansScreen() {
  const { data: plans } = useMealPlans();
  const createPlan = useCreateMealPlan();
  const deletePlan = useDeleteMealPlan();
  const i18n = useI18n();
  const [openId, setOpenId] = useState<string | null>(null);
  const { data: items } = useMealPlanItems(openId);

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
            placeholder="VD: Meal Prep Tuần 1"
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
                  <Pressable hitSlop={10} onPress={() => confirmDelete(p.id, p.name)}>
                    <Icon icon={Trash2} size={16} color={colors.mutedForeground} />
                  </Pressable>
                  <Icon icon={openId === p.id ? ChevronDown : ChevronRight} size={20} color={colors.mutedForeground} />
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
});
