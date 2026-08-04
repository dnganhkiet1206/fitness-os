import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/integrations/supabase/client';
import { recomputeDailyLog } from '@/lib/daily-log-service';
import { localDateStr } from '@/lib/local-date';
import { useAuth } from './use-auth';
import { useInvalidateToday } from './useTodayData';

function daysAgoISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function todayISO(): string {
  return localDateStr();
}

/** Today's weight entry, if any — powers the Weight Check-in widget */
export function useTodayWeight() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['weight_log', user?.id, todayISO()],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from('weight_logs')
        .select('weight_kg')
        .eq('user_id', user!.id)
        .eq('date', todayISO())
        .maybeSingle();
      return data ? Number(data.weight_kg) : null;
    },
  });
}

export function useLogWeight() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (weight_kg: number) => {
      const { error } = await supabase
        .from('weight_logs')
        .upsert(
          { user_id: user!.id, date: todayISO(), weight_kg, notes: '' },
          { onConflict: 'user_id,date' },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['weight_log', user?.id] });
      qc.invalidateQueries({ queryKey: ['weight_history', user?.id] });
    },
  });
}

/**
 * Remove one day's weight.
 *
 * ── why this is needed at all ──
 *
 * `useLogWeight` upserts on `(user_id, date)`, so today's number can be
 * corrected by logging it again. Any earlier day cannot: there is no way to
 * enter a weight for a past date, and so no way to fix one. A slip of 75 → 175
 * is permanent, and it does not sit quietly — it sets the chart's scale, the
 * change stat and the BMI reading, so one wrong number makes every weight
 * around it unreadable.
 *
 * ── deleting by date, not by id ──
 *
 * `(user_id, date)` is unique — it is what `useLogWeight`'s upsert conflicts on
 * — so a date identifies exactly one row. That keeps `useWeightHistory`'s
 * `select` as it is; asking it for an `id` as well would change the shape every
 * consumer of that query already destructures.
 */
export function useDeleteWeight() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (date: string) => {
      const { error } = await supabase
        .from('weight_logs')
        .delete()
        .eq('user_id', user!.id)
        .eq('date', date);
      if (error) throw error;
    },
    onSuccess: () => {
      // Both keys, and both without the `days` suffix so every window is
      // invalidated — the tab reads a 90-day and a 3650-day history at once,
      // and refreshing one would leave the other showing the deleted day.
      qc.invalidateQueries({ queryKey: ['weight_log', user?.id] });
      qc.invalidateQueries({ queryKey: ['weight_history', user?.id] });
    },
  });
}

/**
 * Remove one logged session.
 *
 * ── why this is needed at all ──
 *
 * `log-workout.tsx` **inserts**; it does not upsert on anything. A double tap
 * on Save, or a set entered at 100kg instead of 10, is a row that cannot be
 * touched again from anywhere in the app. And unlike a stray weight — which is
 * wrong on one chart — a session's `volume_load` is an input to five things:
 *
 *   - today's `daily_logs.volume_load` (`daily-log-service.ts:56`)
 *   - the 7-day and 28-day load windows, i.e. the acute:chronic ratio the
 *     readiness score is built on (`daily-log-service.ts:96,101`)
 *   - the lifetime workout count that unlocks mascots (`use-mascot.tsx:24`)
 *   - award thresholds at 1 / 10 / 50 / 100 (`use-extras.ts:148`)
 *   - the `workouts_N` weekly challenges (`use-extras.ts:351`)
 *
 * One phantom session therefore does not just add a row: it tells somebody they
 * are more fatigued than they are, on the screen they use to decide whether to
 * train.
 *
 * ── recompute the session's own day, not today ──
 *
 * `recomputeDailyLog` takes the date to rebuild, and the list reaches back
 * fourteen days. Passing `localDateStr()` would rebuild today from data that
 * did not change and leave the day that *did* change holding a total for a
 * session that no longer exists. The date comes from the row's `date_time`,
 * read in local time for the same reason every other window here is.
 *
 * ── what deliberately does not move ──
 *
 * Awards already earned are not revoked: they record that something happened,
 * and the app has no notion of un-happening one. Weekly challenge progress
 * *does* fall back — `use-extras.ts:427` writes the recounted value and clears
 * `completed_at` — which raises the obvious question of whether delete → re-log
 * pays the reward twice. It cannot: the ledger row's `ref_key` is
 * `challengeRefKey(tier, weekStart, challenge_key)`, deterministic for the week
 * and unique per user, so the second insert is a duplicate and is swallowed
 * (`use-extras.ts:444`). Checked rather than assumed, because this is the one
 * place where a delete could turn into money.
 */
export function useDeleteWorkoutSession() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const invalidateToday = useInvalidateToday();
  return useMutation({
    mutationFn: async ({ id, date_time }: { id: string; date_time: string }) => {
      const { error } = await supabase
        .from('workout_sessions')
        .delete()
        .eq('id', id)
        .eq('user_id', user!.id);
      if (error) throw error;

      const day = localDateStr(new Date(date_time));
      await recomputeDailyLog(user!.id, day);

      /*
        And today as well, when the session was not today's.

        `recomputeDailyLog` rebuilds the day it is given, but two of its inputs
        are not about that day at all: `training_load_7d` and
        `training_load_28d` are windows anchored at `new Date()`
        (`daily-log-service.ts:29-32`), and they are what the acute:chronic
        ratio behind the readiness score is computed from. Removing a session
        from last Tuesday therefore changes *today's* readiness — and rebuilding
        only Tuesday would leave the Today screen showing a score derived from a
        session that no longer exists.

        Every day in between is left alone deliberately. Fixing those would mean
        up to fourteen rebuilds of eleven reads each, and a past day's readiness
        is already an artefact of when it happened to be computed rather than a
        fact about that day. That is a separate question. Leaving today wrong
        when one more call fixes it is not.
      */
      const todayStr = localDateStr();
      if (day !== todayStr) await recomputeDailyLog(user!.id, todayStr);
    },
    onSuccess: (_r, { date_time }) => {
      // Today's keys — the sessions list, the recent-workouts widget, readiness
      // history and the mascot counters all live in here.
      invalidateToday();
      // And the day that was actually rebuilt, which `useInvalidateToday` only
      // covers when the deleted session happened to be today's.
      qc.invalidateQueries({
        queryKey: ['daily_log', user?.id, localDateStr(new Date(date_time))],
      });
      // Progress is recounted on the next Today focus; this stops the number
      // already on screen from being served from cache in the meantime.
      qc.invalidateQueries({ queryKey: ['weekly-challenges'] });
    },
  });
}

/** One completed set, in kilograms, as it is stored on the session. */
export interface LoggedSet {
  exerciseId: string;
  exerciseName: string;
  weight: number;
  reps: number;
  rpe?: number | null;
}

/**
 * Write a finished workout — the only place in the app that does.
 *
 * ── why it is a hook and not two inserts ──
 *
 * Two screens finish a workout: the free-form log sheet, and the day view in
 * the week, where you tick sets off as you do them. The insert is the small
 * part. What follows it is not:
 *
 *   - `volume_load` is derived, and has to be derived the same way both times
 *   - `recomputeDailyLog` rebuilds the day, which is what readiness reads
 *   - Today's queries have to be invalidated or the page you return to still
 *     shows the workout as not done
 *
 * A second copy of that would work on the day it was written. It would then
 * quietly stop matching the first — a screen that inserts but forgets to
 * recompute produces a session that exists, appears in history, and leaves
 * readiness saying you did not train. Nothing errors, and the two screens
 * disagree about the same day.
 *
 * So there is one path, and a caller only has to say what was done.
 */
export function useLogWorkoutSession() {
  const { user } = useAuth();
  const invalidate = useInvalidateToday();
  return useMutation({
    mutationFn: async ({
      templateName,
      sessionRpe,
      sets,
    }: {
      templateName: string;
      sessionRpe: number;
      sets: LoggedSet[];
    }) => {
      if (!user) throw new Error('Not signed in');
      if (sets.length === 0) throw new Error('No sets');

      const { error } = await supabase.from('workout_sessions').insert({
        user_id: user.id,
        template_name: templateName.trim() || 'Workout',
        session_rpe: sessionRpe,
        sets: sets.map((s, i) => ({
          exerciseId: s.exerciseId,
          exerciseName: s.exerciseName.trim() || 'Exercise',
          setIndex: i + 1,
          // two decimals, so a 2.5-step weight cannot arrive as 82.50000000000001
          weight: Math.round(s.weight * 100) / 100,
          reps: s.reps,
          rpe: s.rpe && s.rpe >= 1 && s.rpe <= 10 ? s.rpe : null,
        })),
        volume_load: Math.round(sets.reduce((sum, s) => sum + s.weight * s.reps, 0)),
        pain_flags: [],
        pr_detected: false,
      });
      if (error) throw error;

      /*
        The session is stamped now, so the day it belongs to is today. Nothing
        here lets a caller pass a date — logging a workout you forgot to log
        needs a date field on the screen and a second recompute, and pretending
        otherwise would file it under the wrong day in silence.
      */
      await recomputeDailyLog(user.id, localDateStr());
    },
    onSuccess: () => invalidate(),
  });
}

export function useWorkoutSessions(days = 14) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['workout_sessions', user?.id, days],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workout_sessions')
        .select('id, date_time, template_name, session_rpe, volume_load')
        .eq('user_id', user!.id)
        .gte('date_time', daysAgoISO(days))
        .order('date_time', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useWeightHistory(days = 30) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['weight_history', user?.id, days],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('weight_logs')
        .select('date, weight_kg')
        .eq('user_id', user!.id)
        .gte('date', daysAgoISO(days).split('T')[0])
        .order('date', { ascending: true });
      if (error) throw error;
      return (data ?? []).map((d) => ({ date: d.date, value: Number(d.weight_kg) }));
    },
  });
}

/** Daily step counts over N days (from daily_logs) for the Steps screen */
export function useStepsHistory(days = 14) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['steps_history', user?.id, days],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('daily_logs')
        .select('date, steps')
        .eq('user_id', user!.id)
        .gte('date', daysAgoISO(days).split('T')[0])
        .order('date', { ascending: true });
      if (error) throw error;
      return (data ?? []).map((d) => ({ date: d.date as string, steps: Number(d.steps) || 0 }));
    },
  });
}

/** Full measurement history (web Progress → Measurements tab) */
export function useBodyMeasurements() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['body_measurements', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('body_measurements')
        .select('*')
        .eq('user_id', user!.id)
        .order('date', { ascending: true })
        .limit(90);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export interface BodyMeasurementInput {
  date: string;
  neck_cm?: number | null;
  shoulders_cm?: number | null;
  chest_cm?: number | null;
  waist_cm?: number | null;
  hips_cm?: number | null;
  bicep_left_cm?: number | null;
  bicep_right_cm?: number | null;
  thigh_left_cm?: number | null;
  thigh_right_cm?: number | null;
  calf_left_cm?: number | null;
  calf_right_cm?: number | null;
  body_fat_pct?: number | null;
  notes?: string;
}

export function useUpsertBodyMeasurement() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (m: BodyMeasurementInput) => {
      const { error } = await supabase
        .from('body_measurements')
        .upsert({ user_id: user!.id, ...m }, { onConflict: 'user_id,date' });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['body_measurements', user?.id] });
    },
  });
}

export function useReadinessHistory(days = 14) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['readiness_history', user?.id, days],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('daily_logs')
        .select('date, readiness_score, readiness_status')
        .eq('user_id', user!.id)
        .gte('date', daysAgoISO(days).split('T')[0])
        .not('readiness_score', 'is', null)
        .order('date', { ascending: true });
      if (error) throw error;
      return (data ?? []).map((d) => ({
        date: d.date,
        value: Number(d.readiness_score) || 0,
        status: (d.readiness_status as 'green' | 'yellow' | 'red') ?? 'yellow',
      }));
    },
  });
}
