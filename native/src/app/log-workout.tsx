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

const RPE_VALUES = [6, 7, 8, 9, 10] as const;

export default function LogWorkoutSheet() {
  const { user } = useAuth();
  const invalidate = useInvalidateToday();
  const [name, setName] = useState('');
  const [rpe, setRpe] = useState<number>(7);
  const [volume, setVolume] = useState('');

  const save = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not signed in');
      const { error } = await supabase.from('workout_sessions').insert({
        user_id: user.id,
        template_name: name.trim() || 'Workout',
        session_rpe: rpe,
        sets: [],
        volume_load: Math.round(Number(volume) || 0),
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

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Log Workout</Text>

        <TextInput
          style={styles.input}
          placeholder="Workout name (e.g. Push Day)"
          placeholderTextColor={colors.mutedForeground}
          value={name}
          onChangeText={setName}
        />

        <Text style={styles.sectionLabel}>Session effort (RPE)</Text>
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

        <TextInput
          style={styles.input}
          placeholder="Total volume load, kg (optional)"
          placeholderTextColor={colors.mutedForeground}
          keyboardType="number-pad"
          value={volume}
          onChangeText={setVolume}
        />

        <Pressable
          style={({ pressed }) => [
            styles.saveButton,
            save.isPending && styles.saveDisabled,
            pressed && !save.isPending && styles.pressed,
          ]}
          disabled={save.isPending}
          onPress={() => save.mutate()}>
          {save.isPending ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <Text style={styles.saveText}>Save Workout</Text>
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
