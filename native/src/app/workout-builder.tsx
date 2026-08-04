import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { ArrowLeft, Check, ChevronRight, Plus, Search, X } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
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

import { Icon } from '@/components/ascnd/icon';
import { MuscleArt } from '@/components/ascnd/muscle-art';
import { restLabel, WorkoutSetPanel } from '@/components/ascnd/workout-set-sheet';
import { colors, glass, radius, spacing, type } from '@/constants/ascnd';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { useAddWorkoutTemplate, useExercises, type TemplateExercise } from '@/hooks/use-library';
import { useUnits } from '@/hooks/use-units';
import { muscleArtKeysFor, type MuscleArtKey } from '@/lib/muscle-group';
import { displayWeight, weightLabel } from '@/lib/units';

/**
 * Building a workout template, in two steps: pick the exercises, then say how
 * they are done.
 *
 * ── what was wrong with the one long form ──
 *
 * Everything used to be on a single scroll, in this order: a name field, ten
 * type chips, a "New exercise" toggle, a search field, search results, a row of
 * "Suggestions", the exercises added so far, and Save. Six controls before the
 * first exercise.
 *
 * Four things about that were confusing, and none of them were fixable by
 * moving a margin:
 *
 *   1. **It asked for the name first.** Naming a workout that does not exist
 *      yet is the hardest question in the flow, and it was the first one. Worse,
 *      the name field and the search field were the same 48pt box with the same
 *      border a few hundred points apart — two identical inputs where one files
 *      the template and the other searches the library.
 *
 *   2. **The library was invisible until you typed.** The result list was gated
 *      on `search.length > 0`. With the field empty you got "Suggestions",
 *      which was `exercises.slice(0, 10)` — the first ten rows of a query
 *      ordered by muscle group, so it always suggested Abs. There was no way to
 *      browse, and the Workouts tab right next door already browses this same
 *      library by body part.
 *
 *   3. **The results were silently truncated** at twelve, with nothing on
 *      screen to say a thirteenth match existed.
 *
 *   4. **Five number fields per exercise**, side by side, 66pt apiece. See
 *      `workout-set-sheet` for what replaced them and why.
 *
 * ── the shape it has now ──
 *
 * Step 1 is a picker and nothing else: search pinned at the top, body-part
 * filters under it, and the whole library as a list you can scroll and tap.
 * Tapping toggles, so the list is also the record of what you have chosen, and
 * a footer counts it. This is the Apple/MyFitnessPal pattern — browse, tap,
 * a running count, one button out.
 *
 * Step 2 is the prescription: the name, the type, and the exercises in order.
 * By the time you arrive the app can *propose* both the name and the type from
 * what you picked, so the hardest question now arrives pre-answered and
 * editable rather than blank and first.
 *
 * Nothing the old form could do was dropped: name, type, search, creating a
 * custom exercise, adding, removing, and all five numbers per exercise are all
 * still reachable. Reordering is new, and so is the estimated duration.
 *
 * Creating a movement is the one that moved rather than stayed: it opens the
 * exercise library, which has had the same form all along. See `openLibrary`.
 *
 * ── one vertical scroller per step ──
 *
 * Step 1's rows are a `FlatList` and the search and filters sit *above* it
 * rather than in `ListHeaderComponent`. Two reasons: a search field you scroll
 * away from is a search field you have to scroll back to, and a header passed
 * as a component (rather than an element) remounts on every keystroke, which
 * takes the keyboard down with it.
 *
 * The body-part strip scrolls horizontally, which is a different axis and
 * therefore fine. What is never nested is one vertical scroller inside
 * another — that is what caused the endless-scroll bug elsewhere in this app.
 */

/** stored values, unchanged — templates already in the database use these */
const TYPES = [
  'push',
  'pull',
  'legs',
  'upper',
  'lower',
  'full_body',
  'strength',
  'hypertrophy',
  'cardio',
  'custom',
] as const;
type TemplateType = (typeof TYPES)[number];

/**
 * The body parts, in the order a body is worked.
 *
 * Written out here rather than read from `i18n.muscleChest` and its siblings
 * for the same reason the Workouts tab writes its own: those strings are the
 * *stored* labels, and a filter caption carries no obligation to keep matching
 * data filed under an old spelling.
 */
const GROUPS: { key: MuscleArtKey; en: string; vi: string }[] = [
  { key: 'chest', en: 'Chest', vi: 'Ngực' },
  { key: 'back', en: 'Back', vi: 'Lưng' },
  { key: 'shoulders', en: 'Shoulders', vi: 'Vai' },
  { key: 'biceps', en: 'Biceps', vi: 'Tay trước' },
  { key: 'triceps', en: 'Triceps', vi: 'Tay sau' },
  { key: 'abs', en: 'Abs', vi: 'Bụng' },
  { key: 'legs', en: 'Legs', vi: 'Chân' },
  { key: 'glutes', en: 'Glutes', vi: 'Mông' },
  { key: 'calves', en: 'Calves', vi: 'Bắp chân' },
  { key: 'cardio', en: 'Cardio', vi: 'Tim mạch' },
];

/** what a newly added exercise starts at — unchanged from the old form */
const DEFAULTS = { sets: 3, reps: 10, weight: 0, rpe: 7, restSeconds: 90 } as const;

const PUSH = new Set<MuscleArtKey>(['chest', 'shoulders', 'triceps']);
const PULL = new Set<MuscleArtKey>(['back', 'biceps']);
const LOWER = new Set<MuscleArtKey>(['legs', 'glutes', 'calves']);

const within = (got: Set<MuscleArtKey>, allowed: Set<MuscleArtKey>) =>
  [...got].every((k) => allowed.has(k));

/**
 * What kind of workout the chosen exercises add up to.
 *
 * A proposal, not a verdict — every chip stays tappable, and touching one stops
 * this being consulted for the rest of the session. It exists because "type"
 * was the second question the old form asked and the least answerable: ten
 * machine words (`full_body`) in a scroller, on a screen that so far knew
 * nothing about the workout. Asked *after* the exercises are known, the app can
 * answer it as well as the user can.
 *
 * The tests run narrowest-first, so a chest/shoulder/triceps day is `push`
 * rather than `upper` — both are true and the more specific one is more useful.
 */
function inferType(groups: Set<MuscleArtKey>): TemplateType {
  if (groups.size === 0) return 'custom';
  if (within(groups, new Set<MuscleArtKey>(['cardio']))) return 'cardio';
  // Abs on their own before the two body-half tests, which both allow abs as a
  // finisher: without this an abs-only session comes out as "Lower body",
  // because `lower` is simply the first of the two to be tried.
  if (within(groups, new Set<MuscleArtKey>(['abs']))) return 'custom';
  if (within(groups, PUSH)) return 'push';
  if (within(groups, PULL)) return 'pull';
  if (within(groups, LOWER)) return 'legs';
  if (within(groups, new Set<MuscleArtKey>([...LOWER, 'abs']))) return 'lower';
  if (within(groups, new Set<MuscleArtKey>([...PUSH, ...PULL, 'abs']))) return 'upper';
  return 'full_body';
}

export default function WorkoutBuilderSheet() {
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const vi = lang === 'vi';
  const insets = useSafeAreaInsets();
  const { weight: wUnit } = useUnits();
  const wl = weightLabel(wUnit);
  const { data: exercises, isLoading } = useExercises();
  const addTemplate = useAddWorkoutTemplate();

  const [step, setStep] = useState<1 | 2>(1);
  const [items, setItems] = useState<TemplateExercise[]>([]);
  const [search, setSearch] = useState('');
  const [group, setGroup] = useState<MuscleArtKey | null>(null);

  /** which exercise the prescription sheet is open on, by index */
  const [editing, setEditing] = useState<number | null>(null);

  // Name and type are proposed until they are touched — see `inferType`
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [pickedType, setPickedType] = useState<TemplateType | null>(null);

  const label = useCallback((g: { en: string; vi: string }) => (vi ? g.vi : g.en), [vi]);

  /** exercise id → the group it is filed under, for naming and typing below */
  const groupById = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const e of exercises ?? []) m.set(e.id, e.muscle_group);
    return m;
  }, [exercises]);

  const chosen = useMemo(() => new Set(items.map((i) => i.exerciseId)), [items]);

  /*
    No `.slice()`. The old list showed twelve matches and said nothing about a
    thirteenth; a `FlatList` renders only what is on screen anyway, so the cap
    was buying nothing and hiding exercises.
  */
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (exercises ?? []).filter(
      (e) =>
        (!group || muscleArtKeysFor(e.muscle_group).includes(group)) &&
        (!q || e.name.toLowerCase().includes(q)),
    );
  }, [exercises, group, search]);

  /** every body part the chosen exercises touch, with how many touch it */
  const groupCounts = useMemo(() => {
    const counts = new Map<MuscleArtKey, number>();
    for (const it of items) {
      for (const k of muscleArtKeysFor(groupById.get(it.exerciseId))) {
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
    }
    return counts;
  }, [items, groupById]);

  const suggestedType = useMemo(
    () => inferType(new Set(groupCounts.keys())),
    [groupCounts],
  );
  const tType: TemplateType = pickedType ?? suggestedType;

  /**
   * A name made of the two body parts the workout is mostly about.
   *
   * Four or more and it is a full-body day, which is both true and shorter than
   * listing them. Nothing here is committed — it is what the field shows until
   * the field is typed in.
   */
  const suggestedName = useMemo(() => {
    if (items.length === 0) return '';
    const ranked = [...groupCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([k]) => GROUPS.find((g) => g.key === k))
      .filter((g): g is (typeof GROUPS)[number] => !!g);
    // Nothing recognised: every chosen exercise is filed under a group with no
    // diagram. "Full body" would be a guess, so the field falls back to the
    // screen's own title rather than claiming something about the workout.
    if (ranked.length === 0) return i18n.nWbTitle;
    if (ranked.length >= 4) return i18n.nWbTypeFullBody;
    if (ranked.length === 1) return i18n.nWbNameOne.replace('{x}', label(ranked[0]));
    return i18n.nWbNameTwo.replace('{a}', label(ranked[0])).replace('{b}', label(ranked[1]));
  }, [items.length, groupCounts, i18n, label]);

  const shownName = nameTouched ? name : suggestedName;

  /** total sets, and roughly how long the session runs at 3s a rep */
  const totals = useMemo(() => {
    let sets = 0;
    let seconds = 0;
    for (const it of items) {
      sets += it.sets;
      seconds += it.sets * (it.reps * 3 + (it.restSeconds ?? 90));
    }
    return { sets, minutes: Math.max(1, Math.round(seconds / 60)) };
  }, [items]);

  const toggle = (ex: { id: string; name: string }) => {
    Haptics.selectionAsync();
    setItems((prev) =>
      prev.some((i) => i.exerciseId === ex.id)
        ? prev.filter((i) => i.exerciseId !== ex.id)
        : [...prev, { exerciseId: ex.id, exerciseName: ex.name, ...DEFAULTS }],
    );
  };

  const patch = (idx: number, values: Partial<TemplateExercise>) =>
    setItems((prev) => prev.map((e, i) => (i === idx ? { ...e, ...values } : e)));

  /** move the exercise at `from` to `to`, keeping the sheet on the same one */
  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length) return;
    setItems((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    setEditing(to);
  };

  const removeAt = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
    setEditing(null);
  };

  /**
   * Adding a movement the library does not have yet.
   *
   * A link, not a form. The builder carried its own copy of this — a name, the
   * eleven muscle groups, the equipment list, a create button — and the exercise
   * library two taps away has had exactly that all along. Two copies means two
   * sets of group labels to keep matching, and `muscle_group` is free text that
   * the diagrams have to fold back together, so a second writer of it is a
   * second way for a tile to read zero over a full shelf.
   *
   * Whatever was typed into the search goes with it, so a search that found
   * nothing arrives as a form already carrying the name.
   *
   * The builder stays mounted underneath, so coming back finds every exercise
   * still chosen — and the new one already in the list, because creating it
   * invalidates the query this screen is reading.
   */
  const openLibrary = () => {
    Haptics.selectionAsync();
    router.push({ pathname: '/exercises', params: { create: search.trim() } });
  };

  const save = () => {
    const finalName = shownName.trim() || suggestedName;
    addTemplate.mutate(
      { name: finalName, type: tType, exercises: items },
      {
        onSuccess: () => router.back(),
        onError: (e: Error) => Alert.alert('ASCND', e.message),
      },
    );
  };

  /**
   * Which of the builder's three faces is on screen.
   *
   * The two sheets used to be overlays floating over the picker — a `Modal`
   * first, then an absolutely-positioned view — and both failed on this stack in
   * ways that looked identical from the outside: the page dimmed, the keyboard
   * came up, and the panel was not there. This screen is itself presented as a
   * modal, which is what makes overlays inside it fragile.
   *
   * They are steps now. Nothing floats: each face is the ordinary contents of an
   * ordinary column, laid out by the one keyboard-avoider that already wraps the
   * screen, with the header's back button carrying the way out. There is no
   * absolute positioning left to get wrong.
   *
   * It is also the better shape. Prescribing an exercise is a whole job with a
   * form of its own; giving it the screen is what the two-step flow was already
   * doing for picking and reviewing. Naming a *new* movement is the same kind of
   * job, and it does not need a face here at all — the exercise library is one
   * push away and has had that form since long before this screen did.
   */
  const mode =
    editing !== null && items[editing] ? 'edit-set' : step === 1 ? 'pick' : 'review';

  /** the back button's job, which is different on each face */
  const goBack = () => {
    Haptics.selectionAsync();
    if (mode === 'edit-set') setEditing(null);
    else if (mode === 'review') setStep(1);
    else router.back();
  };

  const subtitle =
    mode === 'edit-set'
      ? items[editing!].exerciseName
      : mode === 'pick'
        ? i18n.nWbStepPick
        : i18n.nWbStepReview;

  const typeLabel = (t: TemplateType): string =>
    ({
      push: i18n.nWbTypePush,
      pull: i18n.nWbTypePull,
      legs: i18n.nWbTypeLegs,
      upper: i18n.nWbTypeUpper,
      lower: i18n.nWbTypeLower,
      full_body: i18n.nWbTypeFullBody,
      strength: i18n.nWbTypeStrength,
      hypertrophy: i18n.nWbTypeHypertrophy,
      cardio: i18n.nWbTypeCardio,
      custom: i18n.nWbTypeCustom,
    })[t];

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* ── header: the step you are on, and the way back out of it ── */}
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={mode === 'pick' ? i18n.a11yClose : i18n.a11yBack}
          hitSlop={8}
          onPress={goBack}
          style={({ pressed }) => [styles.headerBtn, pressed && styles.pressed]}>
          <Icon icon={mode === 'pick' ? X : ArrowLeft} size={18} color={colors.foreground} />
        </Pressable>

        <View style={styles.headerTitle}>
          <Text style={styles.title}>{i18n.nWbTitle}</Text>
          <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
        </View>

        {/* Balances the button so the title sits centred */}
        <View style={styles.headerBtn} />
      </View>

      {/* Two segments, the one you are on lit. It is the cheapest way to say
          "this is short" — the old form gave no sense of how much was left. */}
      <View style={styles.progress}>
        <View style={styles.segOn} />
        <View style={step === 2 ? styles.segOn : styles.segOff} />
      </View>

      {mode === 'edit-set' ? (
        <>
          <WorkoutSetPanel
            item={items[editing!]}
            index={editing!}
            total={items.length}
            unit={wUnit}
            i18n={i18n}
            onChange={(values) => patch(editing!, values)}
            onMove={(to) => move(editing!, to)}
            onRemove={() => removeAt(editing!)}
          />
          <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.sm }]}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setEditing(null)}
              style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
              <Text style={styles.primaryText}>{i18n.nWbDone}</Text>
            </Pressable>
          </View>
        </>
      ) : mode === 'pick' ? (
        <>
          <View style={styles.pickerHead}>
            <View style={styles.searchBox}>
              <Icon icon={Search} size={16} color={colors.mutedForeground} />
              <TextInput
                style={styles.searchInput}
                placeholder={i18n.exercisesSearch}
                placeholderTextColor={colors.mutedForeground}
                value={search}
                onChangeText={setSearch}
                autoCorrect={false}
                returnKeyType="search"
              />
              {search.length > 0 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={i18n.a11yClose}
                  hitSlop={8}
                  onPress={() => setSearch('')}>
                  <Icon icon={X} size={15} color={colors.mutedForeground} />
                </Pressable>
              ) : null}
            </View>

            {/*
              The body parts, as a filter rather than a destination.

              The Workouts tab uses the same ten diagrams as a way *into* the
              library; here they narrow the list in place, because leaving the
              builder to browse and coming back would lose what you had picked.
            */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.groupStrip}
              keyboardShouldPersistTaps="handled">
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: group === null }}
                onPress={() => {
                  Haptics.selectionAsync();
                  setGroup(null);
                }}
                style={[styles.groupTile, group === null && styles.groupTileOn]}>
                <View style={styles.allDot}>
                  <Text style={styles.allCount}>{(exercises ?? []).length}</Text>
                </View>
                <Text style={[styles.groupName, group === null && styles.groupNameOn]}>
                  {i18n.nWbAll}
                </Text>
              </Pressable>

              {GROUPS.map((g) => (
                <Pressable
                  key={g.key}
                  accessibilityRole="button"
                  accessibilityState={{ selected: group === g.key }}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setGroup((cur) => (cur === g.key ? null : g.key));
                  }}
                  style={[styles.groupTile, group === g.key && styles.groupTileOn]}>
                  <MuscleArt group={g.key} size={34} />
                  <Text style={[styles.groupName, group === g.key && styles.groupNameOn]}>
                    {label(g)}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          <FlatList
            data={visible}
            keyExtractor={(e) => e.id}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            ListEmptyComponent={
              isLoading ? (
                <ActivityIndicator color={colors.mutedForeground} style={styles.empty} />
              ) : (
                <View style={styles.empty}>
                  <Text style={styles.emptyText}>
                    {search.trim()
                      ? i18n.nWbNoMatch.replace('{x}', search.trim())
                      : (exercises ?? []).length === 0
                        ? i18n.nWbLibraryEmpty
                        : i18n.nNoExercisesFound}
                  </Text>
                  {/* The dead end becomes the way forward: what you searched
                      for is what the new exercise is called. */}
                  <Pressable
                    accessibilityRole="button"
                    onPress={openLibrary}
                    style={({ pressed }) => [styles.emptyCta, pressed && styles.pressed]}>
                    <Icon icon={Plus} size={14} color={colors.primary} strokeWidth={2.5} />
                    <Text style={styles.emptyCtaText}>
                      {search.trim()
                        ? i18n.nWbCreateNamed.replace('{x}', search.trim())
                        : i18n.nCreateExercise}
                    </Text>
                  </Pressable>
                </View>
              )
            }
            ListFooterComponent={
              visible.length > 0 ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={openLibrary}
                  style={({ pressed }) => [styles.newRow, pressed && styles.pressed]}>
                  <Icon icon={Plus} size={16} color={colors.primary} strokeWidth={2.5} />
                  <Text style={styles.newRowText}>{i18n.nCreateExercise}</Text>
                </Pressable>
              ) : null
            }
            renderItem={({ item: e }) => {
              const on = chosen.has(e.id);
              return (
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  onPress={() => toggle(e)}
                  style={({ pressed }) => [styles.exRow, on && styles.exRowOn, pressed && styles.pressed]}>
                  {/* A fixed slot, because `MuscleArt` draws nothing for a
                      group it has no diagram for — without it those rows would
                      start 38pt to the left of the ones around them. */}
                  <View style={styles.art}>
                    <MuscleArt group={e.muscle_group ?? ''} size={30} />
                  </View>
                  <View style={styles.exText}>
                    <Text style={styles.exName} numberOfLines={1}>{e.name}</Text>
                    <Text style={styles.exMeta} numberOfLines={1}>
                      {[e.muscle_group, e.equipment].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <View style={[styles.tick, on && styles.tickOn]}>
                    {on ? <Icon icon={Check} size={14} color={colors.primaryForeground} strokeWidth={3} /> : null}
                  </View>
                </Pressable>
              );
            }}
          />

          <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.sm }]}>
            <Text style={styles.footerCount}>
              {items.length > 0
                ? i18n.nWbSelected.replace('{n}', String(items.length))
                : i18n.nWbPickHint}
            </Text>
            <Pressable
              accessibilityRole="button"
              disabled={items.length === 0}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setStep(2);
              }}
              style={({ pressed }) => [
                styles.primary,
                items.length === 0 && styles.disabled,
                pressed && items.length > 0 && styles.pressed,
              ]}>
              <Text style={styles.primaryText}>{i18n.nWbNext}</Text>
              <Icon icon={ChevronRight} size={18} color={colors.primaryForeground} />
            </Pressable>
          </View>
        </>
      ) : (
        <>
          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.reviewContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag">
            <TextInput
              style={styles.nameInput}
              value={shownName}
              onChangeText={(t) => {
                setNameTouched(true);
                setName(t);
              }}
              placeholder={i18n.nTemplateName}
              placeholderTextColor={colors.mutedForeground}
              returnKeyType="done"
            />
            <Text style={styles.nameHint}>{i18n.nWbNameHint}</Text>

            <Text style={styles.summary}>
              {i18n.nWbSummary
                .replace('{n}', String(items.length))
                .replace('{s}', String(totals.sets))
                .replace('{m}', String(totals.minutes))}
            </Text>

            <Text style={styles.sectionLabel}>{i18n.nWbType}</Text>
            <View style={styles.typeWrap}>
              {TYPES.map((t) => (
                <Pressable
                  key={t}
                  accessibilityRole="button"
                  accessibilityState={{ selected: tType === t }}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setPickedType(t);
                  }}
                  style={[styles.chip, tType === t && styles.chipOn]}>
                  <Text style={[styles.chipText, tType === t && styles.chipTextOn]}>
                    {typeLabel(t)}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.sectionLabel}>{i18n.workoutsExercisesAdded}</Text>
            {items.map((ex, idx) => (
              <Pressable
                key={ex.exerciseId}
                accessibilityRole="button"
                accessibilityLabel={`${ex.exerciseName}, ${ex.sets} × ${ex.reps}`}
                onPress={() => {
                  Haptics.selectionAsync();
                  setEditing(idx);
                }}
                style={({ pressed }) => [styles.planRow, pressed && styles.pressed]}>
                {/* The number is the order, and the order is part of the plan */}
                <View style={styles.ordinal}>
                  <Text style={styles.ordinalText}>{idx + 1}</Text>
                </View>
                <View style={styles.exText}>
                  <Text style={styles.exName} numberOfLines={1}>{ex.exerciseName}</Text>
                  {/* The prescription as a sentence, not five boxes */}
                  <Text style={styles.exMeta} numberOfLines={1}>
                    {ex.sets} × {ex.reps}
                    {ex.weight ? `  ·  ${displayWeight(ex.weight, wUnit)} ${wl}` : ''}
                    {`  ·  ${restLabel(ex.restSeconds ?? 90)}`}
                  </Text>
                </View>
                <Icon icon={ChevronRight} size={16} color={colors.mutedForeground} />
              </Pressable>
            ))}

            <Pressable
              accessibilityRole="button"
              onPress={() => {
                Haptics.selectionAsync();
                setStep(1);
              }}
              style={({ pressed }) => [styles.newRow, pressed && styles.pressed]}>
              <Icon icon={Plus} size={16} color={colors.primary} strokeWidth={2.5} />
              <Text style={styles.newRowText}>{i18n.nWbAddMore}</Text>
            </Pressable>
          </ScrollView>

          <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.sm }]}>
            <Pressable
              accessibilityRole="button"
              disabled={items.length === 0 || addTemplate.isPending}
              onPress={save}
              style={({ pressed }) => [
                styles.primary,
                (items.length === 0 || addTemplate.isPending) && styles.disabled,
                pressed && styles.pressed,
              ]}>
              {addTemplate.isPending ? (
                <ActivityIndicator color={colors.primaryForeground} />
              ) : (
                <Text style={styles.primaryText}>{i18n.nWbSave}</Text>
              )}
            </Pressable>
          </View>
        </>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.card },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    height: 56,
  },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.secondary,
  },
  headerTitle: { flex: 1, alignItems: 'center' },
  title: { ...type.headline, color: colors.foreground },
  subtitle: { ...type.caption, color: colors.mutedForeground },

  progress: { flexDirection: 'row', gap: 4, paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  segOn: { flex: 1, height: 3, borderRadius: 2, backgroundColor: colors.primary },
  segOff: { flex: 1, height: 3, borderRadius: 2, backgroundColor: colors.border },

  pickerHead: { paddingHorizontal: spacing.md, gap: spacing.sm },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: colors.secondary,
  },
  searchInput: { flex: 1, color: colors.foreground, fontSize: 16 },

  groupStrip: { gap: spacing.sm, paddingVertical: spacing.xs, paddingRight: spacing.md },
  groupTile: {
    width: 66,
    alignItems: 'center',
    gap: 2,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: glass.bg,
    borderWidth: glass.borderWidth,
    borderColor: 'transparent',
  },
  groupTileOn: { borderColor: colors.primary, backgroundColor: 'rgba(168,175,189,0.16)' },
  groupName: { ...type.caption, color: colors.mutedForeground },
  groupNameOn: { color: colors.foreground, fontWeight: '700' },
  // Stands in for the diagram on the "All" tile, holding the library's size
  allDot: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.secondary,
  },
  allCount: { ...type.caption, color: colors.foreground, fontVariant: ['tabular-nums'] },

  list: { flex: 1 },
  listContent: { padding: spacing.md, gap: spacing.sm },
  reviewContent: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },

  exRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm + 2,
    borderRadius: radius.md,
    backgroundColor: glass.bg,
    borderWidth: glass.borderWidth,
    borderColor: 'transparent',
  },
  exRowOn: { borderColor: colors.primary, backgroundColor: 'rgba(168,175,189,0.14)' },
  art: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  exText: { flex: 1, minWidth: 0, gap: 2 },
  exName: { ...type.body, color: colors.foreground },
  exMeta: { ...type.caption, color: colors.mutedForeground, fontVariant: ['tabular-nums'] },
  tick: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tickOn: { backgroundColor: colors.primary, borderColor: colors.primary },

  newRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 46,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  newRowText: { ...type.footnote, color: colors.primary, fontWeight: '600' },

  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  emptyText: { ...type.footnote, color: colors.mutedForeground, textAlign: 'center' },
  emptyCta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  emptyCtaText: { ...type.footnote, color: colors.primary, fontWeight: '600' },

  nameInput: {
    ...type.title,
    color: colors.foreground,
    paddingVertical: spacing.sm,
  },
  nameHint: { ...type.caption, color: colors.mutedForeground, marginTop: -spacing.xs },
  summary: {
    ...type.footnote,
    color: colors.foreground,
    fontVariant: ['tabular-nums'],
    paddingVertical: spacing.sm,
    marginBottom: spacing.xs,
  },
  sectionLabel: {
    ...type.caption,
    color: colors.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '600',
    marginTop: spacing.sm,
  },

  typeWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.secondary,
  },
  chipOn: { backgroundColor: colors.primary },
  chipText: { ...type.footnote, color: colors.secondaryForeground },
  chipTextOn: { color: colors.primaryForeground, fontWeight: '700' },

  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm + 2,
    borderRadius: radius.md,
    backgroundColor: glass.bg,
    borderWidth: glass.borderWidth,
    borderColor: glass.border,
  },
  ordinal: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.secondary,
  },
  ordinalText: { ...type.caption, color: colors.foreground, fontVariant: ['tabular-nums'] },

  footer: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
  },
  footerCount: { ...type.caption, color: colors.mutedForeground, textAlign: 'center' },
  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    height: 52,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
  },
  primaryText: { ...type.headline, color: colors.primaryForeground },
  disabled: { opacity: 0.4 },


  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
});
