import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';

import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './use-auth';

export function useAwards() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['awards', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('awards')
        .select('id, title, description, icon, tier, earned_at')
        .eq('user_id', user!.id)
        .order('earned_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Monday of the current week (same logic as the web app) */
function getWeekStart(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now.setDate(diff));
  return monday.toISOString().split('T')[0];
}

export function useWeeklyChallenges() {
  const { user } = useAuth();
  const weekStart = getWeekStart();
  return useQuery({
    queryKey: ['weekly-challenges', user?.id, weekStart],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('weekly_challenges')
        .select('id, title, description, icon, current_value, target_value, completed')
        .eq('user_id', user!.id)
        .eq('week_start', weekStart)
        .order('created_at');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useGroceryItems() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['grocery_items', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('grocery_items')
        .select('id, name, quantity, checked, category')
        .eq('user_id', user!.id)
        .order('checked')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useGroceryMutations() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['grocery_items', user?.id] });

  const add = useMutation({
    mutationFn: async (name: string) => {
      if (!user) throw new Error('Not signed in');
      const { error } = await supabase
        .from('grocery_items')
        .insert({ user_id: user.id, name, checked: false });
      if (error) throw error;
    },
    onSuccess: () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      invalidate();
    },
  });

  const toggle = useMutation({
    mutationFn: async ({ id, checked }: { id: string; checked: boolean }) => {
      const { error } = await supabase.from('grocery_items').update({ checked }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      Haptics.selectionAsync();
      invalidate();
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('grocery_items').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { add, toggle, remove };
}
