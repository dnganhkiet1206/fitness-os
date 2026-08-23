import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';

import { supabase } from '@/integrations/supabase/client';
import { confirmWrite } from '@/lib/write-result';
import { localDateStr, localDayRangeISO } from '@/lib/local-date';
import type { Json } from '@/integrations/supabase/types';
import { useAuth } from './use-auth';

const today = () => localDateStr();

/** Supplements with today's taken state (same shape as the web checklist) */
export function useSupplementChecklist() {
  const { user } = useAuth();
  const dateStr = today();
  return useQuery({
    queryKey: ['supplement_checklist', user?.id, dateStr],
    enabled: !!user,
    queryFn: async () => {
      const { data: supplements, error: supErr } = await supabase
        .from('supplements')
        .select('id, name, dose_text, timing, category')
        .eq('user_id', user!.id)
        .order('timing');
      if (supErr) throw supErr;
      const { data: intakes } = await supabase
        .from('supplement_intake_logs')
        .select('supplement_id, taken')
        .eq('user_id', user!.id)
        .gte('date_time', localDayRangeISO(dateStr).start)
        .lt('date_time', localDayRangeISO(dateStr).end);
      const takenIds = new Set((intakes ?? []).filter((i) => i.taken).map((i) => i.supplement_id));
      return (supplements ?? []).map((s) => ({ ...s, taken: takenIds.has(s.id) }));
    },
  });
}

export function useToggleSupplement() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ supplementId, taken }: { supplementId: string; taken: boolean }) => {
      /*
        ── read here, in the tap, not in the render ──

        This was `const dateStr = today()` in the hook body, which runs when the
        component renders. The app gets left open; a phone showing the
        supplements list at eleven at night is still showing it at ten past
        midnight, and the range below is what decides **which day's row gets
        deleted**.

        So un-ticking a supplement after midnight looked for today's entry
        inside yesterday's window: today's tick survived, and if yesterday had
        one it was removed instead. The checkbox bounced back and a day that was
        already finished quietly lost an entry.
      */
      const dateStr = today();
      if (taken) {
        const { error } = await supabase.from('supplement_intake_logs').insert({
          user_id: user!.id,
          supplement_id: supplementId,
          taken: true,
          /* Stamped here rather than left to the column default. It changes
             nothing while this write is online — which it always is, see below
             — but it is the honest value and costs nothing. */
          date_time: new Date().toISOString(),
        });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('supplement_intake_logs')
          .delete()
          .eq('user_id', user!.id)
          .eq('supplement_id', supplementId)
          .gte('date_time', localDayRangeISO(dateStr).start)
          .lt('date_time', localDayRangeISO(dateStr).end);
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

/** Add a supplement to the user's stack (port of the web useAddSupplement) */
export function useAddSupplement() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (sup: { name: string; category: string; dose_text: string; timing: string }) => {
      const { error } = await supabase.from('supplements').insert({
        user_id: user!.id,
        name: sup.name,
        category: sup.category,
        dose_text: sup.dose_text,
        timing: sup.timing,
        notes: '',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ['supplement_checklist'] });
    },
  });
}

export function useDeleteSupplement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await confirmWrite(
        supabase.from('supplements').delete().eq('id', id),
        'Không xoá được thực phẩm bổ sung này',
      );
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['supplement_checklist'] }),
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
        /* `exercise_kind` is what tells the trend engine whether an estimated
           one-rep-max means anything for this movement — a curl's is a category
           error, a squat's is not. See `lib/exercise-kind.ts`. */
        .select('id, user_id, name, muscle_group, equipment, exercise_kind')
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
      await confirmWrite(
        supabase.from('exercises').delete().eq('id', id).eq('user_id', user!.id),
        'Không xoá được bài tập này',
      );
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
    mutationFn: async (ex: {
      name: string;
      muscle_group: string;
      equipment?: string;
      /**
       * What kind of movement it is, which decides what the trend engine reads
       * for it — see `lib/exercise-kind.ts`. Optional, and `undefined` is a real
       * answer: it means nobody has said, and the engine infers. What it must
       * never be is a default, because a default is a claim.
       */
      exercise_kind?: string;
    }) => {
      const { data, error } = await supabase
        .from('exercises')
        .insert({ ...ex, user_id: user!.id })
        .select('id, name, muscle_group, equipment, exercise_kind')
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
      await confirmWrite(
        supabase.from('workout_templates')
          .delete()
          .eq('id', id)
          .eq('user_id', user!.id),
        'Không xoá được mẫu tập này',
      );
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
        // `created_at` is what the Workouts tab sorts on — it shows the three
        // you made most recently, and a routine you wrote this morning being
        // filed under "A" is not a reason to see it first. The order below
        // stays alphabetical because the routine planner's picker reads this
        // same query and a picker is a list you scan by name.
        .select('id, name, type, exercises, created_at')
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
      await confirmWrite(
        supabase.from('meal_plans')
          .delete()
          .eq('id', id)
          .eq('user_id', user!.id),
        'Không xoá được thực đơn này',
      );
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
      /*
        Every column a planned food carries, not just the two the old list
        showed.

        This select was written for a card that printed a name and a calorie
        count, and it stayed that way when "Log to today" started reading the
        same rows and writing them into the diary. `PlannedFood` had every field
        optional, so handing it these rows typechecked — and carbs and fat
        arrived as `undefined`, became 0, and were written as 0. The meal landed
        in the diary with its name and its calories and none of its macros, and
        the only visible symptom was two bars on the Nutrition tab that did not
        move.

        `serving_g` and `food_item_id` were missing for the same reason and cost
        the link back to the food they came from.
      */
      const { data, error } = await supabase
        .from('meal_plan_items')
        .select('id, day_index, meal_type, food_name, serving_g, kcal, protein_g, carbs_g, fat_g, food_item_id')
        .eq('meal_plan_id', planId!)
        .order('day_index')
        .order('meal_type');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export interface MealPlanItemInput {
  meal_plan_id: string;
  day_index: number;
  meal_type: string;
  food_name: string;
  serving_g: number;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  food_item_id?: string | null;
}

/** Add a food to a meal plan (port of the web useAddMealPlanItem) */
export function useAddMealPlanItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (item: MealPlanItemInput) => {
      const { error } = await supabase.from('meal_plan_items').insert(item);
      if (error) throw error;
    },
    onSuccess: (_data, item) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      queryClient.invalidateQueries({ queryKey: ['meal_plan_items', item.meal_plan_id] });
    },
  });
}

export function useDeleteMealPlanItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; planId: string }) => {
      await confirmWrite(
        supabase.from('meal_plan_items').delete().eq('id', id),
        'Không xoá được món trong thực đơn',
      );
    },
    onSuccess: (_data, { planId }) => {
      queryClient.invalidateQueries({ queryKey: ['meal_plan_items', planId] });
    },
  });
}
