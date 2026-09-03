import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMutation } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Check, Minus, Moon, Pencil, Plus, Timer, X } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import Animated from 'react-native-reanimated';
import * as Crypto from 'expo-crypto';

import { ExerciseProgress } from '@/components/ascnd/exercise-progress';
import { ProgressBar } from '@/components/ascnd/progress-bar';
import { PressScale } from '@/components/ascnd/press-scale';
import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { RestTimer } from '@/components/ascnd/rest-timer';
import { Retract } from '@/components/ascnd/retract';
import { SEGMENT_SWAP } from '@/components/ascnd/segmented';
import type { TplExercise } from '@/components/ascnd/template-list';
import { duration, press } from '@/constants/motion';
import { glass, radius, spacing, type } from '@/constants/ascnd';
import { alpha, makeStyles, type Palette, type PaletteKey } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import { useExerciseInsights } from '@/hooks/use-exercise-insights';
import type { useI18n } from '@/hooks/use-app-settings';
import { useAuth } from '@/hooks/use-auth';
import { useLogWorkoutSession } from '@/hooks/use-fitness-data';
import { useUnits } from '@/hooks/use-units';
import { exerciseKey } from '@/lib/personal-record';
import { mergeProgress, type SessionSet } from '@/lib/day-progress';
import { dayProgressKey, localDateStr, staleDayProgress } from '@/lib/local-date';
import { offlineNow } from '@/lib/offline';
import { OFFLINE_WRITE_KEY, type OfflineWrite } from '@/lib/offline-write';
import { DEFAULT_REST, DEFAULT_RPE, restLabel } from '@/lib/prescription';
import { toast } from '@/lib/toast';
import { parseRepEntry } from '@/lib/rep-entry';
import { displayWeight, weightLabel, weightToKg } from '@/lib/units';
import { decText, intText } from '@/lib/number-input';

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

/**
 * How a day arrives when you tap another one.
 *
 * It was `rise(i)` — the app's standard card entrance, a spring from below on
 * a 60ms per-row delay. That is right for a page you have just navigated to,
 * where the cascade is the screen introducing itself. It is wrong here, and
 * wrong in a way you feel rather than see: the strip at the top is a *segmented
 * control*, and this panel is keyed by it, so every tap replayed up to half a
 * second of staggered springing for what should be an immediate swap. Tapping
 * T2, T3, T4 in sequence left three cascades overlapping each other.
 *
 * A short uniform fade instead. The panel is being *replaced*, not arriving,
 * and it only has to be long enough to stop being a hard cut without becoming
 * a movement anybody has to wait through — `duration.appear`, not the half
 * second this replaced.
 *
 * That finding now lives in `segmented.tsx` as `SEGMENT_SWAP`, because it was
 * never about this screen — it is what a segmented panel swap should be
 * anywhere. Five other segmented controls in the app never got it. Keeping a
 * second `FadeIn.duration(140)` here would be the same shape of bug this
 * repository keeps finding: one rule, N copies, and the copies drift.
 */
const SWAP = SEGMENT_SWAP;

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
/*
  Khoá của bảng màu, không phải mã màu: một mã màu ở phạm vi module bị ĐÓNG BĂNG
  lúc import và sẽ giữ màu của theme tối kể cả khi người dùng bật theme sáng.
  Bảng vẫn là hằng thật; chỗ vẽ — nơi luôn có `c` — mới đổi khoá thành màu.
*/
const EFFORT_TINT: Record<number, PaletteKey> = {
  8: 'readinessYellow',
  9: 'metricOrange',
  10: 'readinessRed',
};
/* Nhận bảng màu qua THAM SỐ, không gọi hook: nó được gọi bên trong một `.map()`
   của hàng bài tập, và một hook ở đó là một lỗi lúc chạy mà kiểu không thấy. */
const tintFor = (c: Palette, rpe: number) => c[EFFORT_TINT[rpe] ?? 'foreground'];

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
  /** set when the row is a movement added today rather than one the plan asked
      for — carries the id so the card can rename, extend and remove it */
  adHoc?: string;
}

/** A movement added on the day: a name, and how many sets of it happened. */
interface AdHoc {
  id: string;
  name: string;
  sets: number;
}

/**
 * The rows for movements that were not in the plan.
 *
 * ── why these are rows and not a second list ──
 *
 * They arrive on exactly the same `SetRow` shape as planned work, so the
 * ticking, the resume point, the effort chips, the progress bar and the two
 * submit paths all pick them up without knowing they exist. The alternative —
 * a parallel "extras" list carried beside `rows` — is the same feature written
 * twice, and the second copy is the one that would forget to be counted.
 *
 * Their planned load and rep count are ZERO, which is not a placeholder: it is
 * what "the plan did not ask for this" means, and it is what makes the boxes
 * open blank and light up the moment anything is typed. The rest and effort
 * defaults are the app's, because a set you decided to do still has a sensible
 * rest and still deserves an effort chip.
 */
function adHocRows(list: AdHoc[]): SetRow[] {
  const rows: SetRow[] = [];
  for (const e of list) {
    /* Same clamp and same reason as `expand`: this number reaches storage, and
       storage is a place a value can come back wrong from. */
    const count = Math.max(1, Math.min(20, Math.round(e.sets)));
    for (let n = 0; n < count; n++) {
      rows.push({
        key: `x${e.id}-${n}`,
        exerciseName: e.name,
        ordinal: n + 1,
        of: count,
        weight: 0,
        reps: 0,
        plannedRest: DEFAULT_REST,
        plannedRpe: DEFAULT_RPE,
        /* Always true, so two unnamed additions do not merge into one card the
           way two planned rows of the same movement deliberately do. */
        heads: true,
        adHoc: e.id,
      });
    }
  }
  return rows;
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
/**
 * Whether the effort/rest editor has demonstrated itself yet, this app run.
 *
 * See the effect that reads it: a per-component ref reset on every day switch,
 * which turned a one-off hint into a panel that opened under your thumb every
 * time you tapped a different day.
 */
let introduced = false;

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
  sessions,
  i18n,
  onEdit,
}: {
  /** the calendar day being shown, `YYYY-MM-DD` — what a finished session is filed under */
  dateStr: string;
  template: { id: string; name: string; exercises?: unknown } | null;
  isRest: boolean;
  /**
   * What is already recorded against this day.
   *
   * The week has always known this — it is what turns a day green — and this
   * panel did not, which left the two halves of one screen disagreeing: the
   * pill above said "Hoàn thành" while the button below was still live and
   * would happily write a second session for the same workout.
   *
   * A session can also arrive from the free-form log sheet, or from yesterday's
   * app run, so "did I just save it" is not the same question as "is this day
   * done" and cannot be answered from local state.
   */
  sessions: {
    id: string;
    date_time: string;
    template_name: string | null;
    session_rpe: number | null;
    volume_load: number | null;
    /** free JSONB on the row — read defensively, it can be anything */
    sets?: unknown;
  }[];
  i18n: ReturnType<typeof useI18n>;
  onEdit: () => void;
}) {
  const c = usePalette();
  const styles = stylesFor(c);
  const { weight: wUnit } = useUnits();
  const log = useLogWorkoutSession();
  const { user } = useAuth();
  /*
    ── the durable twin, which this screen did not have ──

    `useLogWorkoutSession`'s own header says two screens finish a workout: the
    free-form log sheet and this one. Only the sheet was given an offline path.

    What that left here is the failure `log-workout.tsx` describes and then
    fixes for itself: the write needs the network twice — once to read history
    for records, once to insert — so offline React Query pauses it, `isPending`
    stays true for ever, `canFinish` goes false, and the button greys out with
    no toast and no explanation. Worse than stuck: the paused mutation *is*
    persisted, but it carries no `mutationKey`, so on the next launch it comes
    back with no `mutationFn` to hand its variables to and is dropped. The sets
    are gone, and the local resume point under `dayProgressKey` was the only
    other copy.

    This is the screen you tick sets on **while training** — a basement, a
    stairwell, a gym with one bar of signal — which makes it the more likely of
    the two to be used without a connection, not the less.

    No `mutationFn` here on purpose: what comes back from storage is the default
    registered in `offline-write`, not this closure.
  */
  const queue = useMutation<void, Error, OfflineWrite>({ mutationKey: [...OFFLINE_WRITE_KEY] });
  const wl = weightLabel(wUnit);

  const exercises: TplExercise[] = Array.isArray(template?.exercises)
    ? (template.exercises as TplExercise[])
    : [];
  /**
   * What you did that the plan did not ask for.
   *
   * The complaint this answers was about STEPS: the plan is on this screen, so
   * an extra movement had to be recorded on a different one, which meant
   * leaving a half-ticked workout to go and type somewhere else. There is no
   * version of that which is not worse than a button at the bottom of the list
   * you are already looking at.
   *
   * Today's session only. This does not touch the template — next week's
   * Monday is still what the plan says, because "I also did some curls" is a
   * fact about today and editing the programme is a decision, not a side
   * effect of logging.
   */
  const [extra, setExtra] = useState<AdHoc[]>([]);

  const planned = useMemo(() => expand(exercises), [template?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  /* One list from here down. Everything that reads `rows` — the tick state, the
     resume point, the progress bar, both submit paths — treats an added
     movement exactly like a planned one, which is the point. */
  const rows = useMemo(() => [...planned, ...adHocRows(extra)], [planned, extra]);

  /*
    The sets of one movement, in one card.

    Every set used to be its own `GlassCard`: three sets of a bench press drew
    three separate cards, each repeating "55 kg × 10", the rest chip and the
    effort chip — and a nine-set day drew nine cards of it. Measured on the
    routine screenshot: four cards visible, three of them identical.

    Apple calls the alternative an inset grouped list, and describes exactly the
    thing that was missing: a continuous background "that extends from the
    section header, around both sides of list items in the section, and down to
    the section footer", which "visually groups the items to a greater degree"
    than separate boxes. The exercise is the group and its sets are the rows.
  */
  const blocks = useMemo(() => {
    const out: { name: string; rows: SetRow[] }[] = [];
    for (const r of rows) {
      const tail = out[out.length - 1];
      if (tail && tail.name === r.exerciseName && !r.heads) tail.rows.push(r);
      else out.push({ name: r.exerciseName, rows: [r] });
    }
    return out;
  }, [rows]);

  /*
    How each movement in this plan is going.

    One extra query on this screen — the engine reads ninety days of sessions
    and the routine already reads fourteen — and it buys the difference between
    a plan row that says what to do and a plan row that says what happened last
    time you did it. `useExerciseInsights` adds nothing else: the weigh-ins and
    the exercise library are queries other screens already hold.

    Keyed by `exerciseKey`, because a template row carries a typed name and
    usually no id — the same rule `personal-record.ts` matches on.
  */
  const { insights, performances } = useExerciseInsights();
  const byKey = useMemo(() => {
    const m = new Map<string, (typeof insights)[number]>();
    for (const i of insights) m.set(i.exerciseKey, i);
    return m;
  }, [insights]);
  const insightFor = (name: string) => byKey.get(exerciseKey(name)) ?? null;

  /* The most recent session of a movement — what the strip leads with, because
     the number you are about to try to beat is the useful fact on this row. */
  const lastByKey = useMemo(() => {
    const m = new Map<string, (typeof performances)[number]>();
    for (const p of performances) m.set(p.exerciseKey, p);
    return m;
  }, [performances]);
  const lastFor = (name: string) => lastByKey.get(exerciseKey(name)) ?? null;

  /** what was done, and at what effort and rest */
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [rpe, setRpe] = useState<Record<string, number>>({});
  const [rest, setRest] = useState<Record<string, number>>({});
  /**
   * What actually went on the bar, and what actually came back up.
   *
   * ── why this had to exist ──
   *
   * Until now this panel ticked boxes and then submitted the TEMPLATE's
   * numbers as though they had been performed. Load six sets at 55 kg, do the
   * last two at 60 because it felt light, and the record said 55 six times.
   * Every number downstream inherited that: volume load, the trend chart, the
   * "last time" line on the card above, personal records. The screen was
   * quietly authoring a training history nobody had lifted.
   *
   * `log-workout.tsx` already knew: "the third set of a five-set squat is the
   * one that came in two reps light, and a form that cannot say so is a form
   * people stop trusting". This panel was that form. The fix is not another
   * screen to switch to — it is these two boxes, on the row, where the tick is.
   *
   * ── text, not numbers ──
   *
   * The same reason the sheet gives for its own boxes: a half-typed "6" on the
   * way to 60 is not the number six, and a cleared box is not zero kilograms.
   *
   * ── and absent, not seeded ──
   *
   * A key here means "this set differed". Nothing is written when the day
   * loads, so the common case stores nothing, the row stays quiet, and a plan
   * edited between sessions still reaches an untouched row as the new plan
   * rather than as a stale copy of the old one.
   */
  const [weightText, setWeightText] = useState<Record<string, string>>({});
  const [repsText, setRepsText] = useState<Record<string, string>>({});
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
  /**
   * Nghỉ đang chạy — và SET KẾ TIẾP mà nó đang chờ.
   *
   * `next` không phải trang trí. Một đồng hồ đếm ngược không nói nó đếm để làm
   * gì thì nó chỉ là một con số: bạn nhìn 1:27 rồi vẫn phải nhớ trong đầu mình
   * vừa xong set mấy và sắp làm gì. Mang theo tên bài và set thứ mấy biến chỗ
   * chờ thành chỗ chuẩn bị.
   */
  const [resting, setResting] = useState<
    { left: number; total: number; next: { name: string; ordinal: number; of: number } | null } | null
  >(null);

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
              weightText?: Record<string, string>;
              repsText?: Record<string, string>;
              extra?: AdHoc[];
            };
            setDone(saved.done ?? {});
            setRpe(saved.rpe ?? {});
            setRest(saved.rest ?? {});
            /* Absent in a blob written before these existed, which is exactly
               what "as planned" already means — no migration needed. */
            setWeightText(saved.weightText ?? {});
            setRepsText(saved.repsText ?? {});
            /* Filtered rather than trusted: this came off the disk, where a
               half-written blob or an older shape can leave an entry with no
               id, and an id is what every row key here is built from. */
            setExtra(
              Array.isArray(saved.extra)
                ? saved.extra.filter((e) => e && typeof e.id === 'string' && e.id.length > 0)
                : [],
            );
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

    Module scope, not a ref — and that is the whole fix.

    A ref lives as long as the component, and this component is remounted by
    its key every time you tap a different day. So the "demonstration" fired on
    *every* day switch: flick across the week and a panel springs open under
    your thumb seven times, each one needing a tap to close. What was meant to
    teach an affordance once became the most annoying thing on the screen.

    The affordance needs showing once per app run. That is a lifetime longer
    than any component here has, so it is held outside all of them.
  */
  useEffect(() => {
    if (!loaded || introduced || rows.length === 0) return;
    introduced = true;
    const next = rows.find((r) => !shown[r.key]);
    // Nothing left undone means the day is already recorded — there is no
    // "next set" to demonstrate the editors on, and opening one on a set that
    // has happened invites editing a record rather than making one.
    if (!next) return;
    setEditing(next.key);
    // `done` is read once, at the moment the resume point lands; depending on
    // it would re-run this every time a set is ticked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, rows]);

  useEffect(() => {
    if (!storeKey || !loaded) return;
    AsyncStorage.setItem(
      storeKey,
      JSON.stringify({ done, rpe, rest, weightText, repsText, extra }),
    ).catch(
      () => {
        // losing the resume point is survivable; interrupting the workout is not
      },
    );
  }, [storeKey, loaded, done, rpe, rest, weightText, repsText, extra]);

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

  const addExercise = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExtra((prev) => [...prev, { id: Crypto.randomUUID(), name: '', sets: 1 }]);
  };
  const renameExtra = (id: string, name: string) =>
    setExtra((prev) => prev.map((e) => (e.id === id ? { ...e, name } : e)));
  const addSet = (id: string) => {
    Haptics.selectionAsync();
    /* Same ceiling as every other set count in this file. */
    setExtra((prev) => prev.map((e) => (e.id === id ? { ...e, sets: Math.min(20, e.sets + 1) } : e)));
  };
  const removeExtra = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExtra((prev) => prev.filter((e) => e.id !== id));
  };

  /*
    The plan, written the way the boxes below write it: in the unit on screen,
    to one decimal, and blank when there is no load to carry.

    Blank rather than "0" for the reason `log-workout.tsx` gives — a zero in a
    numeric field reads as a value somebody entered, and would be saved as a
    real zero-kilo set. Bodyweight work has nothing to prefill.
  */
  const plannedLoad = useCallback(
    (row: SetRow) =>
      row.weight > 0 ? String(Math.round(displayWeight(row.weight, wUnit) * 10) / 10) : '',
    [wUnit],
  );
  const plannedReps = (row: SetRow) => (row.reps > 0 ? String(row.reps) : '');
  const loadOf = (row: SetRow) => weightText[row.key] ?? plannedLoad(row);
  const repsOf = (row: SetRow) => repsText[row.key] ?? plannedReps(row);

  /**
   * One set, as performed — the single place the panel turns what is on screen
   * into what gets written down.
   *
   * Both submit paths and the volume total read it, so an offline session and
   * an online one cannot disagree about what happened, and the number under the
   * bar cannot disagree with either.
   *
   * ── the two fallbacks, and why they are not the same shape ──
   *
   * A load that will not parse falls back to **nothing**, because a blank
   * weight box is what bodyweight work looks like and `0 × reps` is the honest
   * volume for it.
   *
   * A rep entry that will not parse falls back to **the plan**, because ticking
   * a row is itself a statement that the planned set happened. Writing zero
   * reps there would delete a set the person just said they did.
   */
  const performed = useCallback(
    (row: SetRow) => {
      const typed = Number(loadOf(row));
      const entry = parseRepEntry(repsOf(row));
      const said = entry.reps > 0 || (entry.durationSec ?? 0) > 0;
      return {
        weight: Number.isFinite(typed) && typed > 0 ? weightToKg(typed, wUnit) : 0,
        reps: said ? entry.reps : row.reps,
        durationSec: entry.durationSec ?? undefined,
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [weightText, repsText, wUnit, plannedLoad],
  );

  /*
    What is ticked: what you ticked, filled in by what the day's sessions prove.

    Only the checkbox ever wrote a tick, so a workout recorded from the
    free-form sheet left this panel reading "0/12 set" under an empty bar —
    beside a session card saying it was done at 18:40, a green day on the strip
    above, and a finish button reading "đã ghi". Three claims that it happened
    and three that it had not started, on one screen.

    `mergeProgress` reads the session's sets back onto the planned rows. See
    `lib/day-progress.ts` for why it matches on exercise name and count, why it
    refuses to match on weight, and why stored ticks win over evidence.

    Derived at render and never stored. The sessions are the record; a copy in
    `AsyncStorage` could outlive the session it came from, and a tick that
    outlives its evidence is indistinguishable from one you made.
  */
  const shown = useMemo(() => {
    const sets = sessions.flatMap((sn) => (Array.isArray(sn.sets) ? (sn.sets as SessionSet[]) : []));
    return mergeProgress(done, rows, sets);
  }, [done, rows, sessions]);

  const toggle = useCallback(
    (row: SetRow) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const secs = rest[row.key] ?? row.plannedRest;
      // `shown`, not `prev` — a row ticked by a logged session is absent from
      // `prev`, so `!prev[key]` would write `true` over a box already drawn
      // ticked and the tap would do visibly nothing.
      const next = !shown[row.key];
      setDone((prev) => ({ ...prev, [row.key]: next }));
      /* Hàng NGAY SAU trong danh sách đã dựng, chứ không phải `ordinal + 1`:
         set cuối của một bài thì set kế tiếp thuộc bài khác, và chỉ danh sách
         mới biết bài nào. Hết danh sách thì không có gì kế tiếp — đồng hồ vẫn
         chạy, nó chỉ không hứa hẹn gì. */
      const after = rows[rows.findIndex((r) => r.key === row.key) + 1];
      // Rest belongs to finishing a set, not to changing your mind about one.
      setResting(
        next && secs > 0
          ? {
              left: secs,
              total: secs,
              next: after
                ? { name: after.exerciseName, ordinal: after.ordinal, of: after.of }
                : null,
            }
          : null,
      );
    },
    [rest, rows, shown],
  );

  const bumpRest = (row: SetRow, by: number) => {
    Haptics.selectionAsync();
    setRest((prev) => ({
      ...prev,
      [row.key]: Math.max(0, Math.min(REST_MAX, (prev[row.key] ?? row.plannedRest) + by)),
    }));
  };

  const doneRows = rows.filter((r) => shown[r.key]);
  /*
    One save per visit to this day. `isSuccess` never goes back to false on its
    own, and this panel is remounted whenever the selected day changes, so the
    lifetime of the guard is exactly the lifetime of the workout being logged.
  */
  /*
    Already recorded counts, whoever recorded it.

    Two-a-day training exists and this rules it out from here; the free-form
    log sheet still takes a second session without argument. That is the right
    way round — the common mistake is logging the same workout twice by coming
    back to a day that already has it, and the rare case has somewhere to go.
  */
  /*
    `queue.isPending` counts as recorded, and that is not a shortcut.

    A paused write stays pending until there is signal, which can be hours. From
    where the person is standing the workout *is* logged — it is in durable
    storage and the toast said so — and a button that stayed live for those
    hours is a button that writes the session a second time when it lands.
  */
  const logged = sessions.length > 0 || log.isSuccess || queue.isPending || queue.isSuccess;
  /*
    A session is something that happened.

    `finish` writes `date_time` at local noon of the day being looked at, which
    is right for yesterday and is a fabrication for next Thursday. It was
    unreachable while the week strip could only show the week you are in — the
    furthest ahead you could get was Sunday — and it stopped being unreachable
    the moment Plan grew arrows: four weeks forward is a session dated a month
    out, sitting in `workout_sessions` as a real row.

    Nothing would have errored. Readiness, ACWR and the training-load windows
    all read that table by date, so the damage is a load figure that includes
    work nobody has done yet, on a screen that gives no hint where it came
    from.

    Ticking stays live on a future day — reading Thursday's plan and marking off
    what you intend to do is the panel working — it is only the write that
    waits until the day arrives.
  */
  const future = dateStr > localDateStr();
  const canFinish = doneRows.length > 0 && !log.isPending && !logged && !future;
  /* What was lifted, not what was written down for you to lift. */
  const volume = doneRows.reduce((s, r) => {
    const p = performed(r);
    return s + p.weight * p.reps;
  }, 0);

  const finish = () => {
    if (!canFinish) return;
    const sets = doneRows.map((r) => ({
      exerciseId: '',
      exerciseName: r.exerciseName,
      ...performed(r),
      rpe: rpe[r.key] ?? r.plannedRpe,
    }));
    // A session is remembered by its hardest part, and every set that happened
    // has a number of its own now, so this is read rather than asked for a
    // second time. Read once here because both paths below need it.
    const sessionRpe = Math.max(...sets.map((s) => s.rpe));

    if (offlineNow() && user) {
      /*
        The same session, down the durable pipe.

        `dateTime` follows the rule `useLogWorkoutSession` states for the online
        path: the day being *looked at*, stamped at local noon when that is not
        today. Midnight is the boundary this app has been bitten by twice; noon
        is the furthest point from it in both directions, so no offset or DST
        hour can push the session into a neighbouring day on the device that
        eventually replays it. For today it is the actual moment, because that
        is known and is what the online insert would have recorded.

        No record is claimed, exactly as on the sheet's offline path: a personal
        record is a comparison against history, and there is no history to read
        without a connection. Inventing one would be the app celebrating
        something it cannot know.
      */
      const today = localDateStr();
      queue.mutate({
        kind: 'workout',
        userId: user.id,
        rowId: Crypto.randomUUID(),
        dateTime:
          dateStr === today ? new Date().toISOString() : new Date(`${dateStr}T12:00:00`).toISOString(),
        /* The same shape the online insert writes, so a session that arrives
           through the queue is indistinguishable from one that did not — the
           week's day panel reads `sets` back to work out which planned rows a
           session accounts for (`lib/day-progress.ts`). */
        /*
          No warm-up flag here, and that is a decision rather than an omission.

          A planned row IS work: the template says three sets of five at a
          hundred, and those three are the session. A warm-up is the ramp you do
          before the plan starts, which is why it belongs on the free-form sheet
          where you write down what you actually did — `log-workout.tsx` has the
          toggle. Absent means working set, so every row from here is counted,
          which is correct.

          It would also cost another control on every row of this panel, and
          the row is fuller than it was: the tick, the load, the reps, the rest
          chip and the effort chip is already five. The note beside the effort
          chips below is the standing argument — nine controls per set on a
          six-set workout is fifty-four, "all the same shape and none of them
          the one you want" — and the two boxes earned their place by being the
          record itself rather than a setting on it.
        */
        sets: sets.map((s, i) => ({
          exerciseId: s.exerciseId,
          exerciseName: s.exerciseName.trim() || 'Exercise',
          setIndex: i + 1,
          weight: Math.round(s.weight * 100) / 100,
          reps: s.reps,
          rpe: s.rpe >= 1 && s.rpe <= 10 ? s.rpe : null,
          /* Carried, not dropped. A plank entered as `45s` has no reps to
             record, and a queued session that lost the hold would replay as an
             empty set — `exercise-kind.ts` reads `durationSec` to know the
             movement is timed at all. */
          ...(s.durationSec ? { durationSec: s.durationSec } : {}),
        })),
        volumeLoad: Math.round(sets.reduce((sum, s) => sum + s.weight * s.reps, 0)),
        templateId: template?.id ?? null,
        templateName: template?.name?.trim() || 'Workout',
        sessionRpe,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      /* Cleared after the intention is queued, never before: the resume point
         is the only other copy of these sets until the write is in the cache. */
      if (storeKey) AsyncStorage.removeItem(storeKey).catch(() => {});
      toast.success(i18n.logMealQueued);
      return;
    }

    log.mutate(
      {
        templateName: template?.name ?? '',
        sessionRpe,
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
        onError: (e: Error) => toast.fail(e),
      },
    );
  };

  if (!template) {
    return (
      <GlassCard style={styles.empty}>
        <Icon icon={Moon} size={22} color={c.mutedForeground} />
        <Text style={styles.emptyText}>{isRest ? i18n.nRoutineRestDay : i18n.nRdEmptyPlan}</Text>
        <Text style={styles.emptyHint}>{i18n.nRoutineRestHint}</Text>
        <PressScale
          accessibilityRole="button"
          onPress={onEdit}
          style={styles.emptyBtn}>
          <Icon icon={Pencil} size={13} color={c.foreground} />
          <Text style={styles.emptyBtnText}>{i18n.nChooseWorkout}</Text>
        </PressScale>
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
        <PressScale
          accessibilityRole="button"
          accessibilityLabel={i18n.nChooseWorkout}
          hitSlop={12}
          onPress={onEdit}
          style={styles.editBtn}>
          <Icon icon={Pencil} size={14} color={c.mutedForeground} />
        </PressScale>
      </View>

      {sessions.map((sn) => {
        const at = new Date(sn.date_time);
        return (
          <GlassCard key={sn.id} style={styles.loggedCard}>
            <Icon icon={Check} size={16} color={c.readinessGreen} />
            <View style={styles.loggedText}>
              <Text style={styles.loggedName} numberOfLines={1}>
                {sn.template_name || i18n.nRdAlready}
              </Text>
              <Text style={styles.loggedMeta}>
                {i18n.nRdLoggedAt.replace(
                  '{t}',
                  `${at.getHours()}:${String(at.getMinutes()).padStart(2, '0')}`,
                )}
                {sn.volume_load
                  ? `  ·  ${Math.round(displayWeight(Number(sn.volume_load), wUnit)).toLocaleString()} ${wl}`
                  : ''}
                {sn.session_rpe ? `  ·  RPE ${sn.session_rpe}` : ''}
              </Text>
            </View>
          </GlassCard>
        );
      })}

      {/* A bar rather than a percentage: what you want mid-workout is "how much
          is left", which is a length, not a number to read. */}
      <ProgressBar
        pct={rows.length ? (doneRows.length / rows.length) * 100 : 0}
        height={4}
        radius={2}
        trackColor={glass.bg}
        color={c.primary}
        delay={0}
        duration={duration.move}
      />

      {blocks.map((block) => {
        /* Keyed by the first row, never by the name.

           An added movement's name changes on every keystroke, and a key that
           contains it makes React throw the card away and build a new one for
           each letter — the field loses focus after the first character and
           the keyboard shuts. The row key is stable for the life of the
           movement, which is exactly what a key is supposed to be. */
        const added = block.rows[0].adHoc;
        return (
        <Animated.View key={block.rows[0].key} entering={SWAP}>
          <GlassCard style={styles.exCard}>
            {/*
              The header states THE PLAN: what you came here to do.

              It used to be phrased as "what every set shares, so the rows do
              not repeat it", and that stopped being true when the rows became
              editable. They are not repeating it — they start at it. The
              distinction is the whole point of the screen now: this line is
              what was asked for, the lines below are what happened, and on a
              good day they agree and the rows stay grey.
            */}
            <View style={styles.exHead}>
              <View style={styles.exTitleRow}>
                {added ? (
                  /* An added movement has no plan to state, so the header holds
                     the one thing only you can supply — its name — and the way
                     back out if you tapped the button by accident. */
                  <TextInput
                    accessibilityLabel={i18n.nRdExtraName}
                    style={[styles.exName, styles.exNameInput]}
                    placeholder={i18n.nRdExtraName}
                    placeholderTextColor="rgba(255,255,255,0.3)"
                    value={block.name}
                    autoCapitalize="words"
                    onChangeText={(v) => renameExtra(added, v)}
                  />
                ) : (
                  <Text style={styles.exName} numberOfLines={1}>{block.name}</Text>
                )}
                {added ? (
                  <PressScale
                    accessibilityRole="button"
                    accessibilityLabel={i18n.a11yRemove}
                    hitSlop={12}
                    /* Under a finger's width, so the shallow press is invisible
                       on it — `motion.ts` names the six controls that found
                       this out separately before there was a token for it. */
                    to={press.deep}
                    onPress={() => removeExtra(added)}
                    style={styles.exRemove}>
                    <Icon icon={X} size={14} color={c.mutedForeground} />
                  </PressScale>
                ) : (
                  <Text style={styles.exPrescription} numberOfLines={1}>
                    {block.rows.length} × {block.rows[0].reps}
                    {'  ·  '}
                    {block.rows[0].weight > 0
                      ? `${Math.round(displayWeight(block.rows[0].weight, wUnit) * 10) / 10} ${wl}`
                      : i18n.nRdBodyweight}
                  </Text>
                )}
              </View>
              <ExerciseProgress
                insight={insightFor(block.name)}
                last={lastFor(block.name)}
                name={block.name}
                u={wUnit}
                i18n={i18n}
              />
            </View>

            {block.rows.map((row, ri) => {
              const isDone = !!shown[row.key];
              const effort = rpe[row.key] ?? row.plannedRpe;
              const secs = restOf(row);
              const open = editing === row.key;
              /* Lit only when it stopped agreeing with the plan — the same rule
                 the two chips below follow, so one glance down the card finds
                 every set that went differently. */
              const loadOn = loadOf(row) !== plannedLoad(row);
              const repsOn = repsOf(row) !== plannedReps(row);
              return (
                <View key={row.key}>
                  {ri > 0 ? <View style={styles.hair} /> : null}
                  <View style={[styles.setBlock, isDone && styles.setCardDone]}>
              <View style={styles.setRow}>
                {/*
                  The tick.

                  It was a 26pt box outlined in `colors.border` — #2b2b31 on a
                  #0e0e11 card, which is a 1.3:1 edge. It was there and it could
                  not be seen, which is the same as not being there: the first
                  report on this screen was that there was no way to complete a
                  set. A control has to look like one before it can be one.
                */}
                <PressScale
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isDone }}
                  accessibilityLabel={`${row.exerciseName} ${i18n.nRdSet.replace('{n}', String(row.ordinal))}`}
                  hitSlop={12}
                  onPress={() => toggle(row)}
                  style={[styles.check, isDone && styles.checkOn]}>
                  <Icon
                    icon={Check}
                    size={16}
                    color={isDone ? c.primaryForeground : 'rgba(255,255,255,0.22)'}
                    strokeWidth={3}
                  />
                </PressScale>

                {/*
                  What this set actually was — editable, here, on the row.

                  ── why the numbers came back after being removed ──

                  They were taken off these rows a version ago as repetition:
                  "55 kg × 10" three times under a header that could say it
                  once. That was right while they were a READOUT of the plan.
                  It stops being right the moment they are the place you record
                  what you did, because then they are not three copies of one
                  fact — they are three separate facts that happen to agree
                  today.

                  The header still states the plan. These start prefilled from
                  it and stay quiet while they match, so a workout that went
                  exactly as written still reads as one line of grey per set.

                  ── the ordinal shrank to a numeral ──

                  "Set 1 / 3" spent forty points saying what the header's
                  "3 ×" and the row's own position already say. The label is
                  intact for VoiceOver, where position is not available.

                  ── selectTextOnFocus ──

                  Tap the 55 and type 60: the prefill is selected, so the
                  common edit is a tap and two digits rather than a tap, four
                  backspaces and two digits. The whole complaint that started
                  this was step count.
                */}
                <View style={styles.setText}>
                  <Text style={[styles.setNo, isDone && styles.setNoDone]}>{row.ordinal}</Text>
                  <TextInput
                    accessibilityLabel={`${row.exerciseName} ${i18n.nRdSet.replace('{n}', String(row.ordinal))} ${i18n.nWeight}`}
                    style={[styles.field, styles.fieldLoad, !loadOn && styles.fieldPlan]}
                    placeholder="—"
                    placeholderTextColor="rgba(255,255,255,0.25)"
                    keyboardType="decimal-pad"
                    returnKeyType="done"
                    selectTextOnFocus
                    value={loadOf(row)}
                    onChangeText={(v) => setWeightText((prev) => ({ ...prev, [row.key]: decText(v) }))}
                  />
                  {/* No unit beside an empty box. A pull-up row read "— kg × 8",
                      which offers a unit for a number that is not there — and the
                      card header already says Bodyweight. It comes back the moment
                      anything is typed, which is when weighted pull-ups need it. */}
                  {loadOf(row) ? (
                    <Text style={[styles.unit, !loadOn && styles.unitPlan]}>{wl}</Text>
                  ) : null}
                  <Text style={styles.times}>×</Text>
                  <TextInput
                    accessibilityLabel={`${row.exerciseName} ${i18n.nRdSet.replace('{n}', String(row.ordinal))} ${i18n.nReps}`}
                    style={[styles.field, styles.fieldReps, !repsOn && styles.fieldPlan]}
                    placeholder="—"
                    placeholderTextColor="rgba(255,255,255,0.25)"
                    keyboardType="number-pad"
                    returnKeyType="done"
                    selectTextOnFocus
                    value={repsOf(row)}
                    onChangeText={(v) => setRepsText((prev) => ({ ...prev, [row.key]: intText(v) }))}
                  />
                </View>

                {/*
                  Two chips, collapsed to their values and opened by tapping.

                  Five effort chips and a rest stepper on every row is nine
                  controls per set — on a six-set workout that is fifty-four,
                  all the same shape and none of them the one you want. The
                  value you already have is the answer nine times out of ten.
                */}
                <PressScale
                  accessibilityRole="button"
                  accessibilityLabel={`${i18n.nWbRest} ${restLabel(secs)}`}
                  hitSlop={12}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setEditing(open ? null : row.key);
                  }}
                  style={[
                    styles.chip,
                    /*
                      Quiet while it still says what the plan said.

                      Three sets of the same movement showed the same "2:00" and
                      the same "RPE 8", three times, at full contrast — the row
                      spending its emphasis on the part that never changes. Now
                      the default is a plain value and a CHANGED one is a chip,
                      so the eye catches the set you adjusted rather than the two
                      you did not. The tap target is identical either way; this
                      is contrast, not affordance.
                    */
                    secs === row.plannedRest ? styles.chipDefault : null,
                    open && styles.chipOpen,
                  ]}>
                  <Icon
                    icon={Timer}
                    size={11}
                    color={secs === row.plannedRest ? 'rgba(255,255,255,0.30)' : c.mutedForeground}
                  />
                  <Text style={[styles.chipText, secs === row.plannedRest && styles.chipTextDefault]}>
                    {restLabel(secs)}
                  </Text>
                </PressScale>
                <PressScale
                  accessibilityRole="button"
                  accessibilityLabel={`${i18n.nWbEffort} ${effort}`}
                  hitSlop={12}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setEditing(open ? null : row.key);
                  }}
                  style={[
                    styles.chip,
                    effort === row.plannedRpe ? styles.chipDefault : null,
                    open && styles.chipOpen,
                    effort !== row.plannedRpe && EFFORT_TINT[effort]
                      ? { borderColor: alpha(c[EFFORT_TINT[effort]], 0.4) }
                      : null,
                  ]}>
                  <Text
                    style={[
                      styles.chipText,
                      effort === row.plannedRpe
                        ? styles.chipTextDefault
                        : { color: tintFor(c, effort) },
                    ]}>
                    RPE {effort}
                  </Text>
                </PressScale>
              </View>

              {open ? (
                <Retract style={styles.editors}>
                  <View style={styles.editorRow}>
                    <Text style={styles.editorLabel}>{i18n.nWbRest}</Text>
                    <View style={styles.stepper}>
                      <PressScale
                        accessibilityRole="button"
                        accessibilityLabel={`${i18n.nWbRest} −${REST_STEP}`}
                        hitSlop={{ top: 8, bottom: 8 }}
                        onPress={() => bumpRest(row, -REST_STEP)}
                        style={styles.stepBtn}>
                        <Icon icon={Minus} size={14} color={c.foreground} strokeWidth={2.5} />
                      </PressScale>
                      <Text style={styles.stepValue}>{restLabel(secs)}</Text>
                      <PressScale
                        accessibilityRole="button"
                        accessibilityLabel={`${i18n.nWbRest} +${REST_STEP}`}
                        hitSlop={{ top: 8, bottom: 8 }}
                        onPress={() => bumpRest(row, REST_STEP)}
                        style={styles.stepBtn}>
                        <Icon icon={Plus} size={14} color={c.foreground} strokeWidth={2.5} />
                      </PressScale>
                    </View>
                  </View>

                  <View style={styles.editorRow}>
                    <Text style={styles.editorLabel}>{i18n.nWbEffort}</Text>
                    <View style={styles.rpeRow}>
                      {RPE_CHOICES.map((v) => (
                        <PressScale
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
                          style={[styles.rpeOption, // Unselected still carries its colour, faintly — the
                            // ramp has to be readable *before* you choose, or it
                            // is a label on a decision already made.
                            EFFORT_TINT[v] ? { borderColor: alpha(c[EFFORT_TINT[v]], 0.35) } : null, v === effort && styles.rpeOptionOn, v === effort && EFFORT_TINT[v] ? { backgroundColor: c[EFFORT_TINT[v]], borderColor: c[EFFORT_TINT[v]] } : null]}>
                          <Text
                            style={[
                              styles.rpeOptionText,
                              { color: tintFor(c, v) },
                              v === effort && styles.rpeOptionTextOn,
                            ]}>
                            {v}
                          </Text>
                        </PressScale>
                      ))}
                    </View>
                  </View>
                </Retract>
              ) : null}
                  </View>
                </View>
              );
            })}
            {added ? (
              /* Only on movements you added. A planned exercise says how many
                 sets it is, and a fourth set of it is a change to the plan
                 rather than a note about today — a different decision, made
                 somewhere the plan can actually be edited. */
              <PressScale
                accessibilityRole="button"
                accessibilityLabel={i18n.nRdAddSet}
                hitSlop={8}
                onPress={() => addSet(added)}
                style={styles.addSet}>
                <Icon icon={Plus} size={13} color={c.mutedForeground} strokeWidth={2.5} />
                <Text style={styles.addSetText}>{i18n.nRdAddSet}</Text>
              </PressScale>
            ) : null}
          </GlassCard>
        </Animated.View>
        );
      })}

      {/*
        The way to record something the plan did not ask for, at the bottom of
        the plan it did.

        Visible rather than tucked behind a menu, and for the reason this screen
        has been corrected on twice already: a control nobody notices is a
        control nobody has. It is outlined rather than filled because it is not
        the action of this screen — finishing is — but it is a full-width row
        with a label, because "I also did some curls" has to be answerable
        without leaving a half-ticked workout.
      */}
      <PressScale
        accessibilityRole="button"
        accessibilityLabel={i18n.nRdAddExercise}
        onPress={addExercise}
        style={styles.addEx}>
        <Icon icon={Plus} size={15} color={c.mutedForeground} strokeWidth={2.5} />
        <Text style={styles.addExText}>{i18n.nRdAddExercise}</Text>
      </PressScale>

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
      <PressScale
        accessibilityRole="button"
        accessibilityState={{ disabled: !canFinish }}
        disabled={!canFinish}
        onPress={finish}
        style={[styles.finish, !canFinish && styles.finishOff, logged && styles.finishDone]}>
        <Icon
          icon={Check}
          size={17}
          color={logged ? c.readinessGreen : c.primaryForeground}
          strokeWidth={2.5}
        />
        {/* A dimmed button with the same words on it is a button that looks
            broken. On a day that has not happened the label says which of the
            three things is true, the same way it already does for one that has
            been logged. */}
        <Text style={[styles.finishText, logged && styles.finishTextDone]}>
          {logged ? i18n.nRdAlready : future ? i18n.nRdFuture : i18n.nRdFinish}
        </Text>
      </PressScale>

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
        next={resting?.next ?? null}
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
            return { ...s, left, total: Math.max(s.total, left) };
          })
        }
      />

    </View>
  );
}

const stylesFor = makeStyles((c) => ({
  wrap: { gap: spacing.sm },
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  emptyText: { ...type.body, color: c.foreground },
  emptyHint: { ...type.footnote, color: c.mutedForeground },
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
  emptyBtnText: { ...type.footnote, color: c.foreground, fontWeight: '600' },

  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headText: { flex: 1, minWidth: 0, gap: 2 },
  tplName: { ...type.title2, color: c.foreground },
  progress: { ...type.footnote, color: c.mutedForeground, fontVariant: ['tabular-nums'] },
  editBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  loggedCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm + 2 },
  loggedText: { flex: 1, minWidth: 0, gap: 1 },
  loggedName: { ...type.footnote, color: c.foreground, fontWeight: '600' },
  loggedMeta: { ...type.caption, color: c.mutedForeground, fontVariant: ['tabular-nums'] },

  /* The exercise name is a heading over its sets, not a row of its own — the
     rows below it are the thing, and giving the name a card would make four
     sets of one movement look like five separate items. */
  /* One card per movement, its sets as rows inside — the inset grouped shape
     Apple describes, where a continuous background does the grouping that four
     separate boxes were failing to do. */
  exCard: { padding: 0, overflow: 'hidden', gap: 0 },
  exHead: { gap: 6, paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.sm },
  exTitleRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  /* What every set of this movement shares, said once — the rows below spend
     their width on what varies instead. */
  exPrescription: { ...type.caption, color: c.mutedForeground, fontVariant: ['tabular-nums'] },
  /* A hairline, not a gap: the rows belong to one thing. */
  hair: { height: StyleSheet.hairlineWidth, backgroundColor: c.border, marginLeft: spacing.md },
  setBlock: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  /* Untouched: still the same size and still tappable, just not shouting a
     number the header already gave. */
  chipDefault: { borderColor: 'transparent', backgroundColor: 'transparent' },
  chipTextDefault: { color: 'rgba(255,255,255,0.35)' },
  exName: {
    ...type.footnote,
    color: c.foreground,
    fontWeight: '600',
    marginTop: spacing.sm,
    marginBottom: 2,
  },
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
  checkOn: { backgroundColor: c.primary, borderColor: c.primary },
  setText: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 3 },
  setNo: {
    ...type.caption,
    color: c.mutedForeground,
    fontVariant: ['tabular-nums'],
    width: 12,
    textAlign: 'center',
  },
  setNoDone: { color: 'rgba(255,255,255,0.28)' },
  /*
    A box that looks like a box.

    The first draft was bare text with no background, on the theory that a
    quiet row is a calm row. It read as a label — the same mistake the effort
    chips made before they were given an edge, and the same one the tick made
    before that: "a control has to look like one before it can be one".
  */
  field: {
    ...type.footnote,
    color: c.foreground,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
    height: 28,
    paddingHorizontal: 4,
    /* A TextInput carries its own vertical padding on Android and it fights a
       fixed height — the text sits low and the box looks wrong on one platform
       only, which is the kind of thing nobody sees until somebody reports it. */
    paddingVertical: 0,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  /*
    Căn phải, và không phải vì thẩm mỹ.

    Ô rộng 44pt với chữ căn giữa đẩy "55" ra giữa hộp, nên nó ở XA đơn vị của
    chính nó hơn là đơn vị ở xa dấu nhân — mắt gom "kg ×" thành một cụm và tách
    số ra khỏi nhãn của nó. Căn phải thì "55 kg" dính lại thành một thứ, và dấu
    nhân tách đúng hai con số nó đứng giữa.

    Kèm theo một thứ đắt hơn: các mức tạ xuống thành một CỘT thẳng hàng, nên
    55 / 60 / 60 đọc được bằng một cái liếc dọc thay vì phải đọc từng hàng.
  */
  fieldLoad: { minWidth: 44, textAlign: 'right' },
  fieldReps: { minWidth: 34 },
  /* Still a box, just not shouting: it holds what the plan said, and the plan
     is already stated in full one line above. */
  fieldPlan: { color: 'rgba(255,255,255,0.4)', backgroundColor: 'transparent', borderColor: 'transparent' },
  unit: { ...type.caption, color: c.mutedForeground },
  unitPlan: { color: 'rgba(255,255,255,0.3)' },
  /* Room on both sides. At the row gap alone it sat against the unit and read
     as one clump, "kg ×", instead of separating the two numbers it is between. */
  times: { ...type.caption, color: 'rgba(255,255,255,0.3)', paddingHorizontal: 3 },
  exNameInput: { flex: 1, minWidth: 0, padding: 0 },
  exRemove: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  addSet: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    height: 34,
    marginTop: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.border,
  },
  addSetText: { ...type.caption, color: c.mutedForeground },
  addEx: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
    borderRadius: radius.md,
    /* Solid, not dashed — `tools/training-card.mjs` caught the first draft and
       says why: iOS refuses a dashed border whose four sides differ and then
       draws NOTHING rather than falling back, so the button would have been an
       invisible tap target on the platform this ships to. A quiet fill carries
       the same "this is available, it is not the main event" without betting on
       a border style. */
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  addExText: { ...type.footnote, color: c.mutedForeground },
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
  chipOpen: { borderColor: c.primary },
  chipText: { ...type.caption, color: c.foreground, fontWeight: '600', fontVariant: ['tabular-nums'] },

  editors: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.border,
  },
  editorRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  editorLabel: { ...type.footnote, color: c.mutedForeground, flexShrink: 1 },
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
    color: c.foreground,
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
  rpeOptionOn: { backgroundColor: c.primary, borderColor: c.primary },
  rpeOptionText: { ...type.footnote, color: c.foreground, fontVariant: ['tabular-nums'] },
  rpeOptionTextOn: { color: c.primaryForeground, fontWeight: '700' },

  finish: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 52,
    borderRadius: radius.lg,
    backgroundColor: c.primary,
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
  finishTextDone: { color: c.readinessGreen },
  finishText: { ...type.body, color: c.primaryForeground, fontWeight: '600' },

}));
