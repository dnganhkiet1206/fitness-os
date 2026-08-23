import * as Haptics from 'expo-haptics';
import { useLocalSearchParams } from 'expo-router';
import { Plus, Trash2 } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { PickRow } from '@/components/ascnd/pick-row';
import { PressScale } from '@/components/ascnd/press-scale';
import { GlassCard } from '@/components/ascnd/glass-card';
import { StaggerItem } from '@/components/ascnd/stagger-item';
import { Icon } from '@/components/ascnd/icon';
import { Field, FormSheet } from '@/components/ascnd/form-sheet';
import { LoadFailed } from '@/components/ascnd/load-failed';
import { Screen } from '@/components/ascnd/screen';
import { muscleArtKeysFor, type MuscleArtKey } from '@/lib/muscle-group';
import { EXERCISE_KINDS, isExerciseKind, type ExerciseKind } from '@/lib/exercise-kind';
import { colors, radius, spacing, type } from '@/constants/ascnd';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { useAuth } from '@/hooks/use-auth';
import { useAddExercise, useDeleteExercise, useExercises } from '@/hooks/use-library';

export default function ExercisesScreen() {
  const { data: exercises, isError, refetch, isRefetching } = useExercises();
  const { user } = useAuth();
  const addEx = useAddExercise();
  const deleteEx = useDeleteExercise();
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const [search, setSearch] = useState('');

  // Add form (web ExerciseLibrary dialog: name / muscle group / equipment)
  const MUSCLE_GROUPS = [
    i18n.muscleChest, i18n.muscleBack, i18n.muscleShoulders, i18n.muscleBiceps,
    i18n.muscleTriceps, i18n.muscleQuads, i18n.muscleHamstrings, i18n.muscleGlutes,
    i18n.muscleAbs, i18n.muscleFullBody, i18n.muscleCardio,
  ];
  /*
    Arriving from a muscle tile shows only that muscle; arriving from "see all"
    shows the library as it always was.

    The filter is on the *art key*, not on the group string. `muscle_group` is
    written three different ways for the same shelf — the picker's label, the
    builder's English, and the seed's own spelling — so matching the text would
    show a third of what the tile just counted, and the count and the list would
    disagree on the same screen.

    `create` is the third way in: the workout builder sends whatever was typed
    into its search when nothing matched it, so "no exercise called Hack Squat"
    arrives here as a form already saying Hack Squat. The builder used to carry
    a second copy of this form to do that; one form that two screens reach is
    one set of muscle-group labels, one validation, one place to fix.
  */
  const { group: groupParam, create } = useLocalSearchParams<{ group?: string; create?: string }>();
  const only = groupParam as MuscleArtKey | undefined;

  // Seeded on mount, which is the only moment that matters: this screen is
  // pushed fresh each time, so there is no later render to fight with.
  const [adding, setAdding] = useState(!!create);
  const [name, setName] = useState(create ?? '');
  const [muscleGroup, setMuscleGroup] = useState(MUSCLE_GROUPS[0]);
  const [equipment, setEquipment] = useState('');
  /*
    Starts unset, and unset is a real answer.

    `exercise_kind` decides what the trend engine reads for this movement — an
    estimated one-rep-max for a squat, tonnage for a curl, seconds for a hold.
    Left blank, `lib/exercise-kind.ts` infers, and it says openly that it cannot
    tell a curl from a row. Defaulting the picker to "Compound" would turn that
    honest gap into a claim somebody never made, on every exercise they create.
  */
  const [kind, setKind] = useState<ExerciseKind | null>(null);

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = (exercises ?? [])
      .filter((e) => !only || muscleArtKeysFor(e.muscle_group).includes(only))
      .filter((e) => !q || e.name.toLowerCase().includes(q));
    const map = new Map<string, typeof filtered>();
    for (const e of filtered) {
      const g = e.muscle_group ?? '—';
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(e);
    }
    return [...map.entries()];
  }, [exercises, search, only]);

  const submit = () => {
    if (!name.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    addEx.mutate(
      {
        name: name.trim(),
        muscle_group: muscleGroup,
        equipment: equipment.trim() || undefined,
        ...(kind ? { exercise_kind: kind } : {}),
      },
      {
        onSuccess: () => {
          setName('');
          setEquipment('');
          setKind(null);
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
        <PressScale
          style={styles.addBtn}
          onPress={() => {
            Haptics.selectionAsync();
            setAdding((v) => !v);
          }}>
          <Icon icon={Plus} size={14} color={colors.primaryForeground} strokeWidth={2.5} />
          <Text style={styles.addBtnText}>{i18n.exercisesAdd}</Text>
        </PressScale>
      </View>

      {/*
        The form is a sheet, not a card wedged into the page.

        It used to open in place, above the library — so pressing "thêm bài
        tập" pushed the thing you were looking at down by three hundred points,
        and the list you were adding *to* was what got moved out of the way. A
        form that displaces its own context is a form you fill in blind.

        It also had a title reading "Thêm Bài Tập" directly under a page titled
        "Bài tập", under a button that said the same thing again.

        Now: one sheet, the three questions with what each is for written under
        it, and the button that finishes it pinned where the thumb already is.
        Same frame as the meal-plan flow, from `form-sheet`.
      */}
      <FormSheet
        visible={adding}
        title={i18n.exercisesAddTitle}
        onClose={() => setAdding(false)}
        footer={
          <PressScale
            accessibilityRole="button"
            accessibilityState={{ disabled: !name.trim() || addEx.isPending }}
            style={[styles.submitBtn, (!name.trim() || addEx.isPending) && styles.submitDisabled]}
            disabled={!name.trim() || addEx.isPending}
            onPress={submit}>
            {addEx.isPending ? (
              <ActivityIndicator color={colors.primaryForeground} size="small" />
            ) : (
              <Text style={styles.submitText}>{i18n.exercisesAddBtn}</Text>
            )}
          </PressScale>
        }>
        <Field label={i18n.exercisesName} hint={i18n.nExNameHint}>
          <TextInput
            style={styles.input}
            placeholder={lang === 'vi' ? 'VD: Bench Press' : 'e.g. Bench Press'}
            placeholderTextColor={colors.mutedForeground}
            value={name}
            onChangeText={setName}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={submit}
          />
        </Field>

        <Field label={i18n.exercisesMuscleGroup} hint={i18n.nExGroupHint}>
          <PickRow
            value={muscleGroup}
            fill={colors.primary}
            slotFill={colors.secondary}
            radius={radius.full}
              gap={spacing.sm}
            style={styles.chipWrap}>
            {MUSCLE_GROUPS.map((g) => (
              <PickRow.Item
                key={g}
                itemKey={g}
                accessibilityLabel={g}
                style={styles.chip}
                onPress={() => {
                  Haptics.selectionAsync();
                  setMuscleGroup(g);
                }}>
                <Text style={[styles.chipText, muscleGroup === g && styles.chipTextActive]}>{g}</Text>
              </PickRow.Item>
            ))}
          </PickRow>
        </Field>

        <Field label={i18n.nExKind} hint={i18n.nExKindHint}>
          <PickRow
            value={kind ?? ''}
            fill={colors.primary}
            slotFill={colors.secondary}
            radius={radius.full}
            gap={spacing.sm}
            style={styles.chipWrap}>
            {EXERCISE_KINDS.map((k) => (
              <PickRow.Item
                key={k}
                itemKey={k}
                accessibilityLabel={i18n[`nExKind${k}` as keyof typeof i18n] as string}
                style={styles.chip}
                onPress={() => {
                  Haptics.selectionAsync();
                  /* Tapping the chosen one clears it, so "nobody has said" stays
                     reachable after a mis-tap. Without that, the first tap on
                     this row is irreversible. */
                  setKind((cur) => (cur === k ? null : k));
                }}>
                <Text style={[styles.chipText, kind === k && styles.chipTextActive]}>
                  {i18n[`nExKind${k}` as keyof typeof i18n] as string}
                </Text>
              </PickRow.Item>
            ))}
          </PickRow>
        </Field>

        <Field label={i18n.exercisesEquipment} hint={i18n.nExGearHint}>
          <TextInput
            style={styles.input}
            placeholder="Barbell"
            placeholderTextColor={colors.mutedForeground}
            value={equipment}
            onChangeText={setEquipment}
            returnKeyType="done"
            onSubmitEditing={submit}
          />
        </Field>
      </FormSheet>

      {/* A failed read is not an empty library. The zero branch below would tell
        somebody the exercise list — including the ones they created — is gone,
        which is a statement about their account rather than the network. */}
      {isError ? (
        <LoadFailed i18n={i18n} onRetry={() => void refetch()} busy={isRefetching} />
      ) : grouped.length > 0 ? (
        grouped.map(([group, list], gi) => (
          <StaggerItem key={group} index={gi} style={styles.group}>
            <Text style={styles.groupTitle}>{group}</Text>
            <GlassCard style={styles.groupCard}>
              {list.map((e, i) => (
                <View key={e.id} style={[styles.row, i > 0 && styles.rowBorder]}>
                  <Text style={styles.name} numberOfLines={1}>{e.name}</Text>
                  {/*
                    The declared kind, where the person who declared it can see
                    it. It could be set and could not be read back, which is a
                    setting that has to be taken on trust — and this one decides
                    whether an estimated one-rep-max appears for the movement.

                    Nothing here when it is unset, rather than a word for
                    "unset": the honest state is that nobody has said, and a
                    label for that would be noise on every seeded row.
                  */}
                  {isExerciseKind(e.exercise_kind) ? (
                    <Text style={styles.kind}>
                      {i18n[`nExKind${e.exercise_kind}` as keyof typeof i18n] as string}
                    </Text>
                  ) : null}
                  {e.equipment ? <Text style={styles.equipment}>{e.equipment}</Text> : null}
                  {/* Only user-created exercises are deletable (seeds are shared) */}
                  {e.user_id === user?.id && (
                    <Pressable accessibilityRole="button" accessibilityLabel={i18n.a11yDelete} hitSlop={10} onPress={() => confirmDelete(e.id, e.name)}>
                      <Icon icon={Trash2} size={14} color={colors.mutedForeground} />
                    </Pressable>
                  )}
                </View>
              ))}
            </GlassCard>
          </StaggerItem>
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
  chipWrap: { flexWrap: 'wrap' },
  /* No background and no radius — the row measures this and draws both. */
  chip: {
    paddingHorizontal: spacing.md - 2,
    paddingVertical: spacing.sm,
  },
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
  /* `minWidth: 0` beside the flex: a long exercise name held the row open at
     its own width and pushed the badges off the card — the same failure
     measured on the log sheet's set row. */
  name: { ...type.body, color: colors.foreground, flex: 1, minWidth: 0 },
  equipment: { ...type.caption, color: colors.mutedForeground },
  /* Quieter than the equipment beside it: the equipment is what you look for
     when scanning the list, and this is confirmation of something you set. */
  kind: {
    ...type.caption,
    color: colors.mutedForeground,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingHorizontal: 7,
    paddingVertical: 1,
  },
});
