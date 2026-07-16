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
import { useI18n } from '@/hooks/use-app-settings';
import { useAuth } from '@/hooks/use-auth';
import { useInvalidateToday } from '@/hooks/useTodayData';
import { supabase } from '@/integrations/supabase/client';
import { recomputeDailyLog } from '@/lib/daily-log-service';

const RPE_VALUES = [6, 7, 8, 9, 10] as const;

interface SetRow {
  exerciseName: string;
  weight: string; // kept as text for input friendliness
  reps: string;
}

const EMPTY_SET: SetRow = { exerciseName: '', weight: '', reps: '' };

export default function LogWorkoutSheet() {
  const { user } = useAuth();
  const invalidate = useInvalidateToday();
  const i18n = useI18n();
  const [name, setName] = useState('');
  const [rpe, setRpe] = useState<number>(7);
  const [sets, setSets] = useState<SetRow[]>([{ ...EMPTY_SET }]);

  const updateSet = (idx: number, field: keyof SetRow, value: string) => {
    setSets((prev) => prev.map((s, i) => (i === idx ? { ...s, [field]: value } : s)));
  };

  const addSet = () => {
    Haptics.selectionAsync();
    setSets((prev) => {
      const last = prev[prev.length - 1];
      // Duplicate the previous exercise/weight — the common next-set case
      return [...prev, { exerciseName: last?.exerciseName ?? '', weight: last?.weight ?? '', reps: '' }];
    });
  };

  const removeSet = (idx: number) => {
    Haptics.selectionAsync();
    setSets((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev));
  };

  const validSets = sets.filter((s) => Number(s.weight) > 0 && Number(s.reps) > 0);
  const volumeLoad = validSets.reduce((sum, s) => sum + Number(s.weight) * Number(s.reps), 0);

  const save = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not signed in');
      const setsJson = validSets.map((s, i) => ({
        exerciseId: '',
        exerciseName: s.exerciseName.trim() || 'Exercise',
        setIndex: i + 1,
        weight: Number(s.weight),
        reps: Number(s.reps),
        rpe: null,
      }));

      const { error } = await supabase.from('workout_sessions').insert({
        user_id: user.id,
        template_name: name.trim() || 'Workout',
        session_rpe: rpe,
        sets: setsJson,
        volume_load: Math.round(volumeLoad),
        pain_flags: [],
        pr_detected: false,
      });
      if (error) throw error;
      await recomputeDailyLog(user.id, new Date().toISOString().split('T')[0]);
    },
    onSuccess: () => {
      invalidate();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    },
    onError: (e: Error) => Alert.alert('ASCND', e.message),
  });

  const canSave = validSets.length > 0 && !save.isPending;

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
        {sets.map((s, idx) => (
          <View key={idx} style={styles.setRow}>
            <Text style={styles.setIndex}>{idx + 1}</Text>
            <TextInput
              style={[styles.input, styles.setName]}
              placeholder={i18n.nExercise}
              placeholderTextColor={colors.mutedForeground}
              value={s.exerciseName}
              onChangeText={(v) => updateSet(idx, 'exerciseName', v)}
            />
            <TextInput
              style={[styles.input, styles.setNum]}
              placeholder="kg"
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
            <Pressable hitSlop={8} onPress={() => removeSet(idx)} style={styles.removeSet}>
              <Text style={styles.removeText}>✕</Text>
            </Pressable>
          </View>
        ))}

        <Pressable style={({ pressed }) => [styles.addSet, pressed && styles.pressed]} onPress={addSet}>
          <Text style={styles.addSetText}>{i18n.nAddSet}</Text>
        </Pressable>

        <View style={styles.summaryRow}>
          <Text style={styles.sectionLabel}>{i18n.nVolume}</Text>
          <Text style={styles.volume}>
            {volumeLoad > 0 ? `${Math.round(volumeLoad).toLocaleString()} kg` : '—'}
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
            !canSave && styles.saveDisabled,
            pressed && canSave && styles.pressed,
          ]}
          disabled={!canSave}
          onPress={() => save.mutate()}>
          {save.isPending ? (
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
  setNum: { width: 64, paddingHorizontal: spacing.sm, height: 44, textAlign: 'center' },
  removeSet: { width: 24, alignItems: 'center' },
  removeText: { color: colors.mutedForeground, fontSize: 14 },
  addSet: {
    height: 44,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
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
