import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { CalendarDays, ChevronDown, ChevronRight, Dumbbell, Flame, Plus, Trash2 } from 'lucide-react-native';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { rise } from '@/lib/entrance';

import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { Screen } from '@/components/ascnd/screen';
import { colors, radius, spacing, type } from '@/constants/ascnd';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { useDeleteWorkoutSession, useWorkoutSessions } from '@/hooks/use-fitness-data';
import { useExercises, useDeleteWorkoutTemplate, useWorkoutTemplates } from '@/hooks/use-library';
import { useUnits } from '@/hooks/use-units';
import { getLocale } from '@/lib/i18n';
import { toast } from '@/lib/toast';
import { displayWeight, weightLabel, type WeightUnit } from '@/lib/units';
import { LoadFailed } from '@/components/ascnd/load-failed';
import { MuscleArt, muscleArtFor, type MuscleArtKey } from '@/components/ascnd/muscle-art';

interface TplExercise {
  exerciseName?: string;
  sets?: number;
  reps?: number;
  weight?: number;
  rpe?: number;
}

function volume(exercises: unknown): number {
  if (!Array.isArray(exercises)) return 0;
  return (exercises as TplExercise[]).reduce(
    (s, e) => s + (e.sets || 0) * (e.reps || 0) * (e.weight || 0),
    0,
  );
}

/**
 * The tiles, in the order a body is worked rather than alphabetically.
 *
 * Push, pull, then the two arms, then the trunk, then everything below the
 * waist. Alphabetical would put Abs first and Triceps next to Shoulders, which
 * is an order that serves the spelling and nobody else.
 *
 * The names are written here rather than taken from `i18n.muscleChest` and its
 * siblings, because those are the *stored* labels — changing one has to keep
 * matching data already filed under it, and a tile caption has no such
 * obligation.
 */
const MUSCLE_TILES: { key: MuscleArtKey; vi: string; en: string }[] = [
  { key: 'chest', vi: 'Ngực', en: 'Chest' },
  { key: 'back', vi: 'Lưng', en: 'Back' },
  { key: 'shoulders', vi: 'Vai', en: 'Shoulders' },
  { key: 'biceps', vi: 'Tay trước', en: 'Biceps' },
  { key: 'triceps', vi: 'Tay sau', en: 'Triceps' },
  { key: 'abs', vi: 'Bụng', en: 'Abs' },
  { key: 'legs', vi: 'Chân', en: 'Legs' },
  { key: 'glutes', vi: 'Mông', en: 'Glutes' },
  { key: 'calves', vi: 'Bắp chân', en: 'Calves' },
  { key: 'cardio', vi: 'Tim mạch', en: 'Cardio' },
];

/** Same duration and curve as the diary's meal cards — one behaviour to learn. */
const OPEN_MS = 260;
const OPEN_EASE = Easing.out(Easing.cubic);

/**
 * A saved template, and what is actually in it.
 *
 * ── the chevron was a promise nothing kept ──
 *
 * The card showed a name, a count of exercises and a volume figure, with a
 * `ChevronRight` at the end of the row. That glyph says "there is more, tap
 * here" — and it was not a button, and nothing happened. The only way to see
 * what a template contained was to remember, or to build it again.
 *
 * A count is the one thing about a routine that does not help: "6 exercises"
 * is true of every push day anybody has ever written. What you need to know
 * before starting one is which six.
 *
 * ── opening in place, not navigating ──
 *
 * The exercises are four short rows. Pushing a screen to show four rows costs a
 * transition each way and a place in the back stack, and lands somewhere you
 * then have to leave to compare against the next template. So the card grows,
 * the way the diary's meals do, with the same timing and the same rotating
 * chevron — `ChevronDown` now, since the card no longer claims to go anywhere.
 *
 * Its own component because hooks cannot live inside a `.map`.
 */
function TemplateCard({
  tpl,
  index,
  wUnit,
  wl,
  i18n,
  onDelete,
}: {
  tpl: { id: string; name: string; type?: string | null; exercises?: unknown };
  index: number;
  wUnit: WeightUnit;
  wl: string;
  i18n: ReturnType<typeof useI18n>;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const raw = tpl.exercises;
  const exs: TplExercise[] = Array.isArray(raw) ? (raw as TplExercise[]) : [];

  const turn = useSharedValue(0);
  useEffect(() => {
    turn.value = withTiming(open ? 1 : 0, { duration: OPEN_MS, easing: OPEN_EASE });
  }, [open, turn]);
  const chevron = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value * 180}deg` }] }));

  return (
    <Animated.View entering={rise(index)}>
      <GlassCard style={styles.tplCard}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: open, disabled: exs.length === 0 }}
          /*
            Guarded here rather than with `disabled`.

            The delete button is a `Pressable` inside this one, and whether RN's
            `disabled` blocks a nested pressable is a detail I could not verify
            without a device. Returning early cannot: an empty template does
            nothing when tapped, and its delete button keeps working either way.
          */
          onPress={() => {
            if (exs.length === 0) return;
            Haptics.selectionAsync();
            setOpen((v) => !v);
          }}
          style={({ pressed }) => [styles.tplRow, pressed && styles.pressed]}>
          <View style={styles.tplInfo}>
            <View style={styles.tplTitleRow}>
              <Icon icon={Dumbbell} size={16} color={colors.primary} />
              <Text style={styles.tplName} numberOfLines={1}>{tpl.name}</Text>
              {tpl.type ? (
                <View style={styles.typeBadge}>
                  <Text style={styles.typeText}>{tpl.type}</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.tplMeta}>
              {exs.length} {i18n.workoutsExercises} · {i18n.workoutsVolume}: {Math.round(displayWeight(volume(exs), wUnit)).toLocaleString()} {wl}
            </Text>
          </View>
          <View style={styles.tplActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={i18n.a11yDelete}
              hitSlop={8}
              onPress={() => onDelete(tpl.id)}>
              <Icon icon={Trash2} size={15} color={colors.mutedForeground} />
            </Pressable>
            {/* No chevron on an empty template: there is nothing to open, and a
                control that does nothing is what this card had before. */}
            {exs.length > 0 ? (
              <Animated.View style={chevron}>
                <Icon icon={ChevronDown} size={16} color={colors.mutedForeground} />
              </Animated.View>
            ) : null}
          </View>
        </Pressable>

        {/*
          Mounted only when open, rather than kept in a clipped box.

          The first version animated a measured height, the way the diary's meal
          cards do. It did not show anything, and I could not find out why from
          reading the two — they are structurally the same. Rather than keep
          guessing at a measurement I cannot observe without a device, this drops
          the measurement: rows that are mounted are laid out, and there is no
          box that can be zero high while holding them.

          The card still pushes the cards below it down, because adding rows is a
          real layout change. A `LinearTransition` on the card would have been
          the tidier-looking answer and is the wrong one — it animates the card
          and leaves its siblings where they were, which was measured on this
          project at a 94px hole.

          The movement is per row instead: each slides in on a short stagger, so
          opening reads as the list arriving rather than as the card snapping to
          a new size.
        */}
        {open
          ? exs.map((e, i) => (
              <Animated.View
                key={`${e.exerciseName ?? 'x'}-${i}`}
                entering={FadeInDown.duration(OPEN_MS).delay(Math.min(i, 8) * 35)}
                style={styles.exRow}>
                <Text style={styles.exName} numberOfLines={1}>
                  {e.exerciseName || i18n.workoutsExercises}
                </Text>
                {/* "3 × 10" and then the load, because sets and reps are the
                    shape of the work and the weight is how hard it is. A
                    bodyweight movement carries no number rather than a zero. */}
                <Text style={styles.exSets}>
                  {e.sets ?? 0} × {e.reps ?? 0}
                  {e.weight ? `  ·  ${Math.round(displayWeight(e.weight, wUnit))} ${wl}` : ''}
                </Text>
              </Animated.View>
            ))
          : null}
      </GlassCard>
    </Animated.View>
  );
}

/**
 * The exercise library, entered by body part.
 *
 * ── why it is here ──
 *
 * The library was reachable only through an "Exercises" button in the header
 * row, which is a word next to two other words. A person opening this tab wants
 * to train something, and the thing they want to train is a body part — so the
 * way in is a picture of that body part with the count of what is filed under
 * it.
 *
 * The button stays. This is a second door to the same room, not a replacement,
 * and somebody who has learned where the button is should not have to relearn.
 *
 * ── the counts are real ──
 *
 * Each tile counts the exercises actually filed under that group, so a library
 * with nothing under Calves shows no Calves tile rather than an empty room with
 * a picture on the door. That also means the grid grows as the library does
 * instead of being a fixed menu that lies about what is behind it.
 */
function MuscleGrid({
  exercises,
  i18n,
  vi,
}: {
  exercises: { muscle_group: string | null }[];
  i18n: ReturnType<typeof useI18n>;
  vi: boolean;
}) {
  /*
    Grouped by *art*, not by stored name.

    `muscle_group` is free text written by two screens in two languages — the
    builder stores "Quads", the library stores "Chân trước" — so counting by the
    raw string would put the same shelf on two tiles. Folding to the art key
    first is what makes one tile mean one body part.
  */
  const counts = new Map<MuscleArtKey, number>();
  for (const e of exercises) {
    const key = muscleArtFor(e.muscle_group);
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const tiles = MUSCLE_TILES.filter((t) => (counts.get(t.key) ?? 0) > 0);
  if (tiles.length === 0) return null;

  return (
    <View style={styles.libSection}>
      <View style={styles.libHead}>
        <Text style={styles.sectionLabel}>{vi ? 'Thư viện bài tập' : 'Exercise library'}</Text>
        <Pressable
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => {
            Haptics.selectionAsync();
            router.push('/exercises');
          }}>
          <Text style={styles.libAll}>{vi ? 'Xem tất cả' : 'See all'}</Text>
        </Pressable>
      </View>
      <View style={styles.libGrid}>
        {tiles.map((t) => {
          const n = counts.get(t.key) ?? 0;
          return (
            <Pressable
              key={t.key}
              accessibilityRole="button"
              accessibilityLabel={`${vi ? t.vi : t.en}, ${n} ${vi ? 'bài' : 'exercises'}`}
              style={({ pressed }) => [styles.libTile, pressed && styles.pressed]}
              onPress={() => {
                Haptics.selectionAsync();
                router.push('/exercises');
              }}>
              <MuscleArt group={t.key} size={64} />
              <Text style={styles.libName} numberOfLines={1}>{vi ? t.vi : t.en}</Text>
              <Text style={styles.libCount}>
                {n} {vi ? 'bài' : n === 1 ? 'exercise' : 'exercises'}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/**
 * Workouts tab — faithful port of the web /workouts page
 * (WorkoutBuilder): template manager with Exercises + Create actions
 * and the Weekly Plan link at the bottom.
 */
export default function WorkoutsScreen() {
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const { weight: wUnit } = useUnits();
  const wl = weightLabel(wUnit);
  const vi = lang === 'vi';
  const { data: templates, isError: templatesFailed } = useWorkoutTemplates();
  // The library already loads on the Exercises screen and is cached under the
  // same key, so the grid costs a read only the first time either is opened.
  const { data: exercises } = useExercises();
  // Recent sessions needs no failure notice of its own: the block only renders
  // when there are sessions, so a failed read makes it absent rather than
  // wrong — and it fails alongside the templates above it, which do say so.
  const { data: sessions } = useWorkoutSessions(14);

  /**
   * One retry for the tab — the same gesture as pull-to-refresh, as a button.
   */
  const queryClient = useQueryClient();
  const [retrying, setRetrying] = useState(false);
  const retry = useCallback(async () => {
    setRetrying(true);
    await queryClient.invalidateQueries();
    setRetrying(false);
  }, [queryClient]);
  const del = useDeleteWorkoutTemplate();
  const delSession = useDeleteWorkoutSession();

  const confirmDelete = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(i18n.nDeleteTemplate, '', [
      { text: i18n.nCancel, style: 'cancel' },
      { text: i18n.nDeleteTemplate, style: 'destructive', onPress: () => del.mutate(id) },
    ]);
  };

  /**
   * Name what goes. Two sessions in a week are often the same template on
   * different days, so the name alone does not identify one — the date is what
   * makes a mistap catchable by reading the alert rather than by noticing the
   * chart afterwards.
   */
  const confirmDeleteSession = (id: string, date_time: string, label: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert(i18n.nDeleteSession, i18n.nDeleteSessionMsg.replace('{x}', label), [
      { text: i18n.cancel, style: 'cancel' },
      {
        text: i18n.delete,
        style: 'destructive',
        onPress: () =>
          delSession.mutate(
            { id, date_time },
            {
              onSuccess: () => {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                toast.success(i18n.deleted);
              },
              onError: (e: Error) => toast.error(e.message),
            },
          ),
      },
    ]);
  };

  /*
    "Templates (0)" and "No templates yet — tap + to create your first" is
    encouragement for a new account and a lie about one whose templates simply
    did not load. Acting on it means rebuilding routines that already exist.

    The header row stays: its buttons open Exercises, the builder and the log
    screen, none of which depend on the read that failed. Taking away working
    navigation because a list did not arrive would be a second problem.
  */
  return (
    <Screen title={i18n.workoutsTitle}>
      {/* "Templates (N)" + actions row (web) */}
      <View style={styles.actionsRow}>
        <Text style={styles.sectionLabel}>
          {/* No count while the read is broken — "(0)" is a claim */}
          {i18n.workoutsTemplates}
          {templatesFailed ? '' : ` (${templates?.length ?? 0})`}
        </Text>
        <View style={styles.actionButtons}>
          <Pressable
            style={({ pressed }) => [styles.outlineBtn, pressed && styles.pressed]}
            onPress={() => {
              Haptics.selectionAsync();
              router.push('/exercises');
            }}>
            <Icon icon={Dumbbell} size={14} color={colors.foreground} />
            <Text style={styles.outlineBtnText}>{i18n.workoutsExercises}</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push('/workout-builder');
            }}>
            <Icon icon={Plus} size={14} color={colors.primaryForeground} strokeWidth={2.5} />
            <Text style={styles.primaryBtnText}>{i18n.workoutsCreateNew}</Text>
          </Pressable>
        </View>
      </View>

      {/* Log workout — native carries this next to templates for daily use */}
      <Pressable
        style={({ pressed }) => [styles.logChip, pressed && styles.pressed]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push('/log-workout');
        }}>
        <Icon icon={Plus} size={12} color="rgba(237,237,237,0.6)" strokeWidth={2.5} />
        <Text style={styles.logChipText}>{i18n.nLogWorkoutBtn}</Text>
      </Pressable>

      <MuscleGrid exercises={exercises ?? []} i18n={i18n} vi={vi} />

      {/* Template cards (web glass-card rows) */}
      {templates && templates.length > 0 ? (
        templates.map((t, i) => (
          <TemplateCard
            key={t.id}
            tpl={t}
            index={i}
            wUnit={wUnit}
            wl={wl}
            i18n={i18n}
            onDelete={confirmDelete}
          />
        ))
      ) : templatesFailed ? (
        <LoadFailed i18n={i18n} onRetry={retry} busy={retrying} />
      ) : (
        <View style={styles.empty}>
          <Icon icon={Dumbbell} size={48} color="rgba(107,107,107,0.35)" />
          <Text style={styles.emptyTitle}>{i18n.workoutsNoTemplates}</Text>
          <Text style={styles.emptyHint}>
            {vi ? 'Nhấn + để tạo mẫu tập đầu tiên' : 'Tap + to create your first template'}
          </Text>
        </View>
      )}

      {/* Logged sessions (last 14 days) — proof that saved logs landed */}
      {sessions && sessions.length > 0 && (
        <Animated.View style={styles.sessionsWrap} entering={rise(templates?.length ?? 0)}>
          <Text style={styles.sectionLabel}>
            {vi ? 'Buổi tập gần đây' : 'Recent sessions'} ({sessions.length})
          </Text>
          <GlassCard style={styles.sessionsCard}>
            {sessions.map((s, i) => {
              const name = s.template_name || 'Workout';
              const day = new Date(s.date_time).toLocaleDateString(getLocale(lang), {
                weekday: 'short', day: 'numeric', month: 'short',
              });
              return (
              <View key={s.id} style={[styles.sessionRow, i > 0 && styles.sessionBorder]}>
                <View style={styles.sessionInfo}>
                  <Text style={styles.sessionName} numberOfLines={1}>{name}</Text>
                  <Text style={styles.sessionMeta}>
                    {day}
                    {s.volume_load != null ? `  ·  ${Math.round(displayWeight(Number(s.volume_load), wUnit)).toLocaleString()} ${wl}` : ''}
                  </Text>
                </View>
                {s.session_rpe != null && (
                  <View style={styles.rpeBadge}>
                    <Icon icon={Flame} size={11} color={colors.metricOrange} />
                    <Text style={styles.rpeText}>RPE {s.session_rpe}</Text>
                  </View>
                )}
                {/* Muted, like the template rows above — a red glyph on every
                    line would make deleting the loudest thing in a list that
                    exists to show the training happened. */}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={i18n.a11yDelete}
                  hitSlop={10}
                  onPress={() => confirmDeleteSession(s.id, s.date_time, `${name} · ${day}`)}
                  style={({ pressed }) => [styles.sessionDel, pressed && styles.pressed]}>
                  <Icon icon={Trash2} size={15} color={colors.mutedForeground} />
                </Pressable>
              </View>
              );
            })}
          </GlassCard>
        </Animated.View>
      )}

      {/* Weekly plan link (web bottom button) */}
      <Pressable
        style={({ pressed }) => [styles.weeklyBtn, pressed && styles.pressed]}
        onPress={() => {
          Haptics.selectionAsync();
          router.push('/routine');
        }}>
        <Icon icon={CalendarDays} size={15} color={colors.metricBlue} />
        <Text style={styles.weeklyBtnText}>{i18n.workoutsWeeklyPlan}</Text>
        <Icon icon={ChevronRight} size={16} color={colors.foreground} />
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  sectionLabel: { fontSize: 14, fontWeight: '600', color: colors.foreground },
  actionButtons: { flexDirection: 'row', gap: spacing.sm },
  outlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 34,
    paddingHorizontal: spacing.md - 4,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: 'rgba(24,24,27,0.2)',
  },
  outlineBtnText: { fontSize: 13, fontWeight: '500', color: colors.foreground },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 34,
    paddingHorizontal: spacing.md - 4,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
  },
  primaryBtnText: { fontSize: 13, fontWeight: '600', color: colors.primaryForeground },
  logChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 36,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(43,43,49,0.3)',
    backgroundColor: 'rgba(24,24,27,0.2)',
  },
  logChipText: { fontSize: 13, fontWeight: '500', color: colors.foreground },
  libSection: { gap: spacing.sm },
  libHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  libAll: { fontSize: 13, fontWeight: '500', color: colors.primary },
  libGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  /*
    Three across. Two makes each tile large enough to show the drawing's
    striations, which is detail nobody reads on a tile; four shrinks the figure
    to the point where chest and shoulders are the same picture.

    `31%` with an 8pt gap rather than `flex: 1`, because a last row holding one
    tile would stretch that tile across the screen.
  */
  libTile: {
    width: '31%',
    alignItems: 'center',
    gap: 2,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: 'rgba(24,24,27,0.35)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(43,43,49,0.35)',
  },
  libName: { fontSize: 13, fontWeight: '600', color: colors.foreground, marginTop: 2 },
  libCount: { fontSize: 11, color: colors.mutedForeground },
  tplCard: { padding: spacing.md },
  exRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.sm,
    marginTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  exName: { fontSize: 13, color: colors.foreground, flex: 1, minWidth: 0 },
  exSets: { fontSize: 12, color: colors.mutedForeground, fontVariant: ['tabular-nums'] },
  tplRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  tplInfo: { flex: 1, minWidth: 0, gap: 4 },
  tplTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  tplName: { fontSize: 14, fontWeight: '500', color: colors.foreground, flexShrink: 1 },
  typeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.full,
    backgroundColor: colors.secondary,
  },
  typeText: { fontSize: 10, color: colors.mutedForeground, textTransform: 'capitalize' },
  tplMeta: { fontSize: 12, color: colors.mutedForeground, fontVariant: ['tabular-nums'] },
  tplActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2 },
  empty: { alignItems: 'center', paddingVertical: spacing.xl * 2, gap: spacing.sm },
  emptyTitle: { ...type.body, fontWeight: '500', color: colors.mutedForeground },
  emptyHint: { fontSize: 12, color: 'rgba(107,107,107,0.6)' },
  sessionsWrap: { gap: spacing.sm },
  sessionsCard: { paddingVertical: 4 },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm + 4,
  },
  sessionBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  sessionInfo: { flex: 1, minWidth: 0, gap: 2 },
  sessionName: { fontSize: 14, fontWeight: '500', color: colors.foreground },
  sessionMeta: { fontSize: 11, color: colors.mutedForeground, fontVariant: ['tabular-nums'], textTransform: 'capitalize' },
  rpeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,145,48,0.12)',
  },
  rpeText: { fontSize: 10, fontWeight: '600', color: colors.metricOrange, fontVariant: ['tabular-nums'] },
  // 28pt of ink with hitSlop 10 on top — 48pt of target, past the 44pt minimum
  sessionDel: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  weeklyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    height: 44,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: 'rgba(24,24,27,0.2)',
  },
  weeklyBtnText: { fontSize: 14, fontWeight: '500', color: colors.foreground },
  pressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
});
