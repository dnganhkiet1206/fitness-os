import { useMutation } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { Check, Plus, X } from 'lucide-react-native';
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

import { Icon } from '@/components/ascnd/icon';
import { colors, radius, spacing, type } from '@/constants/ascnd';
import { useI18n } from '@/hooks/use-app-settings';
import { useLogWorkoutSession } from '@/hooks/use-fitness-data';
import { useExercises } from '@/hooks/use-library';
import { useUnits } from '@/hooks/use-units';
import { toast } from '@/lib/toast';
import { displayWeight, weightLabel, weightToKg } from '@/lib/units';

const RPE_VALUES = [6, 7, 8, 9, 10] as const;

interface SetRow {
  exerciseId: string;
  exerciseName: string;
  weight: string; // kept as text for input friendliness
  reps: string;
  rpe: string;
}

const EMPTY_SET: SetRow = { exerciseId: '', exerciseName: '', weight: '', reps: '', rpe: '' };

export default function LogWorkoutSheet() {
  const i18n = useI18n();
  const { weight: wUnit } = useUnits();
  const wl = weightLabel(wUnit);
  const [name, setName] = useState('');
  const [rpe, setRpe] = useState<number>(7);
  const [sets, setSets] = useState<SetRow[]>([{ ...EMPTY_SET }]);
  const [focusedRow, setFocusedRow] = useState<number | null>(null);
  const { data: exercises } = useExercises();

  const updateSet = (idx: number, field: keyof SetRow, value: string) => {
    setSets((prev) =>
      prev.map((s, i) => {
        if (i !== idx) return s;
        // Manual typing invalidates a previously picked library exercise
        if (field === 'exerciseName') return { ...s, exerciseName: value, exerciseId: '' };
        return { ...s, [field]: value };
      }),
    );
  };

  const pickExercise = (idx: number, ex: { id: string; name: string }) => {
    Haptics.selectionAsync();
    setSets((prev) => prev.map((s, i) => (i === idx ? { ...s, exerciseId: ex.id, exerciseName: ex.name } : s)));
    setFocusedRow(null);
  };

  // Library suggestions for the focused exercise-name input (web: select from exercises)
  const suggestionsFor = (idx: number) => {
    if (focusedRow !== idx || !exercises || exercises.length === 0) return [];
    const q = sets[idx]?.exerciseName.trim().toLowerCase() ?? '';
    const pool = q.length === 0 ? exercises : exercises.filter((e) => e.name.toLowerCase().includes(q));
    return pool.filter((e) => e.name.toLowerCase() !== q).slice(0, 5);
  };

  const addSet = () => {
    Haptics.selectionAsync();
    setSets((prev) => {
      const last = prev[prev.length - 1];
      // Duplicate the previous exercise/weight — the common next-set case
      return [
        ...prev,
        {
          exerciseId: last?.exerciseId ?? '',
          exerciseName: last?.exerciseName ?? '',
          weight: last?.weight ?? '',
          reps: '',
          rpe: last?.rpe ?? '',
        },
      ];
    });
  };

  const removeSet = (idx: number) => {
    Haptics.selectionAsync();
    setSets((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev));
  };

  const validSets = sets.filter((s) => Number(s.weight) > 0 && Number(s.reps) > 0);
  // Inputs are in the user's unit; volume load is stored in kg
  const volumeLoad = validSets.reduce(
    (sum, s) => sum + weightToKg(Number(s.weight), wUnit) * Number(s.reps),
    0,
  );

  /*
    The write itself lives in `useLogWorkoutSession`, because the week's day
    view finishes a workout too and the insert is the small part of it — the
    volume, the daily-log rebuild and the Today invalidation all have to happen
    the same way from both, and a second copy would drift without erroring.
    This screen's job is turning text fields into kilograms.
  */
  const log = useLogWorkoutSession();
  const save = useMutation({
    mutationFn: () =>
      log.mutateAsync({
        templateName: name,
        sessionRpe: rpe,
        sets: validSets.map((s) => ({
          exerciseId: s.exerciseId,
          exerciseName: s.exerciseName,
          weight: weightToKg(Number(s.weight), wUnit),
          reps: Number(s.reps),
          rpe: Number(s.rpe),
        })),
      }),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
      toast.success(i18n.logWorkoutSaved);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Stays disabled after success so the closing sheet can't double-submit
  const canSave = validSets.length > 0 && !save.isPending && !save.isSuccess;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{i18n.nLogWorkoutTitle}</Text>

        <TextInput
          style={styles.input}
          placeholder={i18n.nWorkoutName}
          placeholderTextColor={colors.mutedForeground}
          value={name}
          onChangeText={setName}
        />

        <Text style={styles.sectionLabel}>{i18n.nSets}</Text>
        {sets.map((s, idx) => {
          const suggestions = suggestionsFor(idx);
          return (
            <View key={idx}>
              <View style={styles.setRow}>
                <Text style={styles.setIndex}>{idx + 1}</Text>
                <TextInput
                  style={[styles.input, styles.setName]}
                  placeholder={i18n.nExercise}
                  placeholderTextColor={colors.mutedForeground}
                  value={s.exerciseName}
                  onChangeText={(v) => updateSet(idx, 'exerciseName', v)}
                  onFocus={() => setFocusedRow(idx)}
                  onBlur={() => setTimeout(() => setFocusedRow((cur) => (cur === idx ? null : cur)), 150)}
                />
                <TextInput
                  style={[styles.input, styles.setNum]}
                  placeholder={wl}
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="decimal-pad"
                  value={s.weight}
                  onChangeText={(v) => updateSet(idx, 'weight', v)}
                />
                <TextInput
                  style={[styles.input, styles.setNum]}
                  placeholder={i18n.nReps}
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="number-pad"
                  value={s.reps}
                  onChangeText={(v) => updateSet(idx, 'reps', v)}
                />
                <TextInput
                  style={[styles.input, styles.setRpe]}
                  placeholder="RPE"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="number-pad"
                  maxLength={2}
                  value={s.rpe}
                  onChangeText={(v) => updateSet(idx, 'rpe', v)}
                />
                <Pressable accessibilityRole="button" accessibilityLabel={i18n.a11yRemove} hitSlop={8} onPress={() => removeSet(idx)} style={styles.removeSet}>
                  <Icon icon={X} size={14} color={colors.mutedForeground} />
                </Pressable>
              </View>
              {/* Library suggestions for the focused row (web: exercise dropdown) */}
              {suggestions.length > 0 && (
                <View style={styles.suggestRow}>
                  {suggestions.map((ex) => (
                    <Pressable
                      key={ex.id}
                      style={({ pressed }) => [styles.suggestChip, pressed && styles.pressed]}
                      onPress={() => pickExercise(idx, ex)}>
                      <Text style={styles.suggestText} numberOfLines={1}>{ex.name}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          );
        })}

        <Pressable style={({ pressed }) => [styles.addSet, pressed && styles.pressed]} onPress={addSet}>
          <Icon icon={Plus} size={15} color={colors.foreground} strokeWidth={2.5} />
          <Text style={styles.addSetText}>{i18n.nAddSet}</Text>
        </Pressable>

        <View style={styles.summaryRow}>
          <Text style={styles.sectionLabel}>{i18n.nVolume}</Text>
          <Text style={styles.volume}>
            {volumeLoad > 0 ? `${Math.round(displayWeight(volumeLoad, wUnit)).toLocaleString()} ${wl}` : '—'}
          </Text>
        </View>

        <Text style={styles.sectionLabel}>{i18n.nRpe}</Text>
        <View style={styles.chips}>
          {RPE_VALUES.map((v) => (
            <Pressable
              key={v}
              onPress={() => {
                Haptics.selectionAsync();
                setRpe(v);
              }}
              style={[styles.chip, rpe === v && styles.chipActive]}>
              <Text style={[styles.chipText, rpe === v && styles.chipTextActive]}>{v}</Text>
            </Pressable>
          ))}
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.saveButton,
            !canSave && !save.isSuccess && styles.saveDisabled,
            pressed && canSave && styles.pressed,
          ]}
          disabled={!canSave}
          onPress={() => save.mutate()}>
          {save.isSuccess ? (
            <Icon icon={Check} size={22} color={colors.primaryForeground} strokeWidth={3} />
          ) : save.isPending ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <Text style={styles.saveText}>{i18n.nSaveWorkout}</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.card },
  content: { padding: spacing.lg, gap: spacing.sm + 4 },
  title: { ...type.title, color: colors.foreground, textAlign: 'center', marginBottom: spacing.sm },
  sectionLabel: { ...type.footnote, color: colors.mutedForeground, marginTop: spacing.xs },
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
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  setIndex: {
    ...type.footnote,
    color: colors.mutedForeground,
    width: 16,
    textAlign: 'center',
  },
  setName: { flex: 1, paddingHorizontal: spacing.sm, height: 44 },
  setNum: { width: 56, paddingHorizontal: spacing.xs, height: 44, textAlign: 'center' },
  setRpe: { width: 48, paddingHorizontal: spacing.xs, height: 44, textAlign: 'center' },
  removeSet: { width: 24, alignItems: 'center' },
  suggestRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
    marginLeft: 24,
  },
  suggestChip: {
    maxWidth: 180,
    paddingHorizontal: spacing.md - 2,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: colors.secondary,
  },
  suggestText: { ...type.caption, color: colors.foreground },
  removeText: { color: colors.mutedForeground, fontSize: 14 },
  addSet: {
    height: 44,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addSetText: { ...type.footnote, fontWeight: '600', color: colors.foreground },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  volume: { ...type.headline, color: colors.foreground },
  chips: { flexDirection: 'row', gap: spacing.sm },
  chip: {
    flex: 1,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: { backgroundColor: colors.primary },
  chipText: { ...type.headline, color: colors.secondaryForeground },
  chipTextActive: { color: colors.primaryForeground },
  saveButton: {
    height: 50,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  saveDisabled: { opacity: 0.4 },
  saveText: { ...type.headline, color: colors.primaryForeground },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
});
