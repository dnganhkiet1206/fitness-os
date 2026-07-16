import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { Plus, Trash2, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
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
import {
  useAddExercise,
  useAddWorkoutTemplate,
  useExercises,
  type TemplateExercise,
} from '@/hooks/use-library';

const TYPES = ['push', 'pull', 'legs', 'upper', 'lower', 'full_body', 'strength', 'hypertrophy', 'cardio', 'custom'];
const MUSCLES = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Quads', 'Hamstrings', 'Glutes', 'Abs', 'Full Body', 'Cardio'];
const EQUIPMENT = ['Barbell', 'Dumbbell', 'Cable', 'Machine', 'Bodyweight', 'Kettlebell', 'Band', 'Other'];

export default function WorkoutBuilderSheet() {
  const i18n = useI18n();
  const { data: exercises } = useExercises();
  const addExercise = useAddExercise();
  const addTemplate = useAddWorkoutTemplate();

  const [name, setName] = useState('');
  const [tType, setTType] = useState('custom');
  const [items, setItems] = useState<TemplateExercise[]>([]);
  const [search, setSearch] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const [cName, setCName] = useState('');
  const [cMuscle, setCMuscle] = useState('Chest');
  const [cEquip, setCEquip] = useState('Barbell');

  const filtered = useMemo(
    () =>
      (exercises ?? [])
        .filter((e) => !search || e.name.toLowerCase().includes(search.toLowerCase()))
        .slice(0, 12),
    [exercises, search],
  );
  const suggestions = useMemo(
    () => (exercises ?? []).filter((e) => !items.some((i) => i.exerciseId === e.id)).slice(0, 10),
    [exercises, items],
  );

  const addEx = (ex: { id: string; name: string }) => {
    Haptics.selectionAsync();
    setItems((prev) => [
      ...prev,
      { exerciseId: ex.id, exerciseName: ex.name, sets: 3, reps: 10, weight: 0, rpe: 7, restSeconds: 90 },
    ]);
    setSearch('');
  };

  const createCustom = async () => {
    if (!cName.trim()) return;
    try {
      const created = await addExercise.mutateAsync({ name: cName.trim(), muscle_group: cMuscle, equipment: cEquip });
      if (created) addEx({ id: created.id, name: created.name });
      setCName('');
      setShowCustom(false);
    } catch (e) {
      Alert.alert('ASCND', e instanceof Error ? e.message : 'Error');
    }
  };

  const updateEx = (idx: number, field: keyof TemplateExercise, value: number) => {
    setItems((prev) => prev.map((e, i) => (i === idx ? { ...e, [field]: value } : e)));
  };
  const removeEx = (idx: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const canSave = name.trim().length > 0 && items.length > 0 && !addTemplate.isPending;
  const save = () => {
    addTemplate.mutate(
      { name: name.trim(), type: tType, exercises: items },
      {
        onSuccess: () => router.back(),
        onError: (e: Error) => Alert.alert('ASCND', e.message),
      },
    );
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{i18n.workoutsCreateTemplate}</Text>

        <TextInput
          style={styles.input}
          placeholder={i18n.nTemplateName}
          placeholderTextColor={colors.mutedForeground}
          value={name}
          onChangeText={setName}
        />

        {/* Type chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {TYPES.map((ty) => (
            <Pressable
              key={ty}
              onPress={() => {
                Haptics.selectionAsync();
                setTType(ty);
              }}
              style={[styles.chip, tType === ty && styles.chipActive]}>
              <Text style={[styles.chipText, tType === ty && styles.chipTextActive]}>{ty.replace('_', ' ')}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Add exercise */}
        <View style={styles.sectionHead}>
          <Text style={styles.sectionLabel}>{i18n.workoutsAddExercise}</Text>
          <Pressable
            style={({ pressed }) => [styles.customToggle, pressed && styles.pressed]}
            onPress={() => {
              Haptics.selectionAsync();
              setShowCustom((s) => !s);
            }}>
            <Icon icon={showCustom ? X : Plus} size={13} color={colors.primary} strokeWidth={2.5} />
            <Text style={styles.customToggleText}>{showCustom ? i18n.nCancel : i18n.nCreateExercise}</Text>
          </Pressable>
        </View>

        {showCustom && (
          <View style={styles.customForm}>
            <TextInput
              style={styles.input}
              placeholder={i18n.nExerciseName}
              placeholderTextColor={colors.mutedForeground}
              value={cName}
              onChangeText={setCName}
            />
            <Text style={styles.miniLabel}>{i18n.nMuscleGroup}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {MUSCLES.map((m) => (
                <Pressable key={m} onPress={() => { Haptics.selectionAsync(); setCMuscle(m); }} style={[styles.chip, cMuscle === m && styles.chipActive]}>
                  <Text style={[styles.chipText, cMuscle === m && styles.chipTextActive]}>{m}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Text style={styles.miniLabel}>{i18n.nEquipment}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {EQUIPMENT.map((eq) => (
                <Pressable key={eq} onPress={() => { Haptics.selectionAsync(); setCEquip(eq); }} style={[styles.chip, cEquip === eq && styles.chipActive]}>
                  <Text style={[styles.chipText, cEquip === eq && styles.chipTextActive]}>{eq}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable
              style={({ pressed }) => [styles.customCreateBtn, (!cName.trim() || addExercise.isPending) && styles.disabled, pressed && styles.pressed]}
              disabled={!cName.trim() || addExercise.isPending}
              onPress={createCustom}>
              {addExercise.isPending ? (
                <ActivityIndicator color={colors.primaryForeground} size="small" />
              ) : (
                <Text style={styles.customCreateText}>{i18n.nCreateExercise}</Text>
              )}
            </Pressable>
          </View>
        )}

        <TextInput
          style={styles.input}
          placeholder={i18n.exercisesSearch}
          placeholderTextColor={colors.mutedForeground}
          value={search}
          onChangeText={setSearch}
          autoCorrect={false}
        />

        {search.length > 0 && (
          filtered.length > 0 ? (
            <View style={styles.results}>
              {filtered.map((e) => (
                <Pressable key={e.id} style={styles.resultRow} onPress={() => addEx(e)}>
                  <Text style={styles.resultName} numberOfLines={1}>{e.name}</Text>
                  {e.muscle_group ? <Text style={styles.resultMeta}>{e.muscle_group}</Text> : null}
                </Pressable>
              ))}
            </View>
          ) : (
            <Pressable
              style={styles.noResults}
              onPress={() => { setCName(search); setShowCustom(true); setSearch(''); }}>
              <Text style={styles.noResultsText}>{i18n.nNoExercisesFound}</Text>
              <View style={styles.noResultsCtaRow}>
                <Icon icon={Plus} size={13} color={colors.primary} strokeWidth={2.5} />
                <Text style={styles.noResultsCta}>{i18n.nCreateExercise}</Text>
              </View>
            </Pressable>
          )
        )}

        {/* Suggestion chips */}
        {search.length === 0 && !showCustom && suggestions.length > 0 && (
          <View>
            <Text style={styles.miniLabel}>{i18n.nSuggestions}</Text>
            <View style={styles.suggestWrap}>
              {suggestions.map((e) => (
                <Pressable key={e.id} style={({ pressed }) => [styles.suggestChip, pressed && styles.pressed]} onPress={() => addEx(e)}>
                  <Text style={styles.suggestText} numberOfLines={1}>{e.name}</Text>
                  <Icon icon={Plus} size={14} color={colors.primary} />
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* Added exercises */}
        {items.length > 0 && (
          <View style={styles.addedWrap}>
            <Text style={styles.sectionLabel}>{i18n.workoutsExercisesAdded} ({items.length})</Text>
            {items.map((ex, idx) => (
              <View key={idx} style={styles.exCard}>
                <View style={styles.exHead}>
                  <Text style={styles.exName} numberOfLines={1}>{ex.exerciseName}</Text>
                  <Pressable hitSlop={8} onPress={() => removeEx(idx)}>
                    <Icon icon={Trash2} size={16} color={colors.mutedForeground} />
                  </Pressable>
                </View>
                <View style={styles.exFields}>
                  <NumField label={i18n.nSets} value={ex.sets} onChange={(v) => updateEx(idx, 'sets', v)} />
                  <NumField label={i18n.nReps} value={ex.reps} onChange={(v) => updateEx(idx, 'reps', v)} />
                  <NumField label="kg" value={ex.weight} onChange={(v) => updateEx(idx, 'weight', v)} />
                  <NumField label="RPE" value={ex.rpe ?? 7} onChange={(v) => updateEx(idx, 'rpe', v)} />
                  <NumField label={i18n.nRestSec} value={ex.restSeconds ?? 90} onChange={(v) => updateEx(idx, 'restSeconds', v)} />
                </View>
              </View>
            ))}
          </View>
        )}

        <Pressable
          style={({ pressed }) => [styles.saveButton, !canSave && styles.disabled, pressed && canSave && styles.pressed]}
          disabled={!canSave}
          onPress={save}>
          {addTemplate.isPending ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <Text style={styles.saveText}>{i18n.workoutsCreateBtn}</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <View style={styles.numField}>
      <Text style={styles.numLabel}>{label}</Text>
      <TextInput
        style={styles.numInput}
        keyboardType="number-pad"
        value={String(value)}
        onChangeText={(t) => onChange(Number(t) || 0)}
        selectTextOnFocus
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.card },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl * 2 },
  title: { ...type.title, color: colors.foreground, textAlign: 'center', marginBottom: spacing.xs },
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
  chips: { gap: spacing.sm, paddingRight: spacing.sm },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.full, backgroundColor: colors.secondary },
  chipActive: { backgroundColor: colors.primary },
  chipText: { ...type.footnote, color: colors.secondaryForeground, textTransform: 'capitalize' },
  chipTextActive: { color: colors.primaryForeground, fontWeight: '600' },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionLabel: { ...type.caption, color: colors.mutedForeground, textTransform: 'uppercase', letterSpacing: 1, fontWeight: '600' },
  customToggle: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.full, backgroundColor: 'rgba(168,178,196,0.12)' },
  noResultsCtaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  customToggleText: { ...type.caption, color: colors.primary, fontWeight: '600' },
  customForm: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.primary, backgroundColor: colors.background },
  miniLabel: { ...type.caption, color: colors.mutedForeground },
  customCreateBtn: { height: 44, borderRadius: radius.full, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: spacing.xs },
  customCreateText: { ...type.footnote, color: colors.primaryForeground, fontWeight: '700' },
  results: { borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.background, overflow: 'hidden' },
  resultRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2 },
  resultName: { ...type.body, color: colors.foreground, flex: 1 },
  resultMeta: { ...type.caption, color: colors.mutedForeground },
  noResults: { alignItems: 'center', gap: 4, paddingVertical: spacing.md },
  noResultsText: { ...type.footnote, color: colors.mutedForeground },
  noResultsCta: { ...type.footnote, color: colors.primary, fontWeight: '600' },
  suggestWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  suggestChip: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: 160, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.full, backgroundColor: colors.secondary },
  suggestText: { ...type.footnote, color: colors.foreground, flexShrink: 1 },
  suggestPlus: { color: colors.primary, fontSize: 14 },
  addedWrap: { gap: spacing.sm },
  exCard: { padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.background, gap: spacing.sm },
  exHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  exName: { ...type.headline, color: colors.foreground, flex: 1 },
  exRemove: { fontSize: 15, padding: 2 },
  exFields: { flexDirection: 'row', gap: spacing.sm },
  numField: { flex: 1, gap: 2 },
  numLabel: { ...type.caption, color: colors.mutedForeground, textAlign: 'center' },
  numInput: {
    height: 40,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.card,
    color: colors.foreground,
    fontSize: 15,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  saveButton: { height: 50, borderRadius: radius.full, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm },
  saveText: { ...type.headline, color: colors.primaryForeground },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
});
