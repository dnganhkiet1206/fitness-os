import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { Check, Minus, Moon, Pencil, Plus, Timer } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { RestTimer } from '@/components/ascnd/rest-timer';
import type { TplExercise } from '@/components/ascnd/template-list';
import { colors, glass, radius, spacing, type } from '@/constants/ascnd';
import type { useI18n } from '@/hooks/use-app-settings';
import { useLogWorkoutSession } from '@/hooks/use-fitness-data';
import { useUnits } from '@/hooks/use-units';
import { rise } from '@/lib/entrance';
import { dayProgressKey, staleDayProgress } from '@/lib/local-date';
import { DEFAULT_REST, DEFAULT_RPE, restLabel } from '@/lib/prescription';
import { toast } from '@/lib/toast';
import { displayWeight, weightLabel } from '@/lib/units';

/**
 * One day of the week, as the thing you do rather than the thing you planned.
 *
 * ── a set is the unit ──
 *
 * The plan stores `3 × 10 at 60 kg` as one exercise. That is how it is written
 * and it is not how it is done: three sets happen at three different times,
 * separated by rest, and the third one is the one that comes in two reps light.
 * So the plan is expanded — one row per set — and each row is ticked on its own.
 *
 * Effort and rest are per set for the same reason. Effort is already stored per
 * set on the session; there was simply never anywhere to enter it. Rest is the
 * one you change mid-workout — the plan says ninety seconds and the fourth set
 * says otherwise — so it is adjustable in the row and on the clock while it is
 * running.
 *
 * ── rest is a countdown, not a label ──
 *
 * Ticking a set starts its rest running. A number sitting in a row cannot tell
 * you when to go again; a clock can, and it is the only thing here that has to
 * be readable while you are not holding the phone.
 *
 * ── it lives in the week, not on a screen of its own ──
 *
 * It was a pushed screen for one commit. That put the day one navigation away
 * from the week and made the strip of dates at the top of the week decorative,
 * which is the same as broken: a row of dates you cannot tap is not a calendar.
 * Picking a day up there and reading it down here is one screen doing one job.
 */

/** The scale the builder offers, so the two screens ask for the same thing. */
const RPE_CHOICES = [6, 7, 8, 9, 10] as const;

/**
 * What the top of the scale costs you, in colour.
 *
 * Six and seven are work — they carry no colour, because a set you had four
 * reps left in is not news and colouring it would spend the reader's attention
 * on the ordinary case.
 *
 * The last three are the ones with consequences, and they are the app's own
 * warning ramp rather than three colours picked to look different:
 *
 *   8   two reps left, the edge of productive work        yellow
 *   9   one rep left, close enough to miss the next one   orange
 *   10  nothing left, the set ended because you could not   red
 *
 * That is the same yellow, orange and red the readiness score uses for the same
 * meaning — approaching a limit, at it, past it — so somebody who has read one
 * of them has read both. It is deliberately *not* a green-to-red scale: green
 * would say a light set is good and a hard one is bad, and effort is a
 * prescription, not a grade. Nothing here is green.
 */
const EFFORT_TINT: Record<number, string> = {
  8: colors.readinessYellow,
  9: colors.metricOrange,
  10: colors.readinessRed,
};
const tintFor = (rpe: number) => EFFORT_TINT[rpe] ?? colors.foreground;

/** Rest moves in fifteens, which is how a gym clock is read. */
const REST_STEP = 15;
const REST_MAX = 600;

/** One row: a set of one exercise, and what you did with it. */
interface SetRow {
  key: string;
  exerciseName: string;
  ordinal: number;
  of: number;
  /** kilograms, as stored */
  weight: number;
  reps: number;
  plannedRest: number;
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
      count of 4000 would build 4000 views before anything here looked wrong.
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
        plannedRest: ex.restSeconds ?? DEFAULT_REST,
        plannedRpe: ex.rpe ?? DEFAULT_RPE,
        heads: n === 0,
      });
    }
  });
  return rows;
}

/**
 * Throw away the resume points that can no longer be resumed.
 *
 * Runs once when the panel first mounts, not on every day you flick through:
 * it reads every key in storage, and doing that seven times while somebody
 * scrubs across the week is seven reads to delete nothing.
 *
 * Failures are swallowed on purpose. This is housekeeping — a workout must not
 * fail to open because a cleanup could not run.
 */
let pruned = false;
async function pruneOldProgress() {
  if (pruned) return;
  pruned = true;
  try {
    const stale = staleDayProgress(await AsyncStorage.getAllKeys());
    // `removeMany`, not `multiMove`/`multiRemove` — this version of
    // `@react-native-async-storage/async-storage` renamed the batch methods
    // (`getMany`/`setMany`/`removeMany`) and the old names do not exist.
    if (stale.length) await AsyncStorage.removeMany(stale);
  } catch {
    // nothing here is worth interrupting a workout for
  }
}

export function DayPlan({
  dateStr,
  template,
  isRest,
  i18n,
  onEdit,
}: {
  /** the calendar day being shown, `YYYY-MM-DD` — what a finished session is filed under */
  dateStr: string;
  template: { id: string; name: string; exercises?: unknown } | null;
  isRest: boolean;
  i18n: ReturnType<typeof useI18n>;
  onEdit: () => void;
}) {
  const { weight: wUnit } = useUnits();
  const log = useLogWorkoutSession();
  const wl = weightLabel(wUnit);

  const exercises: TplExercise[] = Array.isArray(template?.exercises)
    ? (template.exercises as TplExercise[])
    : [];
  const rows = useMemo(() => expand(exercises), [template?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /** what was done, and at what effort and rest */
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [rpe, setRpe] = useState<Record<string, number>>({});
  const [rest, setRest] = useState<Record<string, number>>({});
  /** the one row showing its editors — at most one, so the list stays short */
  const [editing, setEditing] = useState<string | null>(null);
  /**
   * The rest that is running: how long is left and what it began at.
   *
   * The ring needs both. `left` alone would have nothing to be a fraction of,
   * and taking the fraction from the *set's* planned rest would break the
   * moment somebody adds thirty seconds mid-rest — the ring would sit past
   * full and then jump.
   */
  const [resting, setResting] = useState<{ left: number; total: number } | null>(null);

  /*
    Read back once, and only once.

    `loaded` guards the write-back below as much as the read: without it the
    first render would persist an empty object over whatever was stored, before
    the read had a chance to return.
  */
  const storeKey = template ? dayProgressKey(dateStr, template.id) : null;
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let alive = true;
    if (!storeKey) return;
    void pruneOldProgress();
    setLoaded(false);
    AsyncStorage.getItem(storeKey)
      .then((raw) => {
        if (!alive) return;
        if (raw) {
          try {
            const saved = JSON.parse(raw) as {
              done?: Record<string, boolean>;
              rpe?: Record<string, number>;
              rest?: Record<string, number>;
            };
            setDone(saved.done ?? {});
            setRpe(saved.rpe ?? {});
            setRest(saved.rest ?? {});
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

  /*
    One panel opens by itself, on the first set that is not done yet.

    Two chips reading `1:30` and `RPE 8` look like a readout, and a readout is
    not something anybody tries to press. The rest and the effort were both
    adjustable from the day this screen existed and neither was findable, which
    is the same as neither existing.

    So the first one is already open. It shows the stepper and the scale, it
    closes the moment a choice is made, and every other row behaves normally
    from then on — the demonstration costs one tap to dismiss and is never
    repeated within a day.

    Held in a ref rather than in state: it must fire once per mounted day, and
    this component is remounted per day by its key, so a ref is exactly the
    lifetime wanted.
  */
  const introduced = useRef(false);
  useEffect(() => {
    if (!loaded || introduced.current || rows.length === 0) return;
    introduced.current = true;
    setEditing((rows.find((r) => !done[r.key]) ?? rows[0]).key);
    // `done` is read once, at the moment the resume point lands; depending on
    // it would re-run this every time a set is ticked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, rows]);

  useEffect(() => {
    if (!storeKey || !loaded) return;
    AsyncStorage.setItem(storeKey, JSON.stringify({ done, rpe, rest })).catch(() => {
      // losing the resume point is survivable; interrupting the workout is not
    });
  }, [storeKey, loaded, done, rpe, rest]);

  /*
    The rest clock.

    One interval, started when a rest begins and cleared when it ends, rather
    than a timer that runs for the whole session and checks whether it has
    anything to do.
  */
  const running = resting !== null;
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setResting((s) => {
        if (s === null) return null;
        if (s.left <= 1) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          return null;
        }
        return { ...s, left: s.left - 1 };
      });
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  const restOf = useCallback((row: SetRow) => rest[row.key] ?? row.plannedRest, [rest]);

  const toggle = useCallback(
    (row: SetRow) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const secs = rest[row.key] ?? row.plannedRest;
      setDone((prev) => {
        const next = { ...prev, [row.key]: !prev[row.key] };
        // Rest belongs to finishing a set, not to changing your mind about one.
        setResting(next[row.key] && secs > 0 ? { left: secs, total: secs } : null);
        return next;
      });
    },
    [rest],
  );

  const bumpRest = (row: SetRow, by: number) => {
    Haptics.selectionAsync();
    setRest((prev) => ({
      ...prev,
      [row.key]: Math.max(0, Math.min(REST_MAX, (prev[row.key] ?? row.plannedRest) + by)),
    }));
  };

  const doneRows = rows.filter((r) => done[r.key]);
  /*
    One save per visit to this day. `isSuccess` never goes back to false on its
    own, and this panel is remounted whenever the selected day changes, so the
    lifetime of the guard is exactly the lifetime of the workout being logged.
  */
  const canFinish = doneRows.length > 0 && !log.isPending && !log.isSuccess;
  const volume = doneRows.reduce((s, r) => s + r.weight * r.reps, 0);

  const finish = () => {
    if (!canFinish) return;
    const sets = doneRows.map((r) => ({
      exerciseId: '',
      exerciseName: r.exerciseName,
      weight: r.weight,
      reps: r.reps,
      rpe: rpe[r.key] ?? r.plannedRpe,
    }));
    log.mutate(
      {
        templateName: template?.name ?? '',
        // A session is remembered by its hardest part, and every set that
        // happened has a number of its own now, so this is read rather than
        // asked for a second time.
        sessionRpe: Math.max(...sets.map((s) => s.rpe)),
        sets,
        // The day being looked at, not the day it is — you can tick Monday's
        // last set on Tuesday morning and it still belongs to Monday.
        date: dateStr,
      },
      {
        onSuccess: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          if (storeKey) AsyncStorage.removeItem(storeKey).catch(() => {});
          toast.success(i18n.nRdSaved);
        },
        onError: (e: Error) => toast.error(e.message),
      },
    );
  };

  if (!template) {
    return (
      <GlassCard style={styles.empty}>
        <Icon icon={Moon} size={22} color={colors.mutedForeground} />
        <Text style={styles.emptyText}>{isRest ? i18n.nRoutineRestDay : i18n.nRdEmptyPlan}</Text>
        <Text style={styles.emptyHint}>{i18n.nRoutineRestHint}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={onEdit}
          style={({ pressed }) => [styles.emptyBtn, pressed && styles.pressed]}>
          <Icon icon={Pencil} size={13} color={colors.foreground} />
          <Text style={styles.emptyBtnText}>{i18n.nChooseWorkout}</Text>
        </Pressable>
      </GlassCard>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <View style={styles.headText}>
          <Text style={styles.tplName} numberOfLines={1}>{template.name}</Text>
          <Text style={styles.progress}>
            {i18n.nRdProgress
              .replace('{done}', String(doneRows.length))
              .replace('{total}', String(rows.length))}
            {volume > 0 ? `  ·  ${Math.round(displayWeight(volume, wUnit)).toLocaleString()} ${wl}` : ''}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={i18n.nChooseWorkout}
          hitSlop={12}
          onPress={onEdit}
          style={({ pressed }) => [styles.editBtn, pressed && styles.pressed]}>
          <Icon icon={Pencil} size={14} color={colors.mutedForeground} />
        </Pressable>
      </View>

      {/* A bar rather than a percentage: what you want mid-workout is "how much
          is left", which is a length, not a number to read. */}
      <View style={styles.barTrack}>
        <View
          style={[styles.barFill, { width: `${rows.length ? (doneRows.length / rows.length) * 100 : 0}%` }]}
        />
      </View>

      {rows.map((row, i) => {
        const isDone = !!done[row.key];
        const effort = rpe[row.key] ?? row.plannedRpe;
        const secs = restOf(row);
        const open = editing === row.key;
        return (
          <Animated.View key={row.key} entering={rise(Math.min(i, 8))}>
            {row.heads ? <Text style={styles.exName}>{row.exerciseName}</Text> : null}
            <GlassCard style={[styles.setCard, isDone && styles.setCardDone]}>
              <View style={styles.setRow}>
                {/*
                  The tick.

                  It was a 26pt box outlined in `colors.border` — #2b2b31 on a
                  #0e0e11 card, which is a 1.3:1 edge. It was there and it could
                  not be seen, which is the same as not being there: the first
                  report on this screen was that there was no way to complete a
                  set. A control has to look like one before it can be one.
                */}
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isDone }}
                  accessibilityLabel={`${row.exerciseName} ${i18n.nRdSet.replace('{n}', String(row.ordinal))}`}
                  hitSlop={12}
                  onPress={() => toggle(row)}
                  style={({ pressed }) => [styles.check, isDone && styles.checkOn, pressed && styles.pressed]}>
                  <Icon
                    icon={Check}
                    size={16}
                    color={isDone ? colors.primaryForeground : 'rgba(255,255,255,0.22)'}
                    strokeWidth={3}
                  />
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
                </View>

                {/*
                  Two chips, collapsed to their values and opened by tapping.

                  Five effort chips and a rest stepper on every row is nine
                  controls per set — on a six-set workout that is fifty-four,
                  all the same shape and none of them the one you want. The
                  value you already have is the answer nine times out of ten.
                */}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${i18n.nWbRest} ${restLabel(secs)}`}
                  hitSlop={12}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setEditing(open ? null : row.key);
                  }}
                  style={({ pressed }) => [styles.chip, open && styles.chipOpen, pressed && styles.pressed]}>
                  <Icon icon={Timer} size={11} color={colors.mutedForeground} />
                  <Text style={styles.chipText}>{restLabel(secs)}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${i18n.nWbEffort} ${effort}`}
                  hitSlop={12}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setEditing(open ? null : row.key);
                  }}
                  style={({ pressed }) => [
                    styles.chip,
                    open && styles.chipOpen,
                    EFFORT_TINT[effort] ? { borderColor: `${EFFORT_TINT[effort]}66` } : null,
                    pressed && styles.pressed,
                  ]}>
                  <Text style={[styles.chipText, { color: tintFor(effort) }]}>RPE {effort}</Text>
                </Pressable>
              </View>

              {open ? (
                <Animated.View entering={FadeIn.duration(140)} exiting={FadeOut.duration(100)} style={styles.editors}>
                  <View style={styles.editorRow}>
                    <Text style={styles.editorLabel}>{i18n.nWbRest}</Text>
                    <View style={styles.stepper}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`${i18n.nWbRest} −${REST_STEP}`}
                        hitSlop={{ top: 8, bottom: 8 }}
                        onPress={() => bumpRest(row, -REST_STEP)}
                        style={({ pressed }) => [styles.stepBtn, pressed && styles.pressed]}>
                        <Icon icon={Minus} size={14} color={colors.foreground} strokeWidth={2.5} />
                      </Pressable>
                      <Text style={styles.stepValue}>{restLabel(secs)}</Text>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`${i18n.nWbRest} +${REST_STEP}`}
                        hitSlop={{ top: 8, bottom: 8 }}
                        onPress={() => bumpRest(row, REST_STEP)}
                        style={({ pressed }) => [styles.stepBtn, pressed && styles.pressed]}>
                        <Icon icon={Plus} size={14} color={colors.foreground} strokeWidth={2.5} />
                      </Pressable>
                    </View>
                  </View>

                  <View style={styles.editorRow}>
                    <Text style={styles.editorLabel}>{i18n.nWbEffort}</Text>
                    <View style={styles.rpeRow}>
                      {RPE_CHOICES.map((v) => (
                        <Pressable
                          key={v}
                          accessibilityRole="button"
                          accessibilityState={{ selected: v === effort }}
                          hitSlop={{ top: 8, bottom: 8 }}
                          onPress={() => {
                            Haptics.selectionAsync();
                            setRpe((prev) => ({ ...prev, [row.key]: v }));
                            // Choosing is the end of the errand — it closes, the
                            // same way it opened itself, so the list goes back
                            // to being a list.
                            setEditing(null);
                          }}
                          style={({ pressed }) => [
                            styles.rpeOption,
                            // Unselected still carries its colour, faintly — the
                            // ramp has to be readable *before* you choose, or it
                            // is a label on a decision already made.
                            EFFORT_TINT[v] ? { borderColor: `${EFFORT_TINT[v]}59` } : null,
                            v === effort && styles.rpeOptionOn,
                            v === effort && EFFORT_TINT[v] ? { backgroundColor: EFFORT_TINT[v], borderColor: EFFORT_TINT[v] } : null,
                            pressed && styles.pressed,
                          ]}>
                          <Text
                            style={[
                              styles.rpeOptionText,
                              { color: tintFor(v) },
                              v === effort && styles.rpeOptionTextOn,
                            ]}>
                            {v}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                </Animated.View>
              ) : null}
            </GlassCard>
          </Animated.View>
        );
      })}

      {/*
        Off for good once it has saved.

        `isPending` alone is not enough and the gap it leaves is the expensive
        kind: the mutation settles, the button comes back, and this panel does
        not navigate anywhere — it stays exactly where it was, with every set
        still ticked and a live button under your thumb. A second press writes
        a second session for the same workout, and nothing about that looks
        wrong until the volume for the week is double.

        Adding `isSuccess` closes it, and the button then says what happened
        rather than sitting there greyed: a disabled control with the same
        label as before reads as a failure, not as a finished job.
      */}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !canFinish }}
        disabled={!canFinish}
        onPress={finish}
        style={({ pressed }) => [
          styles.finish,
          !canFinish && styles.finishOff,
          log.isSuccess && styles.finishDone,
          pressed && styles.pressed,
        ]}>
        <Icon
          icon={Check}
          size={17}
          color={log.isSuccess ? colors.readinessGreen : colors.primaryForeground}
          strokeWidth={2.5}
        />
        <Text style={[styles.finishText, log.isSuccess && styles.finishTextDone]}>
          {log.isSuccess ? i18n.nRoutineDone : i18n.nRdFinish}
        </Text>
      </Pressable>

      {/*
        The rest clock is a screen of its own — see `rest-timer`.

        It was a bar pinned above this list, and a bar is the polite version of
        the wrong idea: rest is not a status line, it is the ninety seconds
        where the app has exactly one job. It also could not be pinned, only
        absolutely positioned inside a scroll view, so it left with the content
        whenever the list moved.
      */}
      <RestTimer
        left={resting?.left ?? null}
        total={resting?.total ?? 0}
        i18n={i18n}
        onSkip={() => {
          Haptics.selectionAsync();
          setResting(null);
        }}
        onAdjust={(delta) =>
          setResting((s) => {
            if (s === null) return null;
            const left = Math.max(1, Math.min(REST_MAX, s.left + delta));
            // Adding time grows what it is counting from as well, so the ring
            // stays a fraction of something rather than trying to be more than
            // whole. Taking time off leaves the total alone: the rest really
            // was cut short, and the ring showing that is the honest reading.
            return { left, total: Math.max(s.total, left) };
          })
        }
      />

    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  emptyText: { ...type.body, color: colors.foreground },
  emptyHint: { ...type.footnote, color: colors.mutedForeground },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    marginTop: spacing.xs,
    backgroundColor: glass.bg,
    borderWidth: glass.borderWidth,
    borderColor: glass.border,
  },
  emptyBtnText: { ...type.footnote, color: colors.foreground, fontWeight: '600' },

  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headText: { flex: 1, minWidth: 0, gap: 2 },
  tplName: { ...type.title2, color: colors.foreground },
  progress: { ...type.footnote, color: colors.mutedForeground, fontVariant: ['tabular-nums'] },
  editBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  barTrack: { height: 4, borderRadius: 2, backgroundColor: glass.bg, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 2, backgroundColor: colors.primary },

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
  setCardDone: { opacity: 0.6 },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  check: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    /* Visible at rest, not only once ticked: a 2pt rim at 30% white against the
       card, plus a faint fill so it reads as an empty box rather than as a gap
       between two things. The ghosted tick inside says what it is for. */
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  checkOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  setText: { flex: 1, minWidth: 0 },
  setMain: { ...type.footnote, color: colors.foreground, fontVariant: ['tabular-nums'] },
  setMainDone: { textDecorationLine: 'line-through', color: colors.mutedForeground },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: spacing.sm,
    height: 26,
    borderRadius: radius.full,
    backgroundColor: glass.bg,
    borderWidth: glass.borderWidth,
    borderColor: glass.border,
  },
  chipOpen: { borderColor: colors.primary },
  chipText: { ...type.caption, color: colors.foreground, fontWeight: '600', fontVariant: ['tabular-nums'] },

  editors: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  editorRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  editorLabel: { ...type.footnote, color: colors.mutedForeground, flexShrink: 1 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  stepBtn: {
    width: 44,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    backgroundColor: glass.bg,
    borderWidth: glass.borderWidth,
    borderColor: glass.border,
  },
  stepValue: {
    ...type.footnote,
    color: colors.foreground,
    fontVariant: ['tabular-nums'],
    minWidth: 54,
    textAlign: 'center',
  },
  rpeRow: { flexDirection: 'row', gap: 4 },
  rpeOption: {
    minWidth: 36,
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
  /* Saved is not the same as unavailable. It keeps its full opacity and turns
     into a statement — green tick, green text, no fill — so the row reads as a
     finished job rather than as a button that stopped working. */
  finishDone: {
    opacity: 1,
    backgroundColor: 'rgba(43,245,168,0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(43,245,168,0.35)',
  },
  finishTextDone: { color: colors.readinessGreen },
  finishText: { ...type.body, color: colors.primaryForeground, fontWeight: '600' },

  pressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
});
