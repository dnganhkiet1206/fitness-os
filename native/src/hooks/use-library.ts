import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';

import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './use-auth';

const today = () => new Date().toISOString().split('T')[0];

/** Supplements with today's taken state (same shape as the web checklist) */
export function useSupplementChecklist() {
  const { user } = useAuth();
  const dateStr = today();
  return useQuery({
    queryKey: ['supplement_checklist', user?.id, dateStr],
    enabled: !!user,
    queryFn: async () => {
      const { data: supplements } = await supabase
        .from('supplements')
        .select('id, name, dose_text, timing, category')
        .eq('user_id', user!.id)
        .order('timing');
      const { data: intakes } = await supabase
        .from('supplement_intake_logs')
        .select('supplement_id, taken')
        .eq('user_id', user!.id)
        .gte('date_time', `${dateStr}T00:00:00`)
        .lt('date_time', `${dateStr}T23:59:59.999`);
      const takenIds = new Set((intakes ?? []).filter((i) => i.taken).map((i) => i.supplement_id));
      return (supplements ?? []).map((s) => ({ ...s, taken: takenIds.has(s.id) }));
    },
  });
}

export function useToggleSupplement() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const dateStr = today();
  return useMutation({
    mutationFn: async ({ supplementId, taken }: { supplementId: string; taken: boolean }) => {
      if (taken) {
        const { error } = await supabase.from('supplement_intake_logs').insert({
          user_id: user!.id,
          supplement_id: supplementId,
          taken: true,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('supplement_intake_logs')
          .delete()
          .eq('user_id', user!.id)
          .eq('supplement_id', supplementId)
          .gte('date_time', `${dateStr}T00:00:00`)
          .lt('date_time', `${dateStr}T23:59:59.999`);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      Haptics.selectionAsync();
      queryClient.invalidateQueries({ queryKey: ['supplement_checklist'] });
      queryClient.invalidateQueries({ queryKey: ['daily_log'] });
    },
  });
}

export function useExercises() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['exercises', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('exercises')
        .select('id, name, muscle_group, equipment')
        .eq('user_id', user!.id)
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useRoutineDays() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['routine_days', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('routine_days')
        .select('id, day_of_week, is_rest, is_deload, notes, template_id')
        .eq('user_id', user!.id)
        .order('day_of_week');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useWorkoutTemplateNames() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['workout_template_names', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workout_templates')
        .select('id, name')
        .eq('user_id', user!.id);
      if (error) throw error;
      return new Map((data ?? []).map((t) => [t.id, t.name]));
    },
  });
}

export function useMealPlans() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['meal_plans', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('meal_plans')
        .select('id, name, goal, meals_per_day, start_date, end_date')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useMealPlanItems(planId: string | null) {
  return useQuery({
    queryKey: ['meal_plan_items', planId],
    enabled: !!planId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('meal_plan_items')
        .select('id, day_index, meal_type, food_name, kcal, protein_g')
        .eq('meal_plan_id', planId!)
        .order('day_index')
        .order('meal_type');
      if (error) throw error;
      return data ?? [];
    },
  });
}
