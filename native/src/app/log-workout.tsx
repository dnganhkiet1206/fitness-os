import { useMutation } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { CalendarDays, Check, Plus, X } from 'lucide-react-native';
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

import { PressScale } from '@/components/ascnd/press-scale';
import { Icon } from '@/components/ascnd/icon';
import type { TplExercise } from '@/components/ascnd/template-list';
import { colors, glass, radius, spacing, type } from '@/constants/ascnd';
import { useI18n } from '@/hooks/use-app-settings';
import { useLogWorkoutSession } from '@/hooks/use-fitness-data';
import { useExercises, useRoutineDays, useWorkoutTemplates } from '@/hooks/use-library';
import { useUnits } from '@/hooks/use-units';
import { toast } from '@/lib/toast';
import { effortRange } from '@/lib/prescription';
import { localDateStr, routineIndex } from '@/lib/local-date';
import { displayWeight, weightLabel, weightToKg, type WeightUnit } from '@/lib/units';

const RPE_VALUES = [6, 7, 8, 9, 10] as const;

interface SetRow {
  exerciseId: string;
  exerciseName: string;
  weight: string; // kept as text for input friendliness
  reps: string;
}

const EMPTY_SET: SetRow = { exerciseId: '', exerciseName: '', weight: '', reps: '' };

/**
 * Turn today's planned workout into the rows you are about to fill in.
 *
 * One row per *set*, not one per exercise, because that is what this sheet
 * records and what actually varies: the third set of a five-set squat is the
 * one that came in two reps light, and a form that cannot say so is a form
 * people stop trusting.
 *
 * A planned weight of zero arrives blank rather than as `0`. Bodyweight work
 * has no load to prefill, and `0` in a numeric field reads as a value somebody
 * entered — it would be saved as a real zero-kilo set if it were left alone.
 */
function rowsFromTemplate(exercises: TplExercise[], unit: WeightUnit): SetRow[] {
  const rows: SetRow[] = [];
  for (const ex of exercises) {
    // free JSON on the template row — a hand-written number can be anything
    const count = Math.max(1, Math.min(20, Math.round(ex.sets ?? 1)));
    for (let i = 0; i < count; i++) {
      rows.push({
        exerciseId: '',
        exerciseName: ex.exerciseName ?? '',
        weight: ex.weight ? String(displayWeight(ex.weight, unit)) : '',
        reps: ex.reps ? String(ex.reps) : '',
      });
    }
  }
  return rows.length > 0 ? rows : [{ ...EMPTY_SET }];
}

export default function LogWorkoutSheet() {
  const i18n = useI18n();
  const { weight: wUnit } = useUnits();
  const wl = weightLabel(wUnit);
  const [name, setName] = useState('');
  const [rpe, setRpe] = useState<number>(7);
  const [sets, setSets] = useState<SetRow[]>([{ ...EMPTY_SET }]);
  const [focusedRow, setFocusedRow] = useState<number | null>(null);
  const { data: exercises } = useExercises();

  /*
    What the week says today is.

    This sheet knew nothing about the schedule, which made the two halves of
    the app strangers: the routine could say today is Push Day with six
    exercises, and logging it still meant typing the name and eighteen rows
    from scratch. Meanwhile a session saved here *does* turn that day green on
    the week — the link ran one way and only one way.

    It is offered, not applied. Filling the form the moment it opens would be
    the app deciding what you did, and this sheet exists precisely for the
    times what you did is not what was planned. One chip, one tap, and it is
    gone once it has been used.
  */
  const { data: routineDays } = useRoutineDays();
  const { data: templates } = useWorkoutTemplates();
  const [planUsed, setPlanUsed] = useState(false);
  const todaysPlan = (() => {
    if (planUsed) return null;
    const today = routineDays?.find((d) => d.day_of_week === routineIndex(new Date()));
    if (!today?.template_id || today.is_rest) return null;
    return templates?.find((t) => t.id === today.template_id) ?? null;
  })();

  const usePlan = () => {
    if (!todaysPlan) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const exs: TplExercise[] = Array.isArray(todaysPlan.exercises)
      ? (todaysPlan.exercises as TplExercise[])
      : [];
    setName(todaysPlan.name);
    setSets(rowsFromTemplate(exs, wUnit));
    const effort = effortRange(exs);
    if (effort) setRpe(Math.max(RPE_VALUES[0], Math.min(RPE_VALUES[RPE_VALUES.length - 1], effort[1])));
    setPlanUsed(true);
  };

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
        },
      ];
    });
  };

  /** A blank row — the next *exercise*, where `addSet` gives the next set. */
  const addExercise = () => {
    Haptics.selectionAsync();
    setSets((prev) => [...prev, { ...EMPTY_SET }]);
  };

  const removeSet = (idx: number) => {
    Haptics.selectionAsync();
    setSets((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev));
  };

  /*
    Reps are the test, and weight is not.

    It used to require both, so a set with no load was dropped on save without
    a word: pull-ups, dips, planks, anything done with your own body could be
    typed in, saved, and simply not be there afterwards. An empty weight box is
    not an unfinished row — it is what bodyweight work looks like.

    Volume is unaffected by the change. A bodyweight set contributes
    `0 × reps = 0` to the load, which is what volume load means; what it gains
    is a session that says the set happened.
  */
  const validSets = sets.filter((s) => Number(s.reps) > 0);
  // Inputs are in the user's unit; volume load is stored in kg
  const volumeLoad = validSets.reduce(
    (sum, s) => sum + weightToKg(Number(s.weight) || 0, wUnit) * Number(s.reps),
    0,
  );

  /**
   * Which set of its exercise each row is.
   *
   * The number down the left was the row's position in the whole form, so the
   * last set of the third exercise was "9" — a number that counts something
   * nobody is counting. Within its exercise it is "3 of squats", which is what
   * you would say out loud.
   *
   * A run ends when the name changes, so it also marks where one exercise stops
   * and the next starts: `1` on any row but the first is the boundary, and the
   * rule above it is drawn from the same fact rather than from a second guess.
   */
  const setNumbers = useMemo(() => {
    const out: number[] = [];
    let n = 0;
    let prev: string | null = null;
    for (const row of sets) {
      const key = row.exerciseName.trim().toLowerCase();
      if (key !== prev) {
        n = 0;
        prev = key;
      }
      out.push(++n);
    }
    return out;
  }, [sets]);

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
          weight: weightToKg(Number(s.weight) || 0, wUnit),
          reps: Number(s.reps),
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

        {todaysPlan ? (
          <PressScale
            accessibilityRole="button"
            accessibilityLabel={`${i18n.nRdPlanToday}: ${todaysPlan.name}`}
            onPress={usePlan}
            style={styles.planChip}>
            <Icon icon={CalendarDays} size={14} color={colors.metricBlue} />
            <View style={styles.planText}>
              <Text style={styles.planLabel}>{i18n.nRdPlanToday}</Text>
              <Text style={styles.planName} numberOfLines={1}>{todaysPlan.name}</Text>
            </View>
            <Text style={styles.planUse}>{i18n.nRdUsePlan}</Text>
          </PressScale>
        ) : null}

        <TextInput
          style={styles.input}
          placeholder={i18n.nWorkoutName}
          placeholderTextColor={colors.mutedForeground}
          value={name}
          onChangeText={setName}
        />

        <Text style={styles.sectionLabel}>{i18n.nSets}</Text>

        {/*
          The columns, named once.

          Every number in a row was labelled only by the placeholder inside it,
          which is gone the moment the number is there — so a filled row read
          `1 Bench Press 60 8` and nothing on screen said which number was which.
          A heading costs one row and does not disappear.
        */}
        <View style={styles.colHead}>
          <View style={styles.colIdx} />
          <Text style={[styles.colLabel, styles.colName]}>{i18n.nExercise}</Text>
          <Text style={[styles.colLabel, styles.colNum]}>{wl}</Text>
          <Text style={[styles.colLabel, styles.colNum]}>{i18n.nReps}</Text>
          <View style={styles.colRemove} />
        </View>

        {sets.map((s, idx) => {
          const suggestions = suggestionsFor(idx);
          // A `1` below the first row is where one exercise ends and the next
          // begins — the same fact the numbering already knows, drawn.
          const startsExercise = idx > 0 && setNumbers[idx] === 1;
          return (
            <View key={idx} style={startsExercise ? styles.groupBreak : undefined}>
              <View style={styles.setRow}>
                <Text style={styles.setIndex}>{setNumbers[idx]}</Text>
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
                  accessibilityLabel={`${s.exerciseName || i18n.nExercise} ${setNumbers[idx]} ${wl}`}
                  style={[styles.input, styles.setNum]}
                  // A dash, not "kg": the heading above already says the unit,
                  // and an empty box here means bodyweight rather than blank.
                  placeholder="—"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="decimal-pad"
                  value={s.weight}
                  onChangeText={(v) => updateSet(idx, 'weight', v)}
                />
                <TextInput
                  accessibilityLabel={`${s.exerciseName || i18n.nExercise} ${setNumbers[idx]} ${i18n.nReps}`}
                  style={[styles.input, styles.setNum, !(Number(s.reps) > 0) && styles.needed]}
                  placeholder="—"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="number-pad"
                  value={s.reps}
                  onChangeText={(v) => updateSet(idx, 'reps', v)}
                />
                <Pressable accessibilityRole="button" accessibilityLabel={i18n.a11yRemove} hitSlop={8} onPress={() => removeSet(idx)} style={styles.removeSet}>
                  <Icon icon={X} size={14} color={colors.mutedForeground} />
                </Pressable>
              </View>
              {/* Library suggestions for the focused row (web: exercise dropdown) */}
              {suggestions.length > 0 && (
                <View style={styles.suggestRow}>
                  {suggestions.map((ex) => (
                    <PressScale
                      key={ex.id}
                      style={styles.suggestChip}
                      onPress={() => pickExercise(idx, ex)}>
                      <Text style={styles.suggestText} numberOfLines={1}>{ex.name}</Text>
                    </PressScale>
                  ))}
                </View>
              )}
            </View>
          );
        })}

        {/*
          Two buttons, because adding a set and starting a new exercise are two
          different things and one of them was unreachable.

          "Add set" copies the row above — same movement, same load — which is
          right for the next set and wrong for the next exercise. Moving on
          therefore meant adding a set and then clearing three fields by hand;
          the second button is that, done for you.
        */}
        <View style={styles.addRow}>
          <PressScale
            accessibilityRole="button"
            style={styles.addSet}
            onPress={addSet}>
            <Icon icon={Plus} size={15} color={colors.foreground} strokeWidth={2.5} />
            <Text style={styles.addSetText}>{i18n.nAddSet}</Text>
          </PressScale>
          <PressScale
            accessibilityRole="button"
            style={styles.addSet}
            onPress={addExercise}>
            <Icon icon={Plus} size={15} color={colors.primary} strokeWidth={2.5} />
            <Text style={[styles.addSetText, styles.addExerciseText]}>{i18n.nLgNewExercise}</Text>
          </PressScale>
        </View>

        <Text style={styles.fieldHint}>{i18n.nLgBwHint}</Text>

        <View style={styles.summaryRow}>
          <Text style={styles.sectionLabel}>{i18n.nVolume}</Text>
          <Text style={styles.volume}>
            {volumeLoad > 0 ? `${Math.round(displayWeight(volumeLoad, wUnit)).toLocaleString()} ${wl}` : '—'}
          </Text>
        </View>

        {/*
          Effort is asked once, here.

          Every row used to carry its own RPE box as well, so the same question
          was on screen twice — nine times in a nine-set session, then once more
          at the bottom — and nothing said which one the app would believe. They
          are not even the same column (`rpe` per set against `session_rpe`), so
          two people filling this in honestly could disagree with themselves.

          Set-by-set effort still exists where it can be answered honestly: the
          week's day panel asks after each set, seconds after it happened. This
          sheet is filled in after the fact, and a number typed then is a memory
          of the whole workout, which is what one chip says.
        */}
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

        {/* Said next to the button it explains, and only while it is true —
            a permanent instruction is read once and then stops being read. */}
        {validSets.length === 0 ? <Text style={styles.fieldHint}>{i18n.nLgNeedReps}</Text> : null}

        <PressScale
          style={[styles.saveButton, !canSave && !save.isSuccess && styles.saveDisabled]}
          disabled={!canSave}
          onPress={() => save.mutate()}>
          {save.isSuccess ? (
            <Icon icon={Check} size={22} color={colors.primaryForeground} strokeWidth={3} />
          ) : save.isPending ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <Text style={styles.saveText}>{i18n.nSaveWorkout}</Text>
          )}
        </PressScale>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.card },
  content: { padding: spacing.lg, gap: spacing.sm + 4 },
  title: { ...type.title, color: colors.foreground, textAlign: 'center', marginBottom: spacing.sm },
  /* An offer, styled as one: outlined and quiet, sitting above the form rather
     than inside it, so it reads as "here is what the week says" and not as a
     field you have to deal with. */
  planChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm + 2,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
    backgroundColor: glass.bg,
    borderWidth: glass.borderWidth,
    borderColor: glass.border,
  },
  planText: { flex: 1, minWidth: 0 },
  planLabel: { ...type.caption, color: colors.mutedForeground },
  planName: { ...type.footnote, color: colors.foreground, fontWeight: '600' },
  planUse: { ...type.footnote, color: colors.metricBlue, fontWeight: '700' },
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
  /* Mirrors the widths of the row below it — the same numbers, written once
     more rather than reused, because `setNum` and its siblings carry a 44pt
     height for the fields and a heading at 44pt is a second row of furniture. */
  colHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  colLabel: { ...type.caption, color: colors.mutedForeground, textAlign: 'center' },
  colIdx: { width: 16 },
  colName: { flex: 1, textAlign: 'left', paddingHorizontal: spacing.sm },
  colNum: { width: 64 },
  colRemove: { width: 24 },
  /* The gap that says a new exercise starts here. A rule rather than a bigger
     gap alone, because the rows are already 8pt apart and a 16pt gap reads as
     spacing that got away rather than as a boundary. */
  groupBreak: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  /* The one field a set cannot do without, marked while it is empty by
     brightening the border it already has. Not an error colour: the row is not
     wrong, it is unfinished, and red on something still being typed into reads
     as a mistake already made. */
  needed: { borderColor: colors.mutedForeground },
  addRow: { flexDirection: 'row', gap: spacing.sm },
  addExerciseText: { color: colors.primary },
  fieldHint: { ...type.caption, color: colors.mutedForeground },
  setName: { flex: 1, paddingHorizontal: spacing.sm, height: 44 },
  setNum: { width: 64, paddingHorizontal: spacing.xs, height: 44, textAlign: 'center' },
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
    flex: 1,
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
});
