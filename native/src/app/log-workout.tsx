import { useMutation } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { CalendarDays, Check, Plus, X } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as Crypto from 'expo-crypto';
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

import { PickRow } from '@/components/ascnd/pick-row';
import { PressScale } from '@/components/ascnd/press-scale';
import { MusicLaunch } from '@/components/ascnd/music-launch';
import { Icon } from '@/components/ascnd/icon';
import { RecordCelebration } from '@/components/ascnd/record-celebration';
import type { TplExercise } from '@/components/ascnd/template-list';
import { colors, glass, radius, spacing, type } from '@/constants/ascnd';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { useAuth } from '@/hooks/use-auth';
import { useLogWorkoutSession, useWorkoutSessions } from '@/hooks/use-fitness-data';
import { useDailyStreak } from '@/hooks/use-mascot-room';
import { refreshKoaContext, useKoaContext } from '@/hooks/use-koa-context';
import { useExercises, useRoutineDays, useWorkoutTemplates } from '@/hooks/use-library';
import { useUnits } from '@/hooks/use-units';
import { useUserState } from '@/hooks/use-user-state';
import { useDailyLog, useProfile } from '@/hooks/useTodayData';
import { emitKoa } from '@/lib/koa-stage';
import {
  exerciseKey,
  headlineRecord,
  recordsMagnitude,
  type PersonalRecord,
} from '@/lib/personal-record';
import { offlineNow } from '@/lib/offline';
import { OFFLINE_WRITE_KEY, type OfflineWrite } from '@/lib/offline-write';
import { toast } from '@/lib/toast';
import { outOfRangeMessage } from '@/lib/plausible';
import { suggestLoad } from '@/lib/load-progression';
import { effortRange } from '@/lib/prescription';
import { localDateStr, routineIndex } from '@/lib/local-date';
import { entered, parseRepEntry } from '@/lib/rep-entry';
import { displayWeight, weightLabel, weightToKg, type WeightUnit } from '@/lib/units';

const RPE_VALUES = [6, 7, 8, 9, 10] as const;

interface SetRow {
  exerciseId: string;
  exerciseName: string;
  weight: string; // kept as text for input friendliness
  /** repetitions, or a hold written as `45s` — see `lib/rep-entry.ts` */
  reps: string;
  /**
   * A rehearsal, not a working set.
   *
   * It changes two things and both matter: a warm-up cannot post a personal
   * record — twelve easy reps at a load you have used before would otherwise
   * be a rep record nobody earned — and it is left out of the numbers Exercise
   * Intelligence reads a trend from.
   */
  warmup: boolean;
}

const EMPTY_SET: SetRow = { exerciseId: '', exerciseName: '', weight: '', reps: '', warmup: false };

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
        /* A planned row is work, not a rehearsal. Templates carry no warm-ups
           and inventing one would leave a set out of the record silently. */
        warmup: false,
      });
    }
  }
  return rows.length > 0 ? rows : [{ ...EMPTY_SET }];
}

export default function LogWorkoutSheet() {
  const i18n = useI18n();
  const { weight: wUnit } = useUnits();
  const { user } = useAuth();
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

  /*
    Recent sessions of *this* workout, by name.

    By name because that is the only thread the sheet has: a session stores
    `template_name`, not a template id, and the name is what somebody typed or
    picked. Matching loosely across different workouts would average a leg day
    into a press day and suggest a load change for neither.

    `useWorkoutSessions(14)` is already fetched by two other screens, so on a
    warm cache this costs nothing; on a cold one it is the same fortnight
    everything else here reads.
  */
  const { lang } = useAppSettings();
  const vi = lang === 'vi';
  const { data: recentSessions } = useWorkoutSessions(14);
  /*
    ── the two safety gates need an input, and this is the screen that needs them ──

    `useUserState` deliberately subscribes to nothing: it reads the React Query
    **cache** and mounts no observer, because the companion layer's awareness of
    somebody must not cost the app requests. A screen that never fetched the
    streak therefore gets `UNKNOWN_STATE` — `settling_in`, confidence `none`.

    For the koala that is the right answer: it simply has no opinion. For *this*
    screen it is not, because `suggestLoad` reads that confidence as a switch.
    Both gates that can stop an "add load" suggestion are written
    `situationConfidence != null && !== 'none'`, so an unread cache turns them
    off — run against the real engine:

        overreaching, confidence high  → hold
        overreaching, confidence none  → up, +10%
        returning,    confidence none  → up, +10%

    And it is reachable without anything going wrong: the streak's query key
    carries today's date (`['mascot_streak', user, today]`), so on the first
    launch of a new day the key is fresh and empty. Open the app, go straight to
    the workouts tab, log a session — the gates were never consulted, and the
    sheet offers ten per cent more to somebody the app itself would have called
    overreached.

    So the one screen that acts on the state asks for it. One query, ten-minute
    `staleTime`, and Today warms the same key — on the ordinary path this is a
    cache hit and no request at all. The shared rule is untouched: it says a
    consumer that needs the answer should read it, and this is the consumer that
    turns it into advice.
  */
  useDailyStreak();
  const userState = useUserState();
  /* Today's readiness, if it has been computed. `null` when it has not, and the
     engine treats that as "no opinion" rather than as green — the difference
     between the two is the whole reason it is nullable. */
  const { data: profile } = useProfile();
  const { data: todayLog } = useDailyLog();
  const readinessStatus = (todayLog?.readiness_status ?? null) as
    | 'green'
    | 'yellow'
    | 'red'
    | null;
  /*
    What this workout asks for, from the saved workout of the same name.

    ── the midpoint, because that is the rule the app already has ──

    `effortRange` returns the two ends a template runs between, and turning a
    band into the single number `suggestLoad` aims at is a question
    `goal-training.ts` has already answered once: `goalRpeTarget` is
    `(lo + hi) / 2`. Following it rather than picking an end keeps one rule for
    one question — and picking an end would be a choice with nothing behind it,
    which is how a session of three easy exercises and one all-out finisher ends
    up measured against the finisher.

    `null` when no saved workout carries this name, which is the honest answer
    for something typed in freehand and is what `goal` is the fallback for.
  */
  const askedRpe = useMemo(() => {
    const key = name.trim().toLowerCase();
    if (!key) return null;
    const tpl = (templates ?? []).find((t) => (t.name ?? '').trim().toLowerCase() === key);
    const exs: TplExercise[] = Array.isArray(tpl?.exercises) ? (tpl.exercises as TplExercise[]) : [];
    const band = effortRange(exs);
    return band ? (band[0] + band[1]) / 2 : null;
  }, [templates, name]);

  const loadHint = useMemo(() => {
    const key = name.trim().toLowerCase();
    if (!key) return null;
    const mine = (recentSessions ?? []).filter(
      (s) => (s.template_name ?? '').trim().toLowerCase() === key,
    );
    if (mine.length === 0) return null;
    const suggestion = suggestLoad({
      reported: mine.map((s) => s.session_rpe),
      /*
        ── the effort the workout ASKS FOR, which is not the one being typed ──

        This passed `rpe` — the chip row further down, the field where the person
        says how hard *today* felt. That value is saved as `session_rpe`, which
        `load-progression.ts` defines as "the effort the person **reported**",
        and it was being handed to the input that file defines as "the effort the
        workout **asks for**". The engine exists to compare those two; the one
        call site fed the same quantity into both sides.

        What that produced, run against the real engine with an unchanging
        history of three sessions reported at 7:

            hôm nay gõ 6  → down, −5%     "sessions felt harder than 6, ease off"
            hôm nay gõ 7  → hold
            hôm nay gõ 8  → up,   +5%
            hôm nay gõ 9  → up,  +10%     "sessions felt easier than 9, add 10%"

        The person's actual history is identical in all four. The advice moves
        entirely with the number they type about today — so **the harder you say
        today was, the more the app tells you to add**, which is the inversion of
        the one piece of advice in this app that can contribute to an injury.

        The intent was already written down, in the comment this replaces: *"the
        chip above already carries the template's effort"*. That is true only in
        the moment the plan chip is pressed — the chip is optional, it disappears
        once used, the default without it is the literal 7, and the field's whole
        purpose is that the person then changes it.

        So the target is read from the workout itself, by the same name the
        history above is matched on. No template of that name — a one-off typed
        in freehand — leaves it null, and `goal` below is the documented fallback
        for exactly that case.
      */
      target: askedRpe,
      /* The fallback when the workout states no effort at all: somebody training
         for strength and somebody training to hold steady should not both be
         measured against the same default. Passed unconditionally rather than
         only when `target` is null — a caller that decides when the engine may
         see an input is a caller making the engine's decision. */
      goal: profile?.goal,
      situation: userState.situation,
      situationConfidence: userState.confidence,
      readiness: readinessStatus,
      /* The same row's explain token, so the red gate can tell a recovery red
         from a load-only one — see `hasRecoverySignal`. Passed as the stored
         string rather than a boolean decided here: the rule belongs in one
         place, and a screen that pre-answers it is a screen that can answer it
         differently from the next screen. */
      readinessExplain: todayLog?.readiness_explain,
    });
    if (suggestion.advice === 'unknown' || suggestion.advice === 'hold') return null;
    const pct = Math.round(Math.abs(suggestion.step) * 100);
    /* The number the engine actually aimed at, not the one this screen happens
       to be holding — see `LoadSuggestion.target`. The sentence named `rpe`,
       which is the field for how today felt, so it quoted a figure the verdict
       was not about. */
    const aim = suggestion.target;
    return suggestion.advice === 'up'
      ? (vi
          ? `Mấy buổi "${name.trim()}" gần đây bạn thấy nhẹ hơn mức ${aim} — có thể thử tăng ~${pct}%`
          : `Your recent "${name.trim()}" sessions felt easier than ${aim} — you could try about ${pct}% more`)
      : (vi
          ? `Mấy buổi "${name.trim()}" gần đây bạn thấy nặng hơn mức ${aim} — có thể giảm ~${pct}%`
          : `Your recent "${name.trim()}" sessions felt harder than ${aim} — easing off about ${pct}% is fine`);
  }, [recentSessions, name, askedRpe, profile?.goal, userState.situation, userState.confidence, readinessStatus, todayLog?.readiness_explain, vi]);

  const updateSet = (idx: number, field: 'exerciseName' | 'weight' | 'reps', value: string) => {
    setSets((prev) =>
      prev.map((s, i) => {
        if (i !== idx) return s;
        // Manual typing invalidates a previously picked library exercise
        if (field === 'exerciseName') return { ...s, exerciseName: value, exerciseId: '' };
        return { ...s, [field]: value };
      }),
    );
  };

  const toggleWarmup = (idx: number) => {
    Haptics.selectionAsync();
    setSets((prev) => prev.map((s, i) => (i === idx ? { ...s, warmup: !s.warmup } : s)));
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
          /* A new set inherits the previous row's movement and load, and NOT its
             warm-up flag: the set after a warm-up is usually the working one,
             and a flag that carried would quietly delete a real set from the
             record every time somebody tapped Add. */
          warmup: false,
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
  /* A row counts once it records something — repetitions, or a hold. The test
     was `Number(s.reps) > 0`, which reads `45s` as `NaN` and drops it. */
  const validSets = sets.filter((s) => entered(parseRepEntry(s.reps)));

  /*
    ── the one numeric input in the app with no bound at all ──

    Every other number a person types here is checked against `lib/plausible.ts`
    — heart rate, SpO₂, body fat, a meal's calories, a body weight. The load on
    the bar was not, and it was the most expensive one to leave open.

    A mistyped 700 kg bench does three things at once. It inflates
    `volume_load`, which feeds training load, which feeds the readiness score.
    It is picked up by `lib/personal-record.ts` as a **personal record**, so the
    sheet below throws a celebration for the typo. And it then becomes the
    baseline every later set is measured against, so nothing is ever a record
    again. Deleting the session is the only cure, and nothing on screen suggests
    that is what happened.

    Bounds rather than a guess about anybody's strength: 600 kg sits above
    Hafthór Björnsson's 501 kg deadlift, the heaviest lift ever recorded. Zero
    stays legal — bodyweight work is logged with no load.
  */
  /*
    Only the rows that will actually be written.

    This ran over `sets`, which includes rows nobody has finished filling in —
    and the form opens with an empty one, while "add set" copies the previous
    row's weight with the reps left blank. Blank passes (`plausibleText` accepts
    an empty string), but typing `0` into reps on *any* row failed
    `set_reps` (min 1) and locked the Save button for the whole sheet, with the
    message pointing at a row the user had already decided not to log.

    Before the bound existed those rows were simply skipped, because `validSets`
    drops anything without reps. Checking the wider set than the one being saved
    is what turned a guard into an obstacle — so this checks exactly what gets
    written. The 700 kg typo is still caught: that row has reps, so it is in
    `validSets`.
  */
  const setErrors = validSets.map((row) => ({
    weight: outOfRangeMessage(
      'lift_kg',
      String(weightToKg(Number(row.weight) || 0, wUnit)),
      i18n.outOfRange,
    ),
    reps: outOfRangeMessage('set_reps', row.reps, i18n.outOfRange),
  }));
  const firstSetError = setErrors.find((e) => e.weight || e.reps);
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

  /*
    ── the one moment worth stopping the screen for ──

    A session that beat something is the largest event a strength app has, and
    until now it left the same grey toast as any other save — the column that
    would have said so was written as `false` on every row ever inserted
    (`lib/personal-record.ts`). Now it is computed, and when it comes back
    non-empty the sheet holds for a beat with Koa instead of closing.

    Nothing changes for an ordinary session: no records, no overlay, one frame,
    the toast, gone.
  */
  const [records, setRecords] = useState<PersonalRecord[]>([]);
  const koaCtx = useKoaContext();
  const koaCtxRef = useRef(koaCtx);
  koaCtxRef.current = koaCtx;
  const leaving = useRef(false);

  /*
    `message` because the offline path used to borrow this one wholesale, and
    `logWorkoutSaved` is *"Đã lưu buổi tập!"* — a claim that the workout is on
    the server. Offline it is in a queue on the phone, and the sheet had just
    told the user something that had not happened. `log-meal` and the sleep
    sheet both say the queued version; only this one lied.
  */
  const finish = (message: string = i18n.logWorkoutSaved) => {
    /* Both the tap and the timer land here, and the screen pops — a second
       call would pop the screen behind it as well. */
    if (leaving.current) return;
    leaving.current = true;
    router.back();
    toast.success(message);
  };

  /*
    ── the same workout, down a durable pipe, when there is no signal ──

    `useLogWorkoutSession` reads history to find records and then inserts. Both
    halves need the network, so offline it does neither: React Query pauses the
    mutation, `isPending` stays true for ever, the Save button stays disabled
    (`canSave` below reads it), no toast fires and the sheet never closes. Back
    out and the whole form is gone. On the next launch the paused mutation is
    restored from storage, finds no `mutationFn` registered for its key, and is
    **dropped** — the sets are simply not there.

    A gym basement is the single most likely place in the world for somebody to
    be logging a workout.

    `lib/offline-write.ts` has had a `kind: 'workout'` and a working handler for
    it since the day that file was written. Nothing had ever produced one. This
    is the producer.

    No record is claimed on this path, and that is not an omission: a personal
    record is a comparison against history, and offline there is no history to
    compare with. Inventing one would be the app celebrating something it cannot
    know.
  */
  const queue = useMutation<void, Error, OfflineWrite>({
    mutationKey: [...OFFLINE_WRITE_KEY],
    onMutate: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      finish(i18n.logMealQueued);
    },
  });

  const save = useMutation({
    mutationFn: () =>
      log.mutateAsync({
        templateName: name,
        sessionRpe: rpe,
        sets: validSets.map((s) => {
          const e = parseRepEntry(s.reps);
          return {
            exerciseId: s.exerciseId,
            exerciseName: s.exerciseName,
            weight: weightToKg(Number(s.weight) || 0, wUnit),
            reps: e.reps,
            ...(e.durationSec !== null ? { durationSec: e.durationSec } : {}),
            ...(s.warmup ? { warmup: true } : {}),
          };
        }),
      }),
    onSuccess: (res) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (res.records.length > 0) setRecords(res.records);
      else finish();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /*
    ── announced after the figure exists, not before ──

    The engine's first question is whether anybody can see a reaction
    (`koaOnScreen()`), and on this screen the answer changes *because of* this
    state: the overlay is what puts a Koa on the sheet. Emitting from
    `onSuccess` would ask before mounting it, get "không ai đang nhìn", and
    silently drop the largest moment the app has.

    From an effect it runs after the commit, and after the figure's own mount
    effect — a child's effects run before its parent's — so the presence counter
    is already up. `refreshKoaContext` is what re-reads it; the context captured
    at render time still says nobody is there.

    The id is the day, the movement and the number, so re-saving the same
    workout does not celebrate it twice, while genuinely beating 90 and then 95
    on the same afternoon is two events.
  */
  useEffect(() => {
    if (records.length === 0) return;
    const head = headlineRecord(records);
    emitKoa(
      {
        id: `pr:${localDateStr()}:${head ? exerciseKey(head.exercise) : '?'}:${head?.value ?? 0}`,
        kind: 'personal_record',
        magnitude: recordsMagnitude(records),
        label: head?.exercise,
      },
      refreshKoaContext(koaCtxRef.current),
    );
  }, [records]);

  /*
    Stays disabled after success so the closing sheet can't double-submit.

    ── and the offline branch is a submit too ──

    `save.isPending || save.isSuccess` covers the online path and covered
    nothing else, because offline the tap goes to `queue` instead — a different
    mutation, whose state nothing here read. So the guard that exists to stop a
    second submit was watching the one path that was not taken.

    `router.back()` starts an animation; the sheet stays mounted and hit-testable
    while it plays, and offline the button changes in no way at all — no spinner,
    no tick, the same label — which is the shape that *invites* the second tap.
    `finish()`'s own latch stopped the second `router.back()`, so what came of it
    was silent: two `kind: 'workout'` intentions in the durable queue, two
    inserts on reconnect, and one workout recorded twice.

    A phantom session is not one extra row. `useDeleteWorkoutSession` lists what
    it moves: the day's `volume_load`, the 7- and 28-day load windows behind the
    readiness score, the lifetime count that unlocks mascots, the award
    thresholds, and the `workouts_N` challenges. The queue is deliberately not
    idempotent for this kind — two sessions in one day is a real thing — so
    nothing downstream can undo it.
  */
  const canSave =
    validSets.length > 0 &&
    !firstSetError &&
    !save.isPending &&
    !save.isSuccess &&
    /* A paused mutation stays `isPending` until it sends, which is exactly the
       window the button must stay shut for. Same test `log-meal` gets for free
       by sending both paths through one mutation. */
    !queue.isPending &&
    !queue.isSuccess;

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

        {/* Before the first set, because that is when somebody puts music on —
            and it hands off rather than playing here; see `lib/music-app.ts`. */}
        <MusicLaunch />

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
          {/* The warm-up toggle's column. Unlabelled — a header over a 26pt
              button would be wider than the button — but it has to be here, or
              every label above shifts by 34pt and stops naming the box under
              it. */}
          <View style={styles.colWarm} />
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
                {/*
                  Warm-up, in the row rather than behind a menu.

                  It is one tap and it is visible without being loud: the button
                  is the width of the "W" it holds, and it only fills in when it
                  is on. A rehearsal that cannot be marked is a rehearsal that
                  posts personal records.
                */}
                <Pressable
                  accessibilityRole="switch"
                  accessibilityState={{ checked: s.warmup }}
                  accessibilityLabel={i18n.nLgWarmup}
                  /* 26 + 9 + 9 = 44. Eight was the number every other row in
                     this file uses and it lands at 42 — under Apple's floor,
                     and `tools/tap-targets.mjs` measures rather than eyeballs it. */
                  hitSlop={9}
                  onPress={() => toggleWarmup(idx)}
                  style={[styles.warmBtn, s.warmup && styles.warmBtnOn]}>
                  <Text style={[styles.warmText, s.warmup && styles.warmTextOn]}>
                    {i18n.nLgWarmupShort}
                  </Text>
                </Pressable>
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
        {/* Said where it can be acted on, and only once. `45s` is a convention
            rather than a control, so it has to be written down somewhere. */}
        <Text style={styles.fieldHint}>{i18n.nLgHoldHint}</Text>

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
        {/*
          ── what the last few of these actually felt like ──

          The app has stored both halves of this for a long time and never put
          them together: the template records the effort it *asks for* (`rpe`,
          summarised by `effortRange`), and every logged session records the
          effort the person *reported* (`session_rpe`). Two screens, no
          conclusion.

          This is the one place the comparison is worth anything, because it is
          the moment somebody is about to decide what weight to put on the bar.
          It is a sentence, not a change: nothing is written to the template, and
          the chips below stay exactly as free as they were. `lib/load-progression.ts`
          carries the reasoning, including the gates that stop it ever saying
          "add load" to somebody in a load spike, on their first sessions back,
          or on a morning readiness reads red.
        */}
        {loadHint ? <Text style={styles.loadHint}>{loadHint}</Text> : null}

        <Text style={styles.sectionLabel}>{i18n.nRpe}</Text>
        <PickRow
          value={String(rpe)}
          fill={colors.primary}
          slotFill={colors.secondary}
          radius={radius.md}
          gap={spacing.sm}>
          {RPE_VALUES.map((v) => (
            <PickRow.Item
              key={v}
              itemKey={String(v)}
              accessibilityLabel={String(v)}
              onPress={() => {
                Haptics.selectionAsync();
                setRpe(v);
              }}
              style={styles.chip}>
              <Text style={[styles.chipText, rpe === v && styles.chipTextActive]}>{v}</Text>
            </PickRow.Item>
          ))}
        </PickRow>

        {/* Said next to the button it explains, and only while it is true —
            a permanent instruction is read once and then stops being read. */}
        {validSets.length === 0 ? <Text style={styles.fieldHint}>{i18n.nLgNeedReps}</Text> : null}
        {/* Said next to the button it blocks, and naming the range — a disabled
            button with no reason is the thing that gets an app deleted. */}
        {firstSetError ? (
          <Text style={styles.rangeError}>{firstSetError.weight ?? firstSetError.reps}</Text>
        ) : null}

        <PressScale
                    /* The name has to be a constant, because the *text* is not.

             This button renders a Check on success and a spinner while
             pending, and in both of those branches there is no `<Text>` in the
             tree at all — so the control announced itself as an unnamed
             element at exactly the two moments a person most needs to know
             what it is doing. `tools/tap-targets.mjs` documents this as the
             blind spot it cannot see, and these five buttons were sitting in
             it. */
          accessibilityRole="button"
          accessibilityLabel={i18n.nSaveWorkout}
          style={[styles.saveButton, !canSave && !save.isSuccess && styles.saveDisabled]}
          disabled={!canSave}
          onPress={() => {
            /* Offline, the durable queue takes it; online, the rich path runs
               and can still find a record. The branch is here rather than
               inside the mutation because the two have different variables and
               different promises. */
            if (offlineNow() && user) {
              queue.mutate({
                kind: 'workout',
                userId: user.id,
                rowId: Crypto.randomUUID(),
                dateTime: new Date().toISOString(),
                sets: validSets.map((s, i) => ({
                  exerciseId: s.exerciseId,
                  exerciseName: s.exerciseName.trim() || 'Exercise',
                  setIndex: i + 1,
                  weight: Math.round(weightToKg(Number(s.weight) || 0, wUnit) * 100) / 100,
                  reps: Number(s.reps),
                  rpe: null,
                })),
                volumeLoad: Math.round(volumeLoad),
                templateId: null,
                templateName: name.trim() || 'Workout',
                sessionRpe: rpe,
              });
              return;
            }
            save.mutate();
          }}>
          {save.isSuccess ? (
            <Icon icon={Check} size={22} color={colors.primaryForeground} strokeWidth={3} />
          ) : save.isPending ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <Text style={styles.saveText}>{i18n.nSaveWorkout}</Text>
          )}
        </PressScale>
      </ScrollView>

      {/* Over the form rather than instead of it: the sheet is popping in a
          moment anyway, and unmounting a screen's contents underneath an
          overlay is how a keyboard dismissal animates into an empty page. */}
      {records.length > 0 ? (
        <RecordCelebration records={records} onDone={finish} />
      ) : null}
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
  /* A quiet line, not a banner: it is information beside a decision, and a
     coloured card here would read as the app instructing somebody. */
  loadHint: { ...type.caption, color: colors.mutedForeground, lineHeight: 17 },
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
  colName: { flex: 1, minWidth: 0, textAlign: 'left', paddingHorizontal: spacing.sm },
  colNum: { width: 64 },
  colWarm: { width: 26 },
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
  rangeError: { ...type.caption, color: colors.readinessRed },
  /*
    `minWidth: 0`, and it is not cosmetic.

    A flex item does not shrink below its own content unless it is told it may,
    so this input held the row open at the width of its placeholder and pushed
    whatever came after it off the edge of the card. Measured on the harness:
    content ran to x=384 inside a card ending at 386, with the delete button
    entirely outside — before the warm-up toggle was added, and worse after.
    The row simply had no visible way to remove a set.

    `minWidth: 0` is the idiom this repository already uses for the same thing
    in `shop-grid.tsx` and `exercise-insight.tsx`.
  */
  setName: { flex: 1, minWidth: 0, paddingHorizontal: spacing.sm, height: 44 },
  setNum: { width: 64, paddingHorizontal: spacing.xs, height: 44, textAlign: 'center' },
  removeSet: { width: 24, alignItems: 'center' },
  warmBtn: {
    width: 26,
    height: 26,
    borderRadius: radius.sm - 4,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  warmBtnOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  warmText: { ...type.caption, fontWeight: '700', color: colors.mutedForeground },
  warmTextOn: { color: colors.primaryForeground },
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
  /* No background here on purpose: the row paints the resting box so the
     travelling highlight can sit between it and this label. */
  chip: {
    flex: 1,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
