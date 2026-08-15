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

      const [bio, steps, activeKcal, exerciseMin, sleep, workouts] = await Promise.all([
        getLatestBiometrics(),
        getTodaySteps(),
        getTodayActiveEnergy(),
        getTodayExerciseMinutes(),
        getLastNightSleep(),
        getRecentWorkouts(),
      ]);
      if (
        !bio &&
        steps == null &&
        activeKcal == null &&
        exerciseMin == null &&
        !sleep &&
        workouts.length === 0
      ) {
        throw new Error('No health data found — open the Health app to confirm data exists');
      }

      if (bio) {
        const { error } = await supabase.from('biometric_samples').insert({
          user_id: user.id,
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
        });
        if (error) throw error;
      }

      /*
        ── last night, if the watch has it and nobody has typed it ──

        `external_id` carries the night's own start time, so a second sync in
        the same morning updates the row it already wrote instead of adding a
        second night. `onConflict` targets the partial unique index from
        `20260809120000_health_provenance.sql`, which only covers rows that came
        from a source with an id — hand-entered nights stay free to repeat,
        because two naps in one day are two real rows.

        A night somebody already logged by hand is left alone: they were there
        and the watch was only on their wrist.
      */
      if (sleep) {
        const { data: manual } = await supabase
          .from('sleep_logs')
          .select('id')
          .eq('user_id', user.id)
          .eq('source', 'manual')
          .gte('bedtime', new Date(+new Date(sleep.bedtime) - 12 * 3600 * 1000).toISOString())
          .lte('bedtime', new Date(+new Date(sleep.bedtime) + 12 * 3600 * 1000).toISOString())
          .maybeSingle();

        if (!manual) {
          await supabase.from('sleep_logs').upsert(
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
        await supabase.from('workout_sessions').upsert(
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

      if (Object.keys(measured).length > 0) {
        const dateStr = localDateStr();
        const { data: existing } = await supabase
          .from('daily_logs')
          .select('id')
          .eq('user_id', user.id)
          .eq('date', dateStr)
          .maybeSingle();
        if (existing) {
          await supabase.from('daily_logs').update(measured).eq('id', existing.id);
        } else {
          await supabase.from('daily_logs').insert({ user_id: user.id, date: dateStr, ...measured });
        }
      }

      /* Readiness reads HRV, resting HR, sleep and load, and this sync can now
         move all four — so it recomputes whenever any of them arrived, not just
         on a biometric sample. `recomputeDailyLog` is also what writes
         `sleep_duration_min` and `workout_count` from the rows just inserted. */
      if (bio || sleep || workouts.length > 0) await recomputeDailyLog(user.id, localDateStr());

      return { steps, bio, sleep, workouts: workouts.length };
    },
    onSuccess: () => {
      invalidate();
      // Steps screen + biometrics history read their own keys
      queryClient.invalidateQueries({ queryKey: ['steps_history', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['biometric_history', user?.id] });
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

  const attempt = useCallback(async () => {
    if (!user || !isHealthKitAvailable()) return;
    if (syncRef.current.isPending) return;
    if (!(await healthAlreadyAsked())) return;

    const last = Number((await AsyncStorage.getItem(LAST_SYNC_KEY)) ?? 0);
    if (Date.now() - last < AUTO_SYNC_INTERVAL_MS) return;

    /* Stamped before the run, not after. A sync that fails should still hold
       the interval — otherwise a device with no Health data retries on every
       single foreground, for ever. */
    await AsyncStorage.setItem(LAST_SYNC_KEY, String(Date.now()));
    syncRef.current.mutate();
  }, [user]);

  useEffect(() => {
    void attempt();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void attempt();
    });
    return () => sub.remove();
  }, [attempt]);
}
