import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { useI18n } from '@/hooks/use-app-settings';
import { useAuth } from '@/hooks/use-auth';
import { toast } from '@/lib/toast';
import { useInvalidateToday } from '@/hooks/useTodayData';
import { supabase } from '@/integrations/supabase/client';
import {
  activityName,
  APPLE_SOURCE,
  getDailyStepHistory,
  getLastNightSleep,
  getLatestBiometrics,
  getRecentWorkouts,
  getTodayActiveEnergy,
  getTodayExerciseMinutes,
  getTodaySteps,
  healthAlreadyAsked,
  isHealthKitAvailable,
  requestHealthPermissions,
} from '@/lib/health';
import { useAppSettings } from '@/hooks/use-app-settings';
import { recomputeDailyLog } from '@/lib/daily-log-service';
import { touchedDays } from '@/lib/health-days';
import { localDateStr } from '@/lib/local-date';

/**
 * Pulls today's steps + latest biometrics from Apple Health and writes
 * them to the same tables the web app uses (biometric_samples inserts,
 * daily_logs.steps upsert), then refreshes the Today queries.
 *
 * ── two callers, and why they are not the same ──
 *
 * This ran from three buttons and nowhere else. Everything below worked
 * perfectly and only when somebody remembered to press one — which meant that
 * on any ordinary morning the readiness score, the most considered number in
 * the app, was computed from **yesterday's** HRV, resting heart rate and sleep.
 * Nothing looked broken. The number was simply wrong, quietly, for everybody
 * who did not tap.
 *
 * So there is now a second caller that runs on its own (`useAutoHealthSync`),
 * and it needs the opposite manners from the button:
 *
 *   - **It must not prompt.** iOS shows the Health sheet once. A button press
 *     is somebody asking for it; opening the app is not.
 *   - **It must not speak.** A success toast and a haptic every time the app
 *     comes to the foreground is noise, and a red error toast on launch — for
 *     work nobody requested — is worse.
 *
 * `silent` is that difference, and it is a parameter rather than two copies of
 * the body because the writes below are the part that must not drift apart.
 */
function useSyncMutation(silent: boolean) {
  const { user } = useAuth();
  const invalidate = useInvalidateToday();
  const queryClient = useQueryClient();
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const vi = lang === 'vi';

  const sync = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not signed in');

      /* The button may ask. The clock may not — see `healthAlreadyAsked`. */
      const granted = silent ? await healthAlreadyAsked() : await requestHealthPermissions();
      if (!granted) throw new Error('Health access was not granted');

      const [bio, steps, activeKcal, exerciseMin, sleep, workouts, stepDays] = await Promise.all([
        getLatestBiometrics(),
        getTodaySteps(),
        getTodayActiveEnergy(),
        getTodayExerciseMinutes(),
        getLastNightSleep(),
        getRecentWorkouts(),
        /* The days that are already finished — see `getDailyStepHistory`. One
           query, not fourteen, and the same `cumulativeSum` today is counted
           with. */
        getDailyStepHistory(),
      ]);
      if (
        !bio &&
        steps == null &&
        activeKcal == null &&
        exerciseMin == null &&
        !sleep &&
        workouts.length === 0 &&
        stepDays.length === 0
      ) {
        throw new Error('No health data found — open the Health app to confirm data exists');
      }

      if (bio) {
        /*
          Upsert, not insert — see `20260817120000_health_import_conflict_target.sql`.

          `external_id` is the reading's own identity at the source, so a sync
          that finds nothing new lands on the row it already wrote. The bare
          `.insert()` this replaces added a copy of the same two numbers on
          every foreground: Apple computes resting heart rate once a day, and
          `useAutoHealthSync` runs every fifteen minutes the app is looked at.
        */
        const { error } = await supabase.from('biometric_samples').upsert({
          user_id: user.id,
          external_id: bio.external_id,
          hr_bpm: bio.hr_bpm,
          /* SDNN into the SDNN column. This wrote `hrv_rmssd_ms` for a long
             time, which put Apple's SDNN into the same series as readings
             people typed from RMSSD-reporting straps — a mixed baseline under
             the readiness score's largest term. */
          hrv_sdnn_ms: bio.hrv_sdnn_ms,
          spo2_pct: bio.spo2_pct,
          resp_rate_rpm: bio.resp_rate_rpm,
          source: bio.source,
          date_time: bio.date_time,
          confidence: bio.confidence,
        }, { onConflict: 'user_id,external_id' });
        if (error) throw error;
      }

      /*
        ── last night, if the watch has it and nobody has typed it ──

        `external_id` carries the night's own start time, so a second sync in
        the same morning updates the row it already wrote instead of adding a
        second night. `onConflict` targets
        `sleep_logs_user_external_key` — a plain `UNIQUE (user_id,
        external_id)`, because the **partial** index this used to point at could
        never be inferred as an arbiter and every one of these upserts failed.
        Hand-entered nights still repeat freely: their `external_id` is NULL and
        Postgres treats NULLs as distinct. Measured, both halves, in
        `20260817120000_health_import_conflict_target.sql`.

        A night somebody already logged by hand is left alone: they were there
        and the watch was only on their wrist.
      */
      if (sleep) {
        /*
          ── `limit(1)`, not `maybeSingle()`, and the error is read ──

          `maybeSingle()` has two ways to answer "no row" that are not one:
          a query that genuinely matched nothing, and a query that matched
          **more than one** — which it reports as an error. Somebody who logged
          two naps by hand inside this ±12h window hit the second one, the error
          was destructured away, `manual` came back nullish, and the watch's
          night was written on top of theirs. Two rows for one night is not a
          cosmetic duplicate: `daily-log-service` takes the latest `waketime` as
          *the* night and averages `sleepDebt7d` over a row count that has
          gained a phantom entry, and sleep is 0.30 of the readiness score.

          A failed lookup is not permission to write. It stops the sleep step
          and says so, rather than guessing that nothing was there.
        */
        const { data: manual, error: manualErr } = await supabase
          .from('sleep_logs')
          .select('id')
          .eq('user_id', user.id)
          .eq('source', 'manual')
          .gte('bedtime', new Date(+new Date(sleep.bedtime) - 12 * 3600 * 1000).toISOString())
          .lte('bedtime', new Date(+new Date(sleep.bedtime) + 12 * 3600 * 1000).toISOString())
          .limit(1);
        if (manualErr) throw manualErr;

        if (!manual || manual.length === 0) {
          const { error } = await supabase.from('sleep_logs').upsert(
            {
              user_id: user.id,
              bedtime: sleep.bedtime,
              waketime: sleep.waketime,
              asleep_min: sleep.asleep_min,
              deep_min: sleep.deep_min,
              light_min: sleep.light_min,
              rem_min: sleep.rem_min,
              source: APPLE_SOURCE,
              external_id: sleep.external_id,
            },
            { onConflict: 'user_id,external_id' },
          );
          if (error) throw error;
        }
      }

      /*
        ── sessions the watch recorded ──

        `volume_load: 0` and `sets: []` are the honest values, not placeholders.
        A run has no tonnage, and ACWR is a sum of volume — so these raise
        `workout_count` and reset `daysSinceWorkout` (the assistant's "you have
        not trained in 2 days") while leaving the load ratio untouched. Giving
        them an invented volume would corrupt the one number on that screen
        whose whole job is to be trustworthy.
      */
      if (workouts.length > 0) {
        const { error } = await supabase.from('workout_sessions').upsert(
          workouts.map((w) => ({
            user_id: user.id,
            date_time: w.date_time,
            sets: [],
            volume_load: 0,
            template_name: `${activityName(w.activity_type, vi)} · ${w.minutes}′${w.kcal ? ` · ${w.kcal} kcal` : ''}`,
            source: APPLE_SOURCE,
            external_id: w.external_id,
          })),
          { onConflict: 'user_id,external_id' },
        );
        if (error) throw error;
      }

      /*
        Only the fields Health actually answered.

        `active_kcal` and `active_minutes` join `steps` here, and this is the
        only writer of any of the three — `recomputeDailyLog` upserts a fixed
        list of columns that does not include them, so a meal saved after a
        sync cannot wipe the rings, and a sync cannot wipe the readiness score.
        One writer per column, deliberately.

        A metric Health had nothing for is left out of the object rather than
        written as 0. Sending zero would overwrite this morning's real sync the
        moment a later one runs without permission for that type, and "you
        burned 0 calories today" is a much more confident statement than "I do
        not know".
      */
      const measured: { steps?: number; active_kcal?: number; active_minutes?: number } = {};
      if (steps != null) measured.steps = steps;
      if (activeKcal != null) measured.active_kcal = activeKcal;
      if (exerciseMin != null) measured.active_minutes = exerciseMin;

      /*
        ── one statement, because the three it replaces could not be made safe ──

        This was: `select('id').maybeSingle()`, then `update` if a row came
        back, `insert` if one did not. Four faults in eight lines, and the
        database already had a verb that has none of them.

        1. **A failed lookup was read as "there is no row."** The `error` was
           destructured away, so a dropped connection, a timeout or an RLS
           refusal all arrived as `existing === undefined` — and the branch that
           takes is `insert`, against a table carrying `UNIQUE (user_id, date)`.
           The insert is then refused for a reason that has nothing to do with
           the truth, and the day's steps are gone. Exactly the class Chain A
           found in the offline weight replay.

        2. **Neither write was checked either.** Three statements, zero of them
           reporting. The mutation went on to `onSuccess` and showed
           *"Đã đồng bộ"* over a day nothing had been written to.

        3. **Read-then-write is a race with itself.** There are three live sync
           mutations — the auto one, Today's, and the Health card's — and two
           can be in flight at once. Both select, both find nothing, both
           insert; one wins and one hits the unique constraint. The losing one
           is the silent failure in (2).

        4. And `update(...).eq('id', existing.id)` names a row by an id read a
           round trip earlier, which is the shape that goes wrong the day
           anything else can delete a day's row.

        `upsert` on the natural key answers all four: one statement, no read,
        no id, no window between them, and the conflict is resolved by the
        database rather than by a guess. It writes only the columns named in
        the payload, so the "one writer per column" rule this comment block
        already relies on is untouched — `recomputeDailyLog` keeps its own
        list and neither can wipe the other's.
      */
      if (Object.keys(measured).length > 0) {
        const { error } = await supabase
          .from('daily_logs')
          .upsert({ user_id: user.id, date: localDateStr(), ...measured }, { onConflict: 'user_id,date' });
        if (error) throw error;
      }

      /*
        ── and the days that finished while nobody was looking ──

        The three lines above ask HealthKit for *today* and file the answer under
        today. That is all this sync has ever done, and it means a completed day
        keeps whatever number happened to be true at the last foreground: log out
        at nine in the evening on 9,000 steps, walk home, and 9,000 is what that
        day is worth for ever. Nothing came back to finish it.

        Every reader of a past day's steps therefore read a partial figure. The
        Steps screen averages seven of them and trends three against three; the
        weekly `steps_50k` challenge sums the week. Both were summing days that
        had stopped early, and the error only ever runs one way — down.

        One `upsert` with an array is one request, so the cost of this is a
        single HealthKit query and a single round trip however many days moved.
        Idempotent by `(user_id, date)`, and deterministic when two syncs run
        together: they read the same buckets and write the same numbers.

        Only `steps`. `active_kcal` and `active_minutes` come from the same
        three-line block and are just as partial — but nothing in the app reads
        either for a day other than today (`activity-rings` takes them from
        today's row and there is no history query for them), so backfilling them
        would be two more HealthKit queries to correct numbers nobody can see.
        The day a screen plots them, this is the paragraph that has to change.
      */
      if (stepDays.length > 0) {
        const { error } = await supabase.from('daily_logs').upsert(
          stepDays.map((d) => ({ user_id: user.id, date: d.date, steps: d.steps })),
          { onConflict: 'user_id,date' },
        );
        if (error) throw error;
      }

      /*
        ── every day this sync touched, not the day the sync happened ──

        Readiness reads HRV, resting HR, sleep and load, and this sync can move
        all four — so it recomputes whenever any of them arrived, not just on a
        biometric sample. `recomputeDailyLog` is also what writes
        `sleep_duration_min`, `workout_count` and `volume_load` from the rows
        just inserted.

        It used to rebuild `localDateStr()` and nothing else, and the rows it
        writes are not all today's. `getRecentWorkouts()` imports **seven days**
        of sessions and `getLastNightSleep()` looks **36 hours** back, so a run
        the watch recorded on Monday lands in `workout_sessions` on Monday while
        Thursday is the only day rebuilt. Measured, with a run on day −2 and
        meals on −3, −1 and today:

            workout_sessions thật sự nằm ở: 2026-08-17
            daily_logs:  08-19 ✓   08-18 ✓   08-16 ✓   08-17 KHÔNG CÓ HÀNG NÀO

        Nothing repairs it: a later sync rebuilds its own day, so only an edit
        made to that specific day ever corrects it. And the consequence is not
        confined to a number on a chart — `LOGGED_DAY_FILTER` asks
        `kcal>0 OR workout_count>0 OR …` against `daily_logs`, so:

            ngày chuỗi đếm là hoạt động: 08-19, 08-18, 08-16

        A day the person genuinely trained is invisible, their streak breaks at
        it, and the medals `useCheckAwards` grants from that streak are withheld.

        The set is bounded by the import windows — at most eight days — and they
        run one at a time: two rebuilds of the same day race each other, and two
        rebuilds of different days would still queue behind the same connection.
      */
      for (const day of touchedDays({ bio, sleep, workouts })) {
        await recomputeDailyLog(user.id, day);
      }

      return { steps, bio, sleep, workouts: workouts.length };
    },
    onSuccess: () => {
      invalidate();
      // Steps screen + biometrics history read their own keys
      queryClient.invalidateQueries({ queryKey: ['steps_history', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['biometric_history', user?.id] });
      /*
        ── the one answer that changes exactly once in an account's life ──

        `useStepsAvailable` asks "has a step count ever reached this account",
        and it is cached for an hour precisely because the answer almost never
        moves. The moment it *does* move is this one — the first sync that ever
        lands a step count — and nothing told it.

        So for the first hour after connecting Health, `useDailyQuests` kept
        dropping the steps quest: the day stayed at 4/5, the ten coins and
        twelve XP were unreachable, and Koa's "finished everything" moment could
        not fire. Every one of those is the failure `useStepsAvailable` was
        written to remove, reappearing for an hour on the one day somebody has
        just connected their watch and is looking at the app.
      */
      queryClient.invalidateQueries({ queryKey: ['steps_available', user?.id] });
      /* The screens that read the two new sources. Without these the sleep
         screen keeps showing last night as unlogged until the app restarts.

         `sleep_history` and not `sleep_logs`: this line said `sleep_logs` —
         the *table* name — and no query in the app is keyed on that, so it
         matched nothing and invalidated nothing. The comment above it described
         a bug that was still happening. A key that names the table rather than
         the query is the easiest possible thing to write and produces no error
         of any kind; `invalidateQueries` is happy to match zero observers. */
      queryClient.invalidateQueries({ queryKey: ['sleep_history', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['sleep_duration_history', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['recent_workouts', user?.id] });
      if (silent) return;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.success(i18n.nHealthSynced);
    },
    /* "No permission" and "no data yet" are the two ordinary outcomes of an
       automatic run, and neither is something to interrupt somebody with. */
    onError: (e: Error) => {
      if (!silent) toast.error(e.message);
    },
  });

  return sync;
}

export function useHealthSync() {
  return { available: isHealthKitAvailable(), sync: useSyncMutation(false) };
}

/**
 * How long yesterday's numbers may stand before they are refreshed.
 *
 * Fifteen minutes is chosen against the slowest thing this reads rather than
 * the fastest. Steps move constantly, but sleep arrives once a night and HRV
 * and resting heart rate are written by the watch a few times a day — so the
 * gap that matters is "did last night land before I looked", and any interval
 * under an hour answers that. Fifteen keeps the step count feeling live without
 * making the app do real work every time it is glanced at.
 *
 * Persisted rather than kept in memory, because the common shape of a morning
 * is opening the app four times in ten minutes.
 */
const AUTO_SYNC_INTERVAL_MS = 15 * 60 * 1000;
const LAST_SYNC_KEY = 'health:lastAutoSync';

/** Guards the window between deciding to sync and the mutation existing — see `attempt`. */
let autoSyncInFlight = false;

/**
 * Keep Health data current without anybody having to think about it.
 *
 * Mounted once, inside the authenticated part of the tree. Runs on mount and
 * whenever the app returns to the foreground — the two moments at which
 * somebody is about to look at a number and it had better be today's.
 */
export function useAutoHealthSync(): void {
  const { user } = useAuth();
  const sync = useSyncMutation(true);

  /* The mutation object is rebuilt every render; the effect below must not be.
     Reading it through a ref keeps the listener registered once. */
  const syncRef = useRef(sync);
  useEffect(() => {
    syncRef.current = sync;
  }, [sync]);

  /*
    ── the slot is claimed before anything is awaited ──

    `attempt` has three `await`s before it starts the sync, and two callers that
    can fire within a frame of each other: the mount effect, and the AppState
    listener registered in the same effect — a launch straight into the
    foreground runs both. `isPending` is false until `mutate()` is actually
    called, and the persisted stamp is only written on the far side of those
    awaits, so both runs read the same old `last`, both passed, and both
    started a full sync against the same day.

    That is the one race the rest of this round exists to make survivable rather
    than harmless: two syncs writing the same rows is now idempotent, but it is
    still two permission checks, twelve HealthKit queries and two eleven-query
    rebuilds for one result.

    A module-scope flag is the right scope for it, not a ref: the guard has to
    hold across every mount of this hook in the process, and `useAutoHealthSync`
    is mounted once but remounts on any auth change. It is set before the first
    `await` and cleared in `finally`, so nothing can wedge it.
  */
  const attempt = useCallback(async () => {
    if (!user || !isHealthKitAvailable()) return;
    if (autoSyncInFlight || syncRef.current.isPending) return;
    autoSyncInFlight = true;
    try {
      if (!(await healthAlreadyAsked())) return;

      const last = Number((await AsyncStorage.getItem(LAST_SYNC_KEY)) ?? 0);
      if (Date.now() - last < AUTO_SYNC_INTERVAL_MS) return;

      /* Stamped before the run, not after. A sync that fails should still hold
         the interval — otherwise a device with no Health data retries on every
         single foreground, for ever. */
      await AsyncStorage.setItem(LAST_SYNC_KEY, String(Date.now()));
      syncRef.current.mutate();
    } finally {
      autoSyncInFlight = false;
    }
  }, [user]);

  useEffect(() => {
    void attempt();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void attempt();
    });
    return () => sub.remove();
  }, [attempt]);
}
