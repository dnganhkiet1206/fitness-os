import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export function useStepsHistory(days = 14) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['steps-history', user?.id, days],
    enabled: !!user,
    queryFn: async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      const { data, error } = await supabase
        .from('daily_logs')
        .select('date, steps')
        .eq('user_id', user!.id)
        .gte('date', startDate.toISOString().split('T')[0])
        .order('date', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useTodaySteps() {
  const { user } = useAuth();
  const dateStr = new Date().toISOString().split('T')[0];
  return useQuery({
    queryKey: ['steps-today', user?.id, dateStr],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('daily_logs')
        .select('steps')
        .eq('user_id', user!.id)
        .eq('date', dateStr)
        .maybeSingle();
      if (error) throw error;
      return data?.steps ?? 0;
    },
  });
}
