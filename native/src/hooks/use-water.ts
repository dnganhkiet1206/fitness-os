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
    },
  });
}
