import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './use-auth';

function daysAgoISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
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

/** Latest body-measurement row (web Progress → Measurements tab) */
export function useLatestMeasurement() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['body_measurements_latest', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from('body_measurements')
        .select('*')
        .eq('user_id', user!.id)
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
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
