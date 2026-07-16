import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './use-auth';

function daysAgoISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
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
