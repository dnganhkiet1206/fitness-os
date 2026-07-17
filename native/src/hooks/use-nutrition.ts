import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/hooks/use-auth';
import { supabase } from '@/integrations/supabase/client';

export interface FoodItemRow {
  id: string;
  user_id?: string | null;
  name: string;
  brand: string | null;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  serving_g: number;
  is_favorite: boolean;
}

/** Favorite foods — quick-add chips at the top of the meal builder */
export function useFavoriteFoods() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['favorite_foods', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from('food_items')
        .select('id, user_id, name, brand, kcal, protein_g, carbs_g, fat_g, fiber_g, serving_g, is_favorite')
        .eq('is_favorite', true)
        .order('name')
        .limit(50);
      return (data ?? []) as FoodItemRow[];
    },
  });
}

export interface RecentFood {
  food_name: string;
  food_item_id: string | null;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  serving_g: number;
}

/** Recently logged foods, de-duplicated by name — fastest re-log path */
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
        .limit(30);
      const seen = new Set<string>();
      const out: RecentFood[] = [];
      for (const f of data ?? []) {
        if (seen.has(f.food_name)) continue;
        seen.add(f.food_name);
        // Stored values are per-logged-serving; divide back to a single serving
        const s = Number(f.servings) || 1;
        out.push({
          food_name: f.food_name,
          food_item_id: f.food_item_id,
          kcal: Math.round(Number(f.kcal) / s),
          protein_g: Math.round(Number(f.protein_g) / s),
          carbs_g: Math.round(Number(f.carbs_g) / s),
          fat_g: Math.round(Number(f.fat_g) / s),
          fiber_g: Math.round(Number(f.fiber_g || 0) / s),
          serving_g: 0,
        });
        if (out.length >= 12) break;
      }
      return out;
    },
  });
}

export interface FoodFormData {
  name: string;
  brand: string;
  serving_g: number;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
}

function invalidateFoodQueries(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['favorite_foods'] });
  qc.invalidateQueries({ queryKey: ['nutrition_food_search'] });
  qc.invalidateQueries({ queryKey: ['food_items_search'] });
  qc.invalidateQueries({ queryKey: ['food_item'] });
}

/** Single food row for the editor sheet (edit mode) */
export function useFoodItem(id: string | null) {
  return useQuery({
    queryKey: ['food_item', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('food_items')
        .select('id, user_id, name, brand, kcal, protein_g, carbs_g, fat_g, fiber_g, serving_g, is_favorite')
        .eq('id', id!)
        .single();
      if (error) throw error;
      return data as FoodItemRow;
    },
  });
}

export function useCreateFoodItem() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (item: FoodFormData) => {
      const { error } = await supabase.from('food_items').insert({ ...item, user_id: user!.id });
      if (error) throw error;
    },
    onSuccess: () => invalidateFoodQueries(qc),
  });
}

export function useUpdateFoodItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...item }: FoodFormData & { id: string }) => {
      const { error } = await supabase.from('food_items').update(item).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => invalidateFoodQueries(qc),
  });
}

export function useDeleteFoodItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('food_items').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => invalidateFoodQueries(qc),
  });
}

export function useToggleFavoriteFood() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ id, is_favorite }: { id: string; is_favorite: boolean }) => {
      const { error } = await supabase.from('food_items').update({ is_favorite }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['favorite_foods', user?.id] });
    },
  });
}
