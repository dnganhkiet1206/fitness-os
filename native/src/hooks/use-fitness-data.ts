import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/integrations/supabase/client';
import { localDateStr } from '@/lib/local-date';
import { useAuth } from './use-auth';

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
