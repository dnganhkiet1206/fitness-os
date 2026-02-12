import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

// ---- Exercises ----
export function useExercises() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['exercises', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from('exercises')
        .select('*')
        .or(`user_id.is.null,user_id.eq.${user!.id}`)
        .order('muscle_group')
        .order('name');
      return data ?? [];
    },
  });
}

export function useAddExercise() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ex: { name: string; muscle_group: string; equipment?: string; form_cues?: string[]; common_mistakes?: string[]; video_url?: string }) => {
      const { error } = await supabase.from('exercises').insert({ ...ex, user_id: user!.id });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['exercises'] }),
  });
}

export function useDeleteExercise() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('exercises').delete().eq('id', id).eq('user_id', user!.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['exercises'] }),
  });
}

// ---- Workout Templates ----
export function useWorkoutTemplates() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['workout_templates', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from('workout_templates')
        .select('*')
        .eq('user_id', user!.id)
        .order('name');
      return data ?? [];
    },
  });
}

export function useAddWorkoutTemplate() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (t: { name: string; type?: string; exercises: any[] }) => {
      const { data, error } = await supabase.from('workout_templates').insert({
        user_id: user!.id,
        name: t.name,
        type: t.type || 'custom',
        exercises: t.exercises,
      }).select('id').single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workout_templates'] }),
  });
}

export function useUpdateWorkoutTemplate() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...fields }: { id: string; name?: string; type?: string; exercises?: any[] }) => {
      const { error } = await supabase.from('workout_templates').update(fields).eq('id', id).eq('user_id', user!.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workout_templates'] }),
  });
}

export function useDeleteWorkoutTemplate() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('workout_templates').delete().eq('id', id).eq('user_id', user!.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workout_templates'] }),
  });
}

// ---- Routine Days ----
export function useRoutineDays() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['routine_days', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from('routine_days')
        .select('*, workout_templates(name, type)')
        .eq('user_id', user!.id)
        .order('day_of_week');
      return data ?? [];
    },
  });
}

export function useUpsertRoutineDay() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (day: { day_of_week: number; template_id?: string | null; is_rest?: boolean; is_deload?: boolean; notes?: string }) => {
      const { error } = await supabase.from('routine_days').upsert({
        user_id: user!.id,
        ...day,
      }, { onConflict: 'user_id,day_of_week' });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['routine_days'] }),
  });
}

// ---- Supplement Adherence ----
export function useSupplementAdherence(days: number = 30) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['supplement_adherence', user?.id, days],
    enabled: !!user,
    queryFn: async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      
      const { data: supplements } = await supabase
        .from('supplements')
        .select('id')
        .eq('user_id', user!.id);
      
      const totalPlanned = (supplements?.length ?? 0) * days;
      if (totalPlanned === 0) return { rate: 0, taken: 0, planned: totalPlanned };
      
      const { data: intakes } = await supabase
        .from('supplement_intake_logs')
        .select('id')
        .eq('user_id', user!.id)
        .eq('taken', true)
        .gte('date_time', startDate.toISOString());
      
      const taken = intakes?.length ?? 0;
      return { rate: Math.round((taken / totalPlanned) * 100), taken, planned: totalPlanned };
    },
  });
}
