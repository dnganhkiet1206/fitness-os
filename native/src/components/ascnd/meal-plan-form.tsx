import * as Haptics from 'expo-haptics';
import { X } from 'lucide-react-native';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ascnd/icon';
import { colors, glass, radius, spacing, type } from '@/constants/ascnd';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { useCreateMealPlan } from '@/hooks/use-library';

/**
 * The three questions a new meal plan is made of.
 *
 * ── why it is its own file ──
 *
 * Two screens ask them: the Nutrition tab, where a plan is started, and
 * `/meal-plans`, which is where they are built and edited. The fields are the
 * whole of it — a name, a goal and a number of meals — so a second copy would
 * be quick to write and would then drift in exactly the way that costs
 * something: one screen gaining a field, or a different default, or a
 * different idea of what an empty name means.
 *
 * The form is the component; the *frame* is not. `/meal-plans` opens it inline
 * in a card, where it is one of several things on a page about plans. The
 * Nutrition tab opens it as a sheet over the diary, because that tab is about
 * today's food and a form for next week's does not belong in the flow of it.
 * Same questions, two rooms.
 */

const MEALS_PER_DAY = [3, 4, 5, 6];

export function MealPlanForm({ onCreated }: { onCreated?: (id: string) => void }) {
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const createPlan = useCreateMealPlan();

  const [name, setName] = useState('');
  const [goal, setGoal] = useState('maintain');
  const [mealsPerDay, setMealsPerDay] = useState(3);

  const GOALS = [
    { key: 'bulk', label: i18n.goalBulk },
    { key: 'cut', label: i18n.goalCut },
    { key: 'maintain', label: i18n.goalMaintain },
  ];

  const submit = () => {
    if (!name.trim() || createPlan.isPending) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    createPlan.mutate(
      { name: name.trim(), goal, meals_per_day: mealsPerDay },
      {
        onSuccess: (row) => {
          setName('');
          onCreated?.(row.id);
        },
        onError: (e: Error) => Alert.alert('ASCND', e.message),
      },
    );
  };

  return (
    <>
      <Text style={styles.fieldLabel}>{i18n.nutritionPlanName}</Text>
      <TextInput
        style={styles.input}
        placeholder={lang === 'vi' ? 'VD: Meal Prep Tuần 1' : 'e.g. Meal Prep Week 1'}
        placeholderTextColor={colors.mutedForeground}
        value={name}
        onChangeText={setName}
        returnKeyType="done"
        onSubmitEditing={submit}
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
        accessibilityState={{ disabled: !name.trim() || createPlan.isPending }}
        style={({ pressed }) => [
          styles.submitBtn,
          (!name.trim() || createPlan.isPending) && styles.submitDisabled,
          pressed && name.trim() && !createPlan.isPending && styles.pressed,
        ]}
        disabled={!name.trim() || createPlan.isPending}
        onPress={submit}>
        {createPlan.isPending ? (
          <ActivityIndicator color={colors.primaryForeground} size="small" />
        ) : (
          <Text style={styles.submitText}>{i18n.nutritionCreateBtn}</Text>
        )}
      </Pressable>
    </>
  );
}

/**
 * The same form, as a sheet.
 *
 * Bottom-anchored and keyboard-aware, because the first field is a text input
 * and the whole form is short enough to sit above the keyboard rather than
 * being scrolled around behind it.
 *
 * It closes itself the moment a plan exists. There is nothing to confirm — the
 * plan is in the list behind it — and a sheet that stays open after succeeding
 * is a sheet you have to work out how to leave.
 */
export function MealPlanFormSheet({
  visible,
  onClose,
  onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated?: (id: string) => void;
}) {
  const i18n = useI18n();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.sheetRoot}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(140)} style={StyleSheet.absoluteFill}>
          <Pressable style={StyleSheet.absoluteFill} accessibilityLabel={i18n.cancel} onPress={onClose} />
        </Animated.View>

        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle}>{i18n.nutritionCreatePlan}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={i18n.cancel}
              hitSlop={12}
              onPress={onClose}
              style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
              <Icon icon={X} size={16} color={colors.mutedForeground} />
            </Pressable>
          </View>

          <MealPlanForm
            onCreated={(id) => {
              onClose();
              onCreated?.(id);
            }}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fieldLabel: { ...type.caption, color: colors.mutedForeground, marginTop: spacing.sm, marginBottom: 6 },
  input: {
    height: 44,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.secondary,
    color: colors.foreground,
    fontSize: 15,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    height: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: glass.bg,
    borderWidth: glass.borderWidth,
    borderColor: glass.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { ...type.footnote, color: colors.foreground },
  chipTextActive: { color: colors.primaryForeground, fontWeight: '700' },
  submitBtn: {
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
    backgroundColor: colors.primary,
  },
  submitDisabled: { opacity: 0.4 },
  submitText: { ...type.body, color: colors.primaryForeground, fontWeight: '700' },

  sheetRoot: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(7,7,8,0.6)' },
  sheet: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    backgroundColor: colors.card,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { ...type.title2, color: colors.foreground },
  close: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: glass.bg,
  },
  pressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
});
