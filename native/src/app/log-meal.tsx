import { useMutation } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { colors, radius, spacing, type } from '@/constants/ascnd';
import { useAuth } from '@/hooks/use-auth';
import { useInvalidateToday } from '@/hooks/useTodayData';
import { supabase } from '@/integrations/supabase/client';
import { recomputeDailyLog } from '@/lib/daily-log-service';

const MEAL_TYPES = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' },
  { key: 'snack', label: 'Snack' },
] as const;

type MealType = (typeof MEAL_TYPES)[number]['key'];

export default function LogMealSheet() {
  const { user } = useAuth();
  const invalidate = useInvalidateToday();
  const [mealType, setMealType] = useState<MealType>('lunch');
  const [name, setName] = useState('');
  const [kcal, setKcal] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');

  const save = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not signed in');
      const kcalN = Math.round(Number(kcal) || 0);
      const proteinN = Math.round(Number(protein) || 0);
      const carbsN = Math.round(Number(carbs) || 0);
      const fatN = Math.round(Number(fat) || 0);

      const { data: entry, error } = await supabase
        .from('meal_entries')
        .insert({
          user_id: user.id,
          meal_type: mealType,
          total_kcal: kcalN,
          total_protein_g: proteinN,
          total_carbs_g: carbsN,
          total_fat_g: fatN,
          total_fiber_g: 0,
        })
        .select('id')
        .single();
      if (error) throw error;

      if (name.trim()) {
        await supabase.from('meal_entry_items').insert({
          meal_entry_id: entry.id,
          food_item_id: null,
          food_name: name.trim(),
          servings: 1,
          kcal: kcalN,
          protein_g: proteinN,
          carbs_g: carbsN,
          fat_g: fatN,
          fiber_g: 0,
        });
      }

      await recomputeDailyLog(user.id, new Date().toISOString().split('T')[0]);
    },
    onSuccess: () => {
      invalidate();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    },
    onError: (e: Error) => {
      Alert.alert('ASCND', e.message);
    },
  });

  const canSave = Number(kcal) > 0 && !save.isPending;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Log Meal</Text>

        <View style={styles.chips}>
          {MEAL_TYPES.map(({ key, label }) => (
            <Pressable
              key={key}
              onPress={() => {
                Haptics.selectionAsync();
                setMealType(key);
              }}
              style={[styles.chip, mealType === key && styles.chipActive]}>
              <Text style={[styles.chipText, mealType === key && styles.chipTextActive]}>
                {label}
              </Text>
            </Pressable>
          ))}
        </View>

        <TextInput
          style={styles.input}
          placeholder="What did you eat? (optional)"
          placeholderTextColor={colors.mutedForeground}
          value={name}
          onChangeText={setName}
        />
        <TextInput
          style={styles.input}
          placeholder="Calories (kcal)"
          placeholderTextColor={colors.mutedForeground}
          keyboardType="number-pad"
          value={kcal}
          onChangeText={setKcal}
        />
        <View style={styles.row}>
          <TextInput
            style={[styles.input, styles.third]}
            placeholder="Protein g"
            placeholderTextColor={colors.mutedForeground}
            keyboardType="number-pad"
            value={protein}
            onChangeText={setProtein}
          />
          <TextInput
            style={[styles.input, styles.third]}
            placeholder="Carbs g"
            placeholderTextColor={colors.mutedForeground}
            keyboardType="number-pad"
            value={carbs}
            onChangeText={setCarbs}
          />
          <TextInput
            style={[styles.input, styles.third]}
            placeholder="Fat g"
            placeholderTextColor={colors.mutedForeground}
            keyboardType="number-pad"
            value={fat}
            onChangeText={setFat}
          />
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.saveButton,
            !canSave && styles.saveDisabled,
            pressed && canSave && styles.pressed,
          ]}
          disabled={!canSave}
          onPress={() => save.mutate()}>
          {save.isPending ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <Text style={styles.saveText}>Save Meal</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.card,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.sm + 4,
  },
  title: {
    ...type.title,
    color: colors.foreground,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  chips: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.secondary,
  },
  chipActive: {
    backgroundColor: colors.primary,
  },
  chipText: {
    ...type.footnote,
    color: colors.secondaryForeground,
  },
  chipTextActive: {
    color: colors.primaryForeground,
    fontWeight: '600',
  },
  input: {
    height: 48,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    color: colors.foreground,
    fontSize: 16,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  third: {
    flex: 1,
    paddingHorizontal: spacing.sm,
  },
  saveButton: {
    height: 50,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  saveDisabled: {
    opacity: 0.4,
  },
  saveText: {
    ...type.headline,
    color: colors.primaryForeground,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
});
