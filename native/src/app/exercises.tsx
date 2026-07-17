import * as Haptics from 'expo-haptics';
import { Plus, Trash2 } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { Screen } from '@/components/ascnd/screen';
import { colors, radius, spacing, type } from '@/constants/ascnd';
import { useI18n } from '@/hooks/use-app-settings';
import { useAuth } from '@/hooks/use-auth';
import { useAddExercise, useDeleteExercise, useExercises } from '@/hooks/use-library';

export default function ExercisesScreen() {
  const { data: exercises } = useExercises();
  const { user } = useAuth();
  const addEx = useAddExercise();
  const deleteEx = useDeleteExercise();
  const i18n = useI18n();
  const [search, setSearch] = useState('');

  // Add form (web ExerciseLibrary dialog: name / muscle group / equipment)
  const MUSCLE_GROUPS = [
    i18n.muscleChest, i18n.muscleBack, i18n.muscleShoulders, i18n.muscleBiceps,
    i18n.muscleTriceps, i18n.muscleQuads, i18n.muscleHamstrings, i18n.muscleGlutes,
    i18n.muscleAbs, i18n.muscleFullBody, i18n.muscleCardio,
  ];
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [muscleGroup, setMuscleGroup] = useState(MUSCLE_GROUPS[0]);
  const [equipment, setEquipment] = useState('');

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = (exercises ?? []).filter((e) => !q || e.name.toLowerCase().includes(q));
    const map = new Map<string, typeof filtered>();
    for (const e of filtered) {
      const g = e.muscle_group ?? '—';
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(e);
    }
    return [...map.entries()];
  }, [exercises, search]);

  const submit = () => {
    if (!name.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    addEx.mutate(
      { name: name.trim(), muscle_group: muscleGroup, equipment: equipment.trim() || undefined },
      {
        onSuccess: () => {
          setName('');
          setEquipment('');
          setAdding(false);
        },
        onError: (e: Error) => Alert.alert('ASCND', e.message),
      },
    );
  };

  const confirmDelete = (id: string, exName: string) => {
    Alert.alert('ASCND', `${i18n.delete} "${exName}"?`, [
      { text: i18n.cancel, style: 'cancel' },
      {
        text: i18n.delete,
        style: 'destructive',
        onPress: () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          deleteEx.mutate(id, { onError: (e: Error) => Alert.alert('ASCND', e.message) });
        },
      },
    ]);
  };

  return (
    <Screen back title={i18n.nExercises}>
      <View style={styles.topRow}>
        <TextInput
          style={styles.search}
          placeholder={i18n.nSearchExercises}
          placeholderTextColor={colors.mutedForeground}
          value={search}
          onChangeText={setSearch}
          autoCorrect={false}
        />
        <Pressable
          style={({ pressed }) => [styles.addBtn, pressed && styles.pressed]}
          onPress={() => {
            Haptics.selectionAsync();
            setAdding((v) => !v);
          }}>
          <Icon icon={Plus} size={14} color={colors.primaryForeground} strokeWidth={2.5} />
          <Text style={styles.addBtnText}>{i18n.exercisesAdd}</Text>
        </Pressable>
      </View>

      {adding && (
        <GlassCard style={styles.addCard}>
          <Text style={styles.formTitle}>{i18n.exercisesAddTitle}</Text>

          <Text style={styles.fieldLabel}>{i18n.exercisesName}</Text>
          <TextInput
            style={styles.input}
            placeholder="VD: Bench Press"
            placeholderTextColor={colors.mutedForeground}
            value={name}
            onChangeText={setName}
          />

          <Text style={styles.fieldLabel}>{i18n.exercisesMuscleGroup}</Text>
          <View style={styles.chipWrap}>
            {MUSCLE_GROUPS.map((g) => (
              <Pressable
                key={g}
                style={[styles.chip, muscleGroup === g && styles.chipActive]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setMuscleGroup(g);
                }}>
                <Text style={[styles.chipText, muscleGroup === g && styles.chipTextActive]}>{g}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.fieldLabel}>{i18n.exercisesEquipment}</Text>
          <TextInput
            style={styles.input}
            placeholder="Barbell"
            placeholderTextColor={colors.mutedForeground}
            value={equipment}
            onChangeText={setEquipment}
          />

          <Pressable
            style={({ pressed }) => [
              styles.submitBtn,
              (!name.trim() || addEx.isPending) && styles.submitDisabled,
              pressed && name.trim() && !addEx.isPending && styles.pressed,
            ]}
            disabled={!name.trim() || addEx.isPending}
            onPress={submit}>
            {addEx.isPending ? (
              <ActivityIndicator color={colors.primaryForeground} size="small" />
            ) : (
              <Text style={styles.submitText}>{i18n.exercisesAddBtn}</Text>
            )}
          </Pressable>
        </GlassCard>
      )}

      {grouped.length > 0 ? (
        grouped.map(([group, list]) => (
          <View key={group} style={styles.group}>
            <Text style={styles.groupTitle}>{group}</Text>
            <GlassCard style={styles.groupCard}>
              {list.map((e, i) => (
                <View key={e.id} style={[styles.row, i > 0 && styles.rowBorder]}>
                  <Text style={styles.name} numberOfLines={1}>{e.name}</Text>
                  {e.equipment ? <Text style={styles.equipment}>{e.equipment}</Text> : null}
                  {/* Only user-created exercises are deletable (seeds are shared) */}
                  {e.user_id === user?.id && (
                    <Pressable hitSlop={10} onPress={() => confirmDelete(e.id, e.name)}>
                      <Icon icon={Trash2} size={14} color={colors.mutedForeground} />
                    </Pressable>
                  )}
                </View>
              ))}
            </GlassCard>
          </View>
        ))
      ) : (
        <GlassCard>
          <Text style={styles.name}>{i18n.nNoExercises}</Text>
          <Text style={styles.equipment}>{i18n.nNoExercisesHint}</Text>
        </GlassCard>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: 'row', gap: spacing.sm },
  search: {
    flex: 1,
    height: 44,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
    color: colors.foreground,
    fontSize: 16,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 44,
    paddingHorizontal: spacing.md - 2,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  addBtnText: { fontSize: 12, fontWeight: '600', color: colors.primaryForeground },

  addCard: { gap: spacing.sm },
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
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md - 2,
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

  group: { gap: spacing.sm },
  groupTitle: {
    ...type.footnote,
    color: colors.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  groupCard: { paddingVertical: 4 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm + 4,
  },
  rowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  name: { ...type.body, color: colors.foreground, flex: 1 },
  equipment: { ...type.caption, color: colors.mutedForeground },
  pressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
});
