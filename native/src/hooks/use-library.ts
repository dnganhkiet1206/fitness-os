import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';

import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
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
      // Seed exercises have user_id NULL and are visible to everyone (web parity)
      const { data, error } = await supabase
        .from('exercises')
        .select('id, user_id, name, muscle_group, equipment')
        .or(`user_id.is.null,user_id.eq.${user!.id}`)
        .order('muscle_group')
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useDeleteExercise() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('exercises').delete().eq('id', id).eq('user_id', user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exercises', user?.id] });
    },
  });
}

export function useAddExercise() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ex: { name: string; muscle_group: string; equipment?: string }) => {
      const { data, error } = await supabase
        .from('exercises')
        .insert({ ...ex, user_id: user!.id })
        .select('id, name, muscle_group, equipment')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      Haptics.selectionAsync();
      queryClient.invalidateQueries({ queryKey: ['exercises', user?.id] });
    },
  });
}

export interface TemplateExercise {
  exerciseId: string;
  exerciseName: string;
  sets: number;
  reps: number;
  weight: number;
  rpe?: number;
  restSeconds?: number;
}

export function useAddWorkoutTemplate() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (tpl: { name: string; type: string; exercises: TemplateExercise[] }) => {
      const { error } = await supabase.from('workout_templates').insert({
        user_id: user!.id,
        name: tpl.name,
        type: tpl.type || 'custom',
        exercises: tpl.exercises as unknown as Json,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ['workout_templates', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['workout_template_names', user?.id] });
    },
  });
}

export function useDeleteWorkoutTemplate() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('workout_templates')
        .delete()
        .eq('id', id)
        .eq('user_id', user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workout_templates', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['workout_template_names', user?.id] });
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

/** Full workout templates for the routine planner picker */
export function useWorkoutTemplates() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['workout_templates', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workout_templates')
        .select('id, name, type, exercises')
        .eq('user_id', user!.id)
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Assign / clear a routine day — same upsert contract as the web app */
export function useUpsertRoutineDay() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (day: {
      day_of_week: number;
      template_id?: string | null;
      is_rest?: boolean;
      is_deload?: boolean;
    }) => {
      const { error } = await supabase
        .from('routine_days')
        .upsert({ user_id: user!.id, ...day }, { onConflict: 'user_id,day_of_week' });
      if (error) throw error;
    },
    onSuccess: () => {
      Haptics.selectionAsync();
      queryClient.invalidateQueries({ queryKey: ['routine_days', user?.id] });
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

export function useCreateMealPlan() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (plan: { name: string; goal: string; meals_per_day: number }) => {
      const { data, error } = await supabase
        .from('meal_plans')
        .insert({ user_id: user!.id, ...plan })
        .select('id')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ['meal_plans', user?.id] });
    },
  });
}

export function useDeleteMealPlan() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('meal_plans')
        .delete()
        .eq('id', id)
        .eq('user_id', user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meal_plans', user?.id] });
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
