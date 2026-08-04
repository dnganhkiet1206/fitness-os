import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { Check, Moon, Timer } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { Screen } from '@/components/ascnd/screen';
import type { TplExercise } from '@/components/ascnd/template-list';
import { colors, glass, radius, spacing, type } from '@/constants/ascnd';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { useLogWorkoutSession } from '@/hooks/use-fitness-data';
import { useRoutineDays, useWorkoutTemplates } from '@/hooks/use-library';
import { useUnits } from '@/hooks/use-units';
import { rise } from '@/lib/entrance';
import { localDateStr, weekDates } from '@/lib/local-date';
import { DEFAULT_REST, DEFAULT_RPE, restLabel } from '@/lib/prescription';
import { toast } from '@/lib/toast';
import { displayWeight, weightLabel } from '@/lib/units';

/**
 * One day of the week, as the thing you do rather than the thing you planned.
 *
 * ── why the week could not be this ──
 *
 * The week screen answers "what am I doing and have I done it" for seven days
 * at once, which is the right question to ask from the sofa and the wrong one
 * to ask between sets. Standing at a rack you need the opposite: one day, every
 * set of it, and somewhere to record that the third one is behind you.
 *
 * Those do not fit on one screen. Seven days × six exercises × four sets is a
 * hundred and sixty rows, and a week you have to scroll for a minute is not a
 * week. So the week stays a summary and this is the day.
 *
 * ── a set is the unit ──
 *
 * The plan stores `3 × 10 at 60 kg` as one exercise. That is how it is written
 * and it is not how it is done: three sets happen at three different times,
 * separated by rest, and the third one is the one that comes in two reps light.
 * So the plan is expanded — one row per set — and each row is ticked on its
 * own.
 *
 * Effort is per set for the same reason. It is stored per set on the session
 * already; there was simply never anywhere to enter it. The plan's number is
 * the starting point and each row can move off it, because "the last one was a
 * 9" is the whole reason anybody records effort at all.
 *
 * ── rest is a countdown, not a label ──
 *
 * Ticking a set starts its rest running. A number sitting in a row cannot tell
 * you when to go again; a clock can, and it is the only thing on this screen
 * that has to be looked at while you are not holding the phone.
 *
 * ── today only ──
 *
 * A finished session is stamped now, so a day that is not today can be read and
 * not ticked. Recording Tuesday's workout on Thursday needs a date on the
 * session and a second day to recompute — that is a different feature, and
 * doing it silently would file the work under the wrong day.
 */

const DAY_LONG_EN = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_LONG_VI = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];

/** The scale the builder offers, so the two screens ask for the same thing. */
const RPE_CHOICES = [6, 7, 8, 9, 10] as const;

/** One row: a set of one exercise, and what you did with it. */
interface SetRow {
  key: string;
  exerciseName: string;
  /** index of this set within its exercise, 1-based */
  ordinal: number;
  /** how many sets the exercise has — the row says "1 of 3" */
  of: number;
  /** kilograms, as stored */
  weight: number;
  reps: number;
  rest: number;
  plannedRpe: number;
  /** true when this row is the first of its exercise, so the name is printed */
  heads: boolean;
}

function expand(exercises: TplExercise[]): SetRow[] {
  const rows: SetRow[] = [];
  exercises.forEach((ex, i) => {
    /*
      Clamped. `exercises` is free JSON on the template row — a number written
      by an older version of the app, or by hand, can be anything, and a set
      count of 4000 would build 4000 views before anything on this screen got
      the chance to look wrong.
    */
    const count = Math.max(1, Math.min(20, Math.round(ex.sets ?? 1)));
    for (let n = 0; n < count; n++) {
      rows.push({
        key: `${i}-${n}`,
        exerciseName: ex.exerciseName ?? '',
        ordinal: n + 1,
        of: count,
        weight: ex.weight ?? 0,
        reps: ex.reps ?? 0,
        rest: ex.restSeconds ?? DEFAULT_REST,
        plannedRpe: ex.rpe ?? DEFAULT_RPE,
        heads: n === 0,
      });
    }
  });
  return rows;
}

/**
 * Where a half-finished workout is kept.
 *
 * Keyed by the date and the workout, so changing the day's assignment mid-week
 * does not resurrect ticks that belonged to a different set of exercises.
 *
 * It exists because a workout is an hour long and the phone goes in a pocket
 * between every set. Losing forty minutes of ticking to an app the OS decided
 * to evict is the kind of thing that stops somebody using a feature entirely,
 * and the fix is two lines of storage.
 */
const progressKey = (dateStr: string, templateId: string) => `routine-day:${dateStr}:${templateId}`;

export default function RoutineDayScreen() {
  const { day } = useLocalSearchParams<{ day?: string }>();
  const idx = Math.max(0, Math.min(6, Number(day ?? 0) || 0));

  const { data: days } = useRoutineDays();
  const { data: templates } = useWorkoutTemplates();
  const { lang } = useAppSettings();
  const { weight: wUnit } = useUnits();
  const i18n = useI18n();
  const log = useLogWorkoutSession();

  const wl = weightLabel(wUnit);
  const names = lang === 'vi' ? DAY_LONG_VI : DAY_LONG_EN;
  const date = weekDates()[idx];
  const dateStr = localDateStr(date);
  const isToday = dateStr === localDateStr();

  const routine = (days ?? []).find((d) => d.day_of_week === idx);
  const tpl = routine?.template_id ? templates?.find((t) => t.id === routine.template_id) ?? null : null;
  const exercises: TplExercise[] = Array.isArray(tpl?.exercises) ? (tpl.exercises as TplExercise[]) : [];
  const rows = useMemo(() => expand(exercises), [tpl?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /** which sets are done, and at what effort */
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [rpe, setRpe] = useState<Record<string, number>>({});
  /** the one row showing its effort chips — at most one, so the list stays short */
  const [editing, setEditing] = useState<string | null>(null);
  /** seconds left on the current rest, or null when nothing is running */
  const [resting, setResting] = useState<number | null>(null);

  /*
    Read back once, and only once.

    `loaded` guards the write-back below as much as the read: without it the
    first render would persist an empty object over whatever was stored, before
    the read had a chance to return.
  */
  const storeKey = tpl ? progressKey(dateStr, tpl.id) : null;
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let alive = true;
    if (!storeKey) return;
    setLoaded(false);
    AsyncStorage.getItem(storeKey)
      .then((raw) => {
        if (!alive) return;
        if (raw) {
          try {
            const saved = JSON.parse(raw) as { done?: Record<string, boolean>; rpe?: Record<string, number> };
            setDone(saved.done ?? {});
            setRpe(saved.rpe ?? {});
          } catch {
            // a corrupt entry is not worth a crash — start the workout fresh
          }
        }
        setLoaded(true);
      })
      .catch(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, [storeKey]);

  useEffect(() => {
    if (!storeKey || !loaded) return;
    AsyncStorage.setItem(storeKey, JSON.stringify({ done, rpe })).catch(() => {
      // losing the resume point is survivable; interrupting the workout is not
    });
  }, [storeKey, loaded, done, rpe]);

  /*
    The rest clock.

    One interval, started when a rest begins and cleared when it ends, rather
    than a timer that runs for the whole session and checks whether it has
    anything to do. It counts down in whole seconds because that is the only
    resolution the display has.
  */
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (resting === null) return;
    tick.current = setInterval(() => {
      setResting((s) => {
        if (s === null) return null;
        if (s <= 1) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          return null;
        }
        return s - 1;
      });
    }, 1000);
    return () => {
      if (tick.current) clearInterval(tick.current);
    };
  }, [resting === null]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = useCallback(
    (row: SetRow) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setDone((prev) => {
        const next = { ...prev, [row.key]: !prev[row.key] };
        // Rest belongs to finishing a set, not to changing your mind about one.
        if (next[row.key] && row.rest > 0) setResting(row.rest);
        else setResting(null);
        return next;
      });
    },
    [],
  );

  const doneRows = rows.filter((r) => done[r.key]);
  const volume = doneRows.reduce((s, r) => s + r.weight * r.reps, 0);

  const finish = () => {
    if (doneRows.length === 0) return;
    const sets = doneRows.map((r) => ({
      exerciseId: '',
      exerciseName: r.exerciseName,
      weight: r.weight,
      reps: r.reps,
      rpe: rpe[r.key] ?? r.plannedRpe,
    }));
    log.mutate(
      {
        templateName: tpl?.name ?? '',
        // A session is remembered by its hardest part, and every set that
        // happened has a number of its own now, so this is read rather than
        // asked for a second time.
        sessionRpe: Math.max(...sets.map((s) => s.rpe)),
        sets,
      },
      {
        onSuccess: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          if (storeKey) AsyncStorage.removeItem(storeKey).catch(() => {});
          toast.success(i18n.nRdSaved);
          router.back();
        },
        onError: (e: Error) => toast.error(e.message),
      },
    );
  };

  return (
    <Screen back title={names[idx]}>
      {!tpl ? (
        <GlassCard style={styles.empty}>
          <Icon icon={Moon} size={22} color={colors.mutedForeground} />
          <Text style={styles.emptyText}>
            {routine?.is_rest ? i18n.nRoutineRestDay : i18n.nRdEmptyPlan}
          </Text>
          <Text style={styles.emptyHint}>{i18n.nRoutineRestHint}</Text>
        </GlassCard>
      ) : (
        <>
          <View style={styles.head}>
            <Text style={styles.tplName}>{tpl.name}</Text>
            <Text style={styles.progress}>
              {i18n.nRdProgress
                .replace('{done}', String(doneRows.length))
                .replace('{total}', String(rows.length))}
              {volume > 0
                ? `  ·  ${Math.round(displayWeight(volume, wUnit)).toLocaleString()} ${wl}`
                : ''}
            </Text>
            {/* A bar rather than a percentage: what you want mid-workout is
                "how much is left", which is a length, not a number to read. */}
            <View style={styles.barTrack}>
              <View
                style={[
                  styles.barFill,
                  { width: `${rows.length ? (doneRows.length / rows.length) * 100 : 0}%` },
                ]}
              />
            </View>
            {!isToday ? <Text style={styles.preview}>{i18n.nRdPreview}</Text> : null}
          </View>

          {rows.map((row, i) => {
            const isDone = !!done[row.key];
            const effort = rpe[row.key] ?? row.plannedRpe;
            return (
              <Animated.View key={row.key} entering={rise(Math.min(i, 8))}>
                {row.heads ? <Text style={styles.exName}>{row.exerciseName}</Text> : null}
                <GlassCard style={[styles.setCard, isDone && styles.setCardDone]}>
                  <View style={styles.setRow}>
                    <Pressable
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: isDone, disabled: !isToday }}
                      accessibilityLabel={`${row.exerciseName} ${i18n.nRdSet.replace('{n}', String(row.ordinal))}`}
                      // 26pt of box and 12 of slop each side — the most-tapped
                      // control on the screen, pressed with a hand that has
                      // just put a barbell down.
                      hitSlop={12}
                      onPress={() => isToday && toggle(row)}
                      style={({ pressed }) => [
                        styles.check,
                        isDone && styles.checkOn,
                        !isToday && styles.checkOff,
                        pressed && styles.pressed,
                      ]}>
                      {isDone ? (
                        <Icon icon={Check} size={15} color={colors.primaryForeground} strokeWidth={3} />
                      ) : null}
                    </Pressable>

                    <View style={styles.setText}>
                      <Text style={[styles.setMain, isDone && styles.setMainDone]} numberOfLines={1}>
                        {i18n.nRdSet.replace('{n}', String(row.ordinal))} / {row.of}
                        {'   '}
                        {row.weight > 0
                          ? `${Math.round(displayWeight(row.weight, wUnit) * 10) / 10} ${wl}`
                          : i18n.nRdBodyweight}
                        {' × '}
                        {row.reps}
                      </Text>
                      <Text style={styles.setRest}>
                        {i18n.nTplRest.replace('{x}', restLabel(row.rest))}
                      </Text>
                    </View>

                    {/*
                      Collapsed to the current value, opened by tapping it.

                      Five chips on every row is thirty controls on a six-set
                      workout, all of them the same shape, none of them the one
                      you are looking for. The value you already have is the
                      answer nine times out of ten; the chips are for the tenth.
                    */}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${i18n.nWbEffort} ${effort}`}
                      hitSlop={12}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setEditing((k) => (k === row.key ? null : row.key));
                      }}
                      style={({ pressed }) => [styles.rpeChip, pressed && styles.pressed]}>
                      <Text style={styles.rpeChipText}>RPE {effort}</Text>
                    </Pressable>
                  </View>

                  {editing === row.key ? (
                    <Animated.View entering={FadeIn.duration(140)} exiting={FadeOut.duration(100)} style={styles.rpeRow}>
                      {RPE_CHOICES.map((v) => (
                        <Pressable
                          key={v}
                          accessibilityRole="button"
                          accessibilityState={{ selected: v === effort }}
                          onPress={() => {
                            Haptics.selectionAsync();
                            setRpe((prev) => ({ ...prev, [row.key]: v }));
                            setEditing(null);
                          }}
                          style={({ pressed }) => [
                            styles.rpeOption,
                            v === effort && styles.rpeOptionOn,
                            pressed && styles.pressed,
                          ]}>
                          <Text style={[styles.rpeOptionText, v === effort && styles.rpeOptionTextOn]}>{v}</Text>
                        </Pressable>
                      ))}
                    </Animated.View>
                  ) : null}
                </GlassCard>
              </Animated.View>
            );
          })}

          {isToday ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: doneRows.length === 0 || log.isPending }}
              disabled={doneRows.length === 0 || log.isPending}
              onPress={finish}
              style={({ pressed }) => [
                styles.finish,
                (doneRows.length === 0 || log.isPending) && styles.finishOff,
                pressed && styles.pressed,
              ]}>
              <Icon icon={Check} size={17} color={colors.primaryForeground} strokeWidth={2.5} />
              <Text style={styles.finishText}>{i18n.nRdFinish}</Text>
            </Pressable>
          ) : null}
        </>
      )}

      {/*
        The rest clock, pinned above the content.

        It is the one thing here that has to be readable when the phone is on a
        bench two feet away, and it is useless where the list has scrolled to.
        Tapping it ends the rest, because the set you are about to do is a
        better authority on whether you are ready than the number is.
      */}
      {resting !== null ? (
        <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(140)} style={styles.restBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={i18n.nRdSkip}
            onPress={() => {
              Haptics.selectionAsync();
              setResting(null);
            }}
            style={({ pressed }) => [styles.restInner, pressed && styles.pressed]}>
            <Icon icon={Timer} size={16} color={colors.metricBlue} />
            <Text style={styles.restLabel}>{i18n.nRdResting}</Text>
            <Text style={styles.restClock}>{restLabel(resting)}</Text>
            <Text style={styles.restSkip}>{i18n.nRdSkip}</Text>
          </Pressable>
        </Animated.View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  emptyText: { ...type.body, color: colors.foreground },
  emptyHint: { ...type.footnote, color: colors.mutedForeground },

  head: { gap: spacing.sm },
  tplName: { ...type.title2, color: colors.foreground },
  progress: { ...type.footnote, color: colors.mutedForeground, fontVariant: ['tabular-nums'] },
  barTrack: { height: 4, borderRadius: 2, backgroundColor: glass.bg, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 2, backgroundColor: colors.primary },
  preview: { ...type.caption, color: colors.mutedForeground },

  /* The exercise name is a heading over its sets, not a row of its own — the
     rows below it are the thing, and giving the name a card would make four
     sets of one movement look like five separate items. */
  exName: {
    ...type.footnote,
    color: colors.foreground,
    fontWeight: '600',
    marginTop: spacing.sm,
    marginBottom: 2,
  },
  setCard: { padding: spacing.sm + 2, gap: spacing.sm },
  setCardDone: { opacity: 0.62 },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2 },
  check: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  checkOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkOff: { opacity: 0.4 },
  setText: { flex: 1, minWidth: 0, gap: 1 },
  setMain: { ...type.footnote, color: colors.foreground, fontVariant: ['tabular-nums'] },
  setMainDone: { textDecorationLine: 'line-through', color: colors.mutedForeground },
  setRest: { ...type.caption, color: colors.mutedForeground, fontVariant: ['tabular-nums'] },
  rpeChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radius.full,
    backgroundColor: glass.bg,
    borderWidth: glass.borderWidth,
    borderColor: glass.border,
  },
  rpeChipText: { ...type.caption, color: colors.foreground, fontWeight: '600', fontVariant: ['tabular-nums'] },
  rpeRow: { flexDirection: 'row', gap: 6, justifyContent: 'flex-end' },
  rpeOption: {
    minWidth: 38,
    height: 32,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: glass.bg,
    borderWidth: glass.borderWidth,
    borderColor: glass.border,
  },
  rpeOptionOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  rpeOptionText: { ...type.footnote, color: colors.foreground, fontVariant: ['tabular-nums'] },
  rpeOptionTextOn: { color: colors.primaryForeground, fontWeight: '700' },

  finish: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 52,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    marginTop: spacing.sm,
  },
  finishOff: { opacity: 0.4 },
  finishText: { ...type.body, color: colors.primaryForeground, fontWeight: '600' },

  restBar: { position: 'absolute', left: spacing.md, right: spacing.md, bottom: spacing.lg },
  restInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 48,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(18,18,22,0.96)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  restLabel: { ...type.footnote, color: colors.mutedForeground },
  restClock: {
    ...type.title2,
    color: colors.foreground,
    fontVariant: ['tabular-nums'],
    flex: 1,
    textAlign: 'center',
  },
  restSkip: { ...type.footnote, color: colors.metricBlue, fontWeight: '600' },
  pressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
});
