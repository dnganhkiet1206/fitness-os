import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { CalendarDays, ChevronRight, Dumbbell, Flame, Plus, Trash2 } from 'lucide-react-native';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { rise } from '@/lib/entrance';

import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { Screen } from '@/components/ascnd/screen';
import { colors, glass, radius, spacing, type } from '@/constants/ascnd';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { useDeleteWorkoutSession, useWorkoutSessions } from '@/hooks/use-fitness-data';
import { useExercises, useDeleteWorkoutTemplate, useWorkoutTemplates } from '@/hooks/use-library';
import { useUnits } from '@/hooks/use-units';
import { getLocale } from '@/lib/i18n';
import { toast } from '@/lib/toast';
import { displayWeight, weightLabel } from '@/lib/units';
import { LoadFailed } from '@/components/ascnd/load-failed';
import { MuscleArt } from '@/components/ascnd/muscle-art';
import { newestFirst, TemplateList } from '@/components/ascnd/template-list';
import { muscleArtKeysFor, type MuscleArtKey } from '@/lib/muscle-group';

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

/** How many of the saved workouts the tab shows before "See all" takes over. */
const PREVIEW = 3;

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
 * ── every group, every time ──
 *
 * All ten show, including the ones with nothing filed under them yet. The grid
 * is a menu of what the app knows about as much as a view of what is in the
 * library, and a menu that changes shape as exercises are added is one you have
 * to re-read every visit — the chest tile moving because calves appeared is
 * motion that means nothing.
 *
 * A group with no *art* still gets no tile. That is a different thing: the
 * missing piece there is a picture, not a shelf.
 *
 * ── the counts are real, or they are absent ──
 *
 * Each tile counts what is actually filed under it. If the read failed, the
 * count is left off rather than printed as zero — "0 bài" is a claim about the
 * library, and the claim would be wrong. Same rule the templates header above
 * already follows.
 */
function MuscleGrid({
  exercises,
  failed,
  vi,
}: {
  exercises: { muscle_group: string | null }[];
  /** the library did not load — show the shelves, do not claim they are empty */
  failed: boolean;
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
    // `Lưng/Chân` is two groups and both are true, so the deadlift is counted
    // under each. The tiles therefore sum to more than the library holds — a
    // tile says how many exercises work that muscle, not how many are filed
    // there and nowhere else.
    for (const key of muscleArtKeysFor(e.muscle_group)) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }


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
        {MUSCLE_TILES.map((t) => {
          const n = counts.get(t.key) ?? 0;
          return (
            <Pressable
              key={t.key}
              accessibilityRole="button"
              accessibilityLabel={
                failed ? (vi ? t.vi : t.en) : `${vi ? t.vi : t.en}, ${n} ${vi ? 'bài' : 'exercises'}`
              }
              style={({ pressed }) => [styles.libTile, pressed && styles.pressed]}
              onPress={() => {
                Haptics.selectionAsync();
                // The art key, not the caption: the caption is a display string
                // and the library has to match against every spelling of the
                // group, which is what the key stands for.
                router.push({ pathname: '/exercises', params: { group: t.key } });
              }}>
              <MuscleArt group={t.key} size={64} />
              <Text style={styles.libName} numberOfLines={1}>{vi ? t.vi : t.en}</Text>
              {failed ? null : (
                <Text style={styles.libCount}>
                  {n} {vi ? 'bài' : n === 1 ? 'exercise' : 'exercises'}
                </Text>
              )}
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
  const { data: exercises, isError: exercisesFailed } = useExercises();
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
      {/*
        The two ways in, with no label of their own.

        This row used to be captioned "Templates (N)", which is now the heading
        of the workout list further down — and a screen that says the same thing
        twice makes you read both to find out they are the same thing. The
        buttons are self-describing, so the caption was the part to drop.
      */}
      <View style={styles.actionsRow}>
        <View style={styles.actionButtons}>
          <Pressable
            style={({ pressed }) => [styles.outlineBtn, pressed && styles.pressed]}
            onPress={() => {
              Haptics.selectionAsync();
              router.push('/exercises');
            }}>
            <Icon icon={Dumbbell} size={14} />
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

      <MuscleGrid exercises={exercises ?? []} failed={exercisesFailed} vi={vi} />

      {/*
        The workout list — its own section, headed like the library above it.

        Three rows, newest first, and the rest behind "See all". A tab is a
        summary: the workout you saved a minute ago is the one you came back
        for, and the twelfth one you wrote in March is not worth the scroll it
        costs everyone else. Three is the number the section can show without
        pushing the recent sessions off the screen.

        "See all" is always there, count regardless — the same as the exercise
        library's directly above it, and for the same reason: it leads somewhere
        that does *more*, not somewhere that shows more. With three saved it is
        still the only place with a search field and the create button. That is
        what keeps it from being the chevron-that-does-nothing this list was
        rebuilt to get rid of.
      */}
      {templates && templates.length > 0 ? (
        <View style={styles.tplSection}>
          <View style={styles.libHead}>
            {/* The count is safe here in a way it was not in the old header:
                this block only renders when the read succeeded and returned
                something, so it can never print the "(0)" that would be a claim
                about a list that simply did not arrive. */}
            <Text style={styles.sectionLabel}>
              {vi ? 'Danh sách buổi tập' : 'Workout list'} ({templates.length})
            </Text>
            <Pressable
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => {
                Haptics.selectionAsync();
                router.push('/templates');
              }}>
              <Text style={styles.libAll}>{vi ? 'Xem tất cả' : 'See all'}</Text>
            </Pressable>
          </View>

          <TemplateList
            templates={newestFirst(templates).slice(0, PREVIEW)}
            wUnit={wUnit}
            wl={wl}
            i18n={i18n}
            onDelete={confirmDelete}
          />
        </View>
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
                    <Icon icon={Flame} size={11} />
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
  /* Right-aligned. `space-between` put them there only while a caption held the
     left end; with the caption gone it pushed them to the left instead, which
     is not where they had been. */
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
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
  libAll: { ...type.footnote, color: colors.primary },
  libGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  /*
    Three across. Two makes each tile large enough to show the drawing's
    striations, which is detail nobody reads on a tile; four shrinks the figure
    to the point where chest and shoulders are the same picture.

    `31%` with an 8pt gap rather than `flex: 1`, because a last row holding one
    tile would stretch that tile across the screen.
  */
  /*
    The same surface as every other card, not a colour invented for this grid.

    It had a hand-picked `rgba(24,24,27,0.35)` fill and a `rgba(43,43,49,0.35)`
    border, which is a *fourth* dark in a screen that already has three, and it
    is what made the section read as pasted in from somewhere else. `glass` is
    what the templates, the sessions and every card on every other tab are made
    of; a tile made of it belongs to the app whether or not anyone can say why.
  */
  libTile: {
    width: '31%',
    alignItems: 'center',
    gap: 1,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm + 2,
    borderRadius: radius.md,
    backgroundColor: glass.bg,
    borderWidth: glass.borderWidth,
    borderColor: glass.border,
  },
  // From the type scale rather than ad-hoc sizes, for the same reason.
  libName: { ...type.footnote, fontWeight: '600', color: colors.foreground, marginTop: 4 },
  libCount: { ...type.caption, color: colors.mutedForeground },
  /* The list's own section, spaced like the library's above it. */
  tplSection: { gap: spacing.sm },
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
