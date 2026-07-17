import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';

import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './use-auth';

const today = () => new Date().toISOString().split('T')[0];

export function useTodayWater() {
  const { user } = useAuth();
  const dateStr = today();
  return useQuery({
    queryKey: ['today_water', user?.id, dateStr],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('water_logs')
        .select('amount_ml')
        .eq('user_id', user!.id)
        .eq('date', dateStr);
      if (error) throw error;
      return (data ?? []).reduce((sum, r) => sum + Number(r.amount_ml), 0);
    },
  });
}

export function useAddWater() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const dateStr = today();
  return useMutation({
    mutationFn: async (amountMl: number) => {
      if (!user) throw new Error('Not signed in');
      const { error } = await supabase.from('water_logs').insert({
        user_id: user.id,
        amount_ml: amountMl,
        date: dateStr,
        logged_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      queryClient.invalidateQueries({ queryKey: ['today_water', user?.id, dateStr] });
      queryClient.invalidateQueries({ queryKey: ['today_water_logs', user?.id, dateStr] });
      queryClient.invalidateQueries({ queryKey: ['water_week', user?.id] });
    },
  });
}

/** Undo the most recent water entry today (web: minus button) */
export function useRemoveLastWater() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const dateStr = today();
  return useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not signed in');
      const { data: last, error: findError } = await supabase
        .from('water_logs')
        .select('id')
        .eq('user_id', user.id)
        .eq('date', dateStr)
        .order('logged_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (findError) throw findError;
      if (!last) return;
      const { error } = await supabase.from('water_logs').delete().eq('id', last.id);
      if (error) throw error;
    },
    onSuccess: () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      queryClient.invalidateQueries({ queryKey: ['today_water', user?.id, dateStr] });
      queryClient.invalidateQueries({ queryKey: ['today_water_logs', user?.id, dateStr] });
      queryClient.invalidateQueries({ queryKey: ['water_week', user?.id] });
    },
  });
}

/** Today's individual water entries — the detail list on the Water screen */
export function useTodayWaterLogs() {
  const { user } = useAuth();
  const dateStr = today();
  return useQuery({
    queryKey: ['today_water_logs', user?.id, dateStr],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('water_logs')
        .select('id, amount_ml, logged_at')
        .eq('user_id', user!.id)
        .eq('date', dateStr)
        .order('logged_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Daily water totals over the last 7 days for the trend chart */
export function useWaterWeek() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['water_week', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const from = new Date();
      from.setDate(from.getDate() - 6);
      const fromStr = from.toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('water_logs')
        .select('date, amount_ml')
        .eq('user_id', user!.id)
        .gte('date', fromStr);
      if (error) throw error;
      const byDate = new Map<string, number>();
      for (const r of data ?? []) {
        byDate.set(r.date, (byDate.get(r.date) ?? 0) + Number(r.amount_ml));
      }
      const days: { date: string; total: number }[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toISOString().split('T')[0];
        days.push({ date: key, total: byDate.get(key) ?? 0 });
      }
      return days;
    },
  });
}
