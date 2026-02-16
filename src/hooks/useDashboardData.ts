import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

const today = () => new Date().toISOString().split('T')[0];

// ---- Supplement checklist for today ----
export function useTodaySupplementChecklist() {
  const { user } = useAuth();
  const dateStr = today();
  return useQuery({
    queryKey: ['supplement_checklist', user?.id, dateStr],
    enabled: !!user,
    queryFn: async () => {
      const { data: supplements } = await supabase
        .from('supplements')
        .select('*')
        .eq('user_id', user!.id)
        .order('timing');

      const { data: intakes } = await supabase
        .from('supplement_intake_logs')
        .select('supplement_id, taken')
        .eq('user_id', user!.id)
        .gte('date_time', `${dateStr}T00:00:00`)
        .lt('date_time', `${dateStr}T23:59:59.999`);

      const takenIds = new Set((intakes ?? []).filter(i => i.taken).map(i => i.supplement_id));

      return (supplements ?? []).map(s => ({
        id: s.id,
        name: s.name,
        dose_text: s.dose_text,
        timing: s.timing,
        category: s.category,
        taken: takenIds.has(s.id),
      }));
    },
  });
}

export function useToggleSupplement() {
  const { user } = useAuth();
  const qc = useQueryClient();
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
      qc.invalidateQueries({ queryKey: ['supplement_checklist'] });
      qc.invalidateQueries({ queryKey: ['daily_log'] });
    },
  });
}

// ---- Weight check-in ----
export function useTodayWeight() {
  const { user } = useAuth();
  const dateStr = today();
  return useQuery({
    queryKey: ['weight_log', user?.id, dateStr],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from('weight_logs')
        .select('*')
        .eq('user_id', user!.id)
        .eq('date', dateStr)
        .maybeSingle();
      return data;
    },
  });
}

export function useLogWeight() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ weight_kg, notes }: { weight_kg: number; notes?: string }) => {
      const dateStr = today();
      const { error } = await supabase.from('weight_logs').upsert({
        user_id: user!.id,
        date: dateStr,
        weight_kg,
        notes: notes || '',
      }, { onConflict: 'user_id,date' });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['weight_log'] }),
  });
}

export function useWeightHistory() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['weight_history', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from('weight_logs')
        .select('*')
        .eq('user_id', user!.id)
        .order('date', { ascending: true })
        .limit(90);
      return data ?? [];
    },
  });
}

// ---- Food items with favorites + recent ----
export function useFoodSearch(search: string, enabled: boolean) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['food_search', user?.id, search],
    enabled: enabled && !!user,
    queryFn: async () => {
      let query = supabase.from('food_items').select('*').order('is_favorite', { ascending: false }).order('name');
      if (search) query = query.ilike('name', `%${search}%`);
      const { data } = await query.limit(30);
      return data ?? [];
    },
  });
}

export function useFavoriteFoods() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['favorite_foods', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from('food_items')
        .select('*')
        .eq('is_favorite', true)
        .order('name')
        .limit(50);
      return data ?? [];
    },
  });
}

export function useRecentFoods() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['recent_foods', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from('meal_entry_items')
        .select('food_name, food_item_id, kcal, protein_g, carbs_g, fat_g, fiber_g, servings, created_at')
        .order('created_at', { ascending: false })
        .limit(20);
      // Deduplicate by food_name
      const seen = new Set<string>();
      return (data ?? []).filter(f => {
        if (seen.has(f.food_name)) return false;
        seen.add(f.food_name);
        return true;
      }).slice(0, 10);
    },
  });
}

export function useToggleFavoriteFood() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, is_favorite }: { id: string; is_favorite: boolean }) => {
      const { error } = await supabase.from('food_items').update({ is_favorite }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['food_search'] });
      qc.invalidateQueries({ queryKey: ['favorite_foods'] });
    },
  });
}

export function useCreateFoodItem() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (item: {
      name: string; brand?: string; serving_g: number;
      kcal: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g: number;
    }) => {
      const { error } = await supabase.from('food_items').insert({ ...item, user_id: user!.id });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['food_search'] });
      qc.invalidateQueries({ queryKey: ['favorite_foods'] });
    },
  });
}

export function useUpdateFoodItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...item }: {
      id: string; name: string; brand?: string; serving_g: number;
      kcal: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g: number;
    }) => {
      const { error } = await supabase.from('food_items').update(item).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['food_search'] });
      qc.invalidateQueries({ queryKey: ['favorite_foods'] });
    },
  });
}

export function useDeleteFoodItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('food_items').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['food_search'] });
      qc.invalidateQueries({ queryKey: ['favorite_foods'] });
    },
  });
}

// ---- Meal Plans ----
export function useMealPlans() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['meal_plans', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from('meal_plans')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false });
      return data ?? [];
    },
  });
}

export function useMealPlanItems(planId: string | null) {
  return useQuery({
    queryKey: ['meal_plan_items', planId],
    enabled: !!planId,
    queryFn: async () => {
      const { data } = await supabase
        .from('meal_plan_items')
        .select('*')
        .eq('meal_plan_id', planId!)
        .order('day_index')
        .order('meal_type');
      return data ?? [];
    },
  });
}

export function useCreateMealPlan() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (plan: { name: string; goal: string; meals_per_day: number; start_date?: string; end_date?: string }) => {
      const { data, error } = await supabase.from('meal_plans').insert({
        user_id: user!.id,
        ...plan,
      }).select('id').single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['meal_plans'] }),
  });
}

export function useAddMealPlanItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (item: {
      meal_plan_id: string; day_index: number; meal_type: string;
      food_name: string; serving_g: number; kcal: number;
      protein_g: number; carbs_g: number; fat_g: number; food_item_id?: string;
    }) => {
      const { error } = await supabase.from('meal_plan_items').insert(item);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['meal_plan_items'] }),
  });
}

export function useDeleteMealPlanItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('meal_plan_items').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['meal_plan_items'] }),
  });
}

export function useDeleteMealPlan() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('meal_plans').delete().eq('id', id).eq('user_id', user!.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['meal_plans'] }),
  });
}
