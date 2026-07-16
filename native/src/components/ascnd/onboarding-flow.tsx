import DateTimePicker from '@react-native-community/datetimepicker';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, spacing, type } from '@/constants/ascnd';
import { useAuth } from '@/hooks/use-auth';
import { supabase } from '@/integrations/supabase/client';
import {
  calcAge,
  calcBMR,
  calcMacros,
  calcTargetCalories,
  calcTDEE,
  calcWaterTarget,
} from '@/lib/fitness-calc';

const SEXES = [
  { key: 'male', label: 'Male' },
  { key: 'female', label: 'Female' },
  { key: 'other', label: 'Other' },
] as const;

const GOALS = [
  { key: 'cut', label: 'Lose fat' },
  { key: 'maintain', label: 'Maintain' },
  { key: 'recomp', label: 'Recomp' },
  { key: 'bulk', label: 'Build muscle' },
  { key: 'strength', label: 'Strength' },
  { key: 'endurance', label: 'Endurance' },
] as const;

const ACTIVITY = [
  { key: 'sedentary', label: 'Sedentary' },
  { key: 'light', label: 'Light' },
  { key: 'moderate', label: 'Moderate' },
  { key: 'high', label: 'High' },
  { key: 'athlete', label: 'Athlete' },
] as const;

const TRAINING = [
  { key: 'beginner', label: 'Beginner' },
  { key: 'intermediate', label: 'Intermediate' },
  { key: 'advanced', label: 'Advanced' },
] as const;

const TOTAL_STEPS = 4;

function timeToHHMM(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function OnboardingFlow() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [sex, setSex] = useState<(typeof SEXES)[number]['key']>('male');
  const [dob, setDob] = useState(new Date(2000, 0, 1));
  const [heightCm, setHeightCm] = useState('170');
  const [weightKg, setWeightKg] = useState('70');
  const [goal, setGoal] = useState<(typeof GOALS)[number]['key']>('maintain');
  const [activity, setActivity] = useState<(typeof ACTIVITY)[number]['key']>('moderate');
  const [training, setTraining] = useState<(typeof TRAINING)[number]['key']>('intermediate');
  const [bedtime, setBedtime] = useState(new Date(2000, 0, 1, 23, 0));
  const [waketime, setWaketime] = useState(new Date(2000, 0, 1, 7, 0));

  const next = () => {
    Haptics.selectionAsync();
    setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1));
  };
  const back = () => {
    Haptics.selectionAsync();
    setStep((s) => Math.max(s - 1, 0));
  };

  const finish = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not signed in');
      const w = Number(weightKg) || 70;
      const h = Number(heightCm) || 170;
      const dobStr = dob.toISOString().split('T')[0];
      const age = calcAge(dobStr);
      const bmr = calcBMR(w, h, age, sex);
      const tdee = calcTDEE(bmr, activity);
      const targetKcal = calcTargetCalories(tdee, goal);
      const macros = calcMacros(targetKcal, w, goal);

      const bedMin = bedtime.getHours() * 60 + bedtime.getMinutes();
      const wakeMin = waketime.getHours() * 60 + waketime.getMinutes();
      let diff = wakeMin - bedMin;
      if (diff <= 0) diff += 24 * 60;
      const sleepHours = Math.round((diff / 60) * 10) / 10;

      const { error } = await supabase.from('profiles').upsert(
        {
          user_id: user.id,
          name: name.trim() || 'Athlete',
          sex,
          dob: dobStr,
          height_cm: h,
          weight_kg: w,
          goal,
          activity_level: activity,
          training_level: training,
          tdee_target_kcal: targetKcal,
          macro_protein_g: macros.protein_g,
          macro_carbs_g: macros.carbs_g,
          macro_fat_g: macros.fat_g,
          macro_fiber_g: macros.fiber_g,
          water_target_ml: calcWaterTarget(w),
          sleep_target_hours: sleepHours,
          sleep_target_bedtime: timeToHHMM(bedtime),
          sleep_target_waketime: timeToHHMM(waketime),
          onboarding_completed: true,
        },
        { onConflict: 'user_id' },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ['profile', user?.id] });
    },
    onError: (e: Error) => Alert.alert('ASCND', e.message),
  });

  const canContinue =
    step === 0 ? name.trim().length > 0 : step === 1 ? Number(heightCm) > 0 && Number(weightKg) > 0 : true;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.lg },
        ]}
        keyboardShouldPersistTaps="handled">
        <View style={styles.dots}>
          {Array.from({ length: TOTAL_STEPS }, (_, i) => (
            <View key={i} style={[styles.dot, i === step && styles.dotActive, i < step && styles.dotDone]} />
          ))}
        </View>

        {step === 0 && (
          <View style={styles.stepBody}>
            <Text style={styles.stepTitle}>Welcome to ASCND</Text>
            <Text style={styles.stepHint}>Let's set up your profile</Text>
            <TextInput
              style={styles.input}
              placeholder="Your name"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="words"
              value={name}
              onChangeText={setName}
            />
            <Text style={styles.fieldLabel}>Sex</Text>
            <ChipRow options={SEXES} value={sex} onChange={setSex} />
          </View>
        )}

        {step === 1 && (
          <View style={styles.stepBody}>
            <Text style={styles.stepTitle}>Your body</Text>
            <Text style={styles.stepHint}>Used to calculate your daily targets</Text>
            <View style={styles.rowFields}>
              <View style={styles.halfField}>
                <Text style={styles.fieldLabel}>Height (cm)</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="number-pad"
                  value={heightCm}
                  onChangeText={setHeightCm}
                />
              </View>
              <View style={styles.halfField}>
                <Text style={styles.fieldLabel}>Weight (kg)</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="decimal-pad"
                  value={weightKg}
                  onChangeText={setWeightKg}
                />
              </View>
            </View>
            <Text style={styles.fieldLabel}>Date of birth</Text>
            <View style={styles.pickerWrap}>
              <DateTimePicker
                value={dob}
                mode="date"
                display="spinner"
                themeVariant="dark"
                maximumDate={new Date()}
                onChange={(_, d) => d && setDob(d)}
              />
            </View>
          </View>
        )}

        {step === 2 && (
          <View style={styles.stepBody}>
            <Text style={styles.stepTitle}>Your goal</Text>
            <Text style={styles.stepHint}>We'll tune calories and macros to match</Text>
            <ChipRow options={GOALS} value={goal} onChange={setGoal} wrap />
            <Text style={styles.fieldLabel}>Daily activity</Text>
            <ChipRow options={ACTIVITY} value={activity} onChange={setActivity} wrap />
            <Text style={styles.fieldLabel}>Training experience</Text>
            <ChipRow options={TRAINING} value={training} onChange={setTraining} />
          </View>
        )}

        {step === 3 && (
          <View style={styles.stepBody}>
            <Text style={styles.stepTitle}>Sleep schedule</Text>
            <Text style={styles.stepHint}>Readiness starts with recovery</Text>
            <View style={styles.rowFields}>
              <View style={styles.halfField}>
                <Text style={styles.fieldLabel}>Bedtime</Text>
                <View style={styles.pickerWrap}>
                  <DateTimePicker
                    value={bedtime}
                    mode="time"
                    display="spinner"
                    themeVariant="dark"
                    onChange={(_, d) => d && setBedtime(d)}
                  />
                </View>
              </View>
              <View style={styles.halfField}>
                <Text style={styles.fieldLabel}>Wake up</Text>
                <View style={styles.pickerWrap}>
                  <DateTimePicker
                    value={waketime}
                    mode="time"
                    display="spinner"
                    themeVariant="dark"
                    onChange={(_, d) => d && setWaketime(d)}
                  />
                </View>
              </View>
            </View>
          </View>
        )}

        <View style={styles.nav}>
          {step > 0 ? (
            <Pressable style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]} onPress={back}>
              <Text style={styles.backText}>Back</Text>
            </Pressable>
          ) : (
            <View style={styles.backBtn} />
          )}
          <Pressable
            style={({ pressed }) => [
              styles.nextBtn,
              !canContinue && styles.disabled,
              pressed && canContinue && styles.pressed,
            ]}
            disabled={!canContinue || finish.isPending}
            onPress={() => (step === TOTAL_STEPS - 1 ? finish.mutate() : next())}>
            {finish.isPending ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <Text style={styles.nextText}>{step === TOTAL_STEPS - 1 ? 'Finish' : 'Continue'}</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function ChipRow<T extends string>({
  options,
  value,
  onChange,
  wrap,
}: {
  options: readonly { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  wrap?: boolean;
}) {
  return (
    <View style={[styles.chips, wrap && styles.chipsWrap]}>
      {options.map(({ key, label }) => (
        <Pressable
          key={key}
          onPress={() => {
            Haptics.selectionAsync();
            onChange(key);
          }}
          style={[styles.chip, wrap && styles.chipWrap, value === key && styles.chipActive]}>
          <Text style={[styles.chipText, value === key && styles.chipTextActive]}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, paddingHorizontal: spacing.lg, gap: spacing.lg },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.secondary },
  dotActive: { backgroundColor: colors.primary, transform: [{ scale: 1.25 }] },
  dotDone: { backgroundColor: colors.primary, opacity: 0.5 },
  stepBody: { flex: 1, gap: spacing.md },
  stepTitle: { ...type.largeTitle, color: colors.foreground },
  stepHint: { ...type.body, color: colors.mutedForeground, marginTop: -spacing.sm },
  fieldLabel: { ...type.footnote, color: colors.mutedForeground },
  input: {
    height: 48,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
    color: colors.foreground,
    fontSize: 16,
  },
  rowFields: { flexDirection: 'row', gap: spacing.md },
  halfField: { flex: 1, gap: spacing.sm },
  pickerWrap: {
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
    alignItems: 'center',
  },
  chips: { flexDirection: 'row', gap: spacing.sm },
  chipsWrap: { flexWrap: 'wrap' },
  chip: {
    flex: 1,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  chipWrap: { flexBasis: '30%', flexGrow: 1 },
  chipActive: { backgroundColor: colors.primary },
  chipText: { ...type.footnote, fontWeight: '600', color: colors.secondaryForeground },
  chipTextActive: { color: colors.primaryForeground },
  nav: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  backBtn: { flex: 1, height: 50, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  backText: { ...type.headline, color: colors.mutedForeground },
  nextBtn: {
    flex: 2,
    height: 50,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextText: { ...type.headline, color: colors.primaryForeground },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
});
