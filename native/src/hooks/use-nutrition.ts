import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/hooks/use-auth';
import { supabase } from '@/integrations/supabase/client';
import { localDateStr } from '@/lib/local-date';

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

/** The user's own manually-entered foods (the "My foods" card list) */
export function useMyFoods() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['my_foods', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from('food_items')
        .select('id, user_id, name, brand, kcal, protein_g, carbs_g, fat_g, fiber_g, serving_g, is_favorite')
        .eq('user_id', user!.id)
        .order('name')
        .limit(200);
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

/**
 * Hide shared seed rows that the user has cloned into their own list
 * (favoriting a seed clones it — see useToggleFavoriteFood), so searches
 * don't show the same food twice. RLS only returns own + NULL-user rows,
 * so a non-null user_id here always means "mine".
 */
export function dedupeSeedShadows<T extends { user_id?: string | null; name: string }>(rows: T[]): T[] {
  const ownNames = new Set(rows.filter((r) => r.user_id != null).map((r) => r.name.toLowerCase()));
  return rows.filter((r) => r.user_id != null || !ownNames.has(r.name.toLowerCase()));
}

function invalidateFoodQueries(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['favorite_foods'] });
  qc.invalidateQueries({ queryKey: ['my_foods'] });
  qc.invalidateQueries({ queryKey: ['nutrition_food_search'] });
  qc.invalidateQueries({ queryKey: ['mealplan_food_search'] });
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
      // Shared seed foods (user_id NULL) can't be updated under RLS — the
      // update silently matches 0 rows and the star never lights up.
      // Favoriting one instead clones it into the user's own list.
      const { data: row, error: readError } = await supabase
        .from('food_items')
        .select('user_id, name, brand, serving_g, kcal, protein_g, carbs_g, fat_g, fiber_g')
        .eq('id', id)
        .single();
      if (readError) throw readError;

      if (row.user_id === user!.id) {
        const { error } = await supabase.from('food_items').update({ is_favorite }).eq('id', id);
        if (error) throw error;
      } else if (is_favorite) {
        const { error } = await supabase.from('food_items').insert({
          user_id: user!.id,
          name: row.name,
          brand: row.brand,
          serving_g: row.serving_g,
          kcal: row.kcal,
          protein_g: row.protein_g,
          carbs_g: row.carbs_g,
          fat_g: row.fat_g,
          fiber_g: row.fiber_g,
          is_favorite: true,
        });
        if (error) throw error;
      }
      // Un-favoriting a seed row is a no-op: it was never favoritable
    },
    onSuccess: () => invalidateFoodQueries(queryClient),
  });
}

/* ── today's log ──────────────────────────────────────────────────────── */

export interface LoggedItem {
  id: string;
  food_name: string;
  servings: number;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export interface LoggedMeal {
  id: string;
  meal_type: string;
  at: string;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  items: LoggedItem[];
}

/**
 * What was eaten today, meal by meal, with the foods inside each one.
 *
 * Named `useTodayLog` and not `useTodayMeals` because that name is taken, by a
 * hook in `useTodayData.ts` that returns something different. Two exports with
 * one name in two files is a trap for whoever autocompletes next.
 *
 * `useTodayMeals` already reads today's `meal_entries`,
 * but only the entries — the totals that feed the rings. This is the other
 * half: the `meal_entry_items` rows that say *what* those totals were made of,
 * which is the thing the Nutrition tab was missing and the reason it read as a
 * food catalogue rather than as a food diary.
 *
 * Two queries rather than a join, because the client's row-level filters apply
 * per table and the item rows carry no date of their own — they are dated by
 * the entry they belong to. Fetching the entries first and then their items by
 * id keeps "today" defined in exactly one place.
 *
 * The stored numbers are per *logged serving*, already multiplied — see
 * `log-meal.tsx`, which writes `kcal * servings`. Nothing is divided back here:
 * a diary shows what was eaten, not what one portion of it would have been.
 */
export function useTodayLog() {
  const { user } = useAuth();
  const dateStr = localDateStr();
  return useQuery({
    queryKey: ['today_meals_detail', user?.id, dateStr],
    enabled: !!user,
    queryFn: async (): Promise<LoggedMeal[]> => {
      const { data: entries, error } = await supabase
        .from('meal_entries')
        .select('id, meal_type, date_time, total_kcal, total_protein_g, total_carbs_g, total_fat_g')
        .eq('user_id', user!.id)
        .gte('date_time', `${dateStr}T00:00:00`)
        .lt('date_time', `${dateStr}T23:59:59.999`)
        .order('date_time', { ascending: true });
      if (error) throw error;
      if (!entries || entries.length === 0) return [];

      const { data: items } = await supabase
        .from('meal_entry_items')
        .select('id, meal_entry_id, food_name, servings, kcal, protein_g, carbs_g, fat_g')
        .in('meal_entry_id', entries.map((e) => e.id));

      const byEntry = new Map<string, LoggedItem[]>();
      for (const it of items ?? []) {
        const list = byEntry.get(it.meal_entry_id) ?? [];
        list.push({
          id: it.id,
          food_name: it.food_name,
          servings: Number(it.servings) || 1,
          kcal: Math.round(Number(it.kcal) || 0),
          protein_g: Math.round(Number(it.protein_g) || 0),
          carbs_g: Math.round(Number(it.carbs_g) || 0),
          fat_g: Math.round(Number(it.fat_g) || 0),
        });
        byEntry.set(it.meal_entry_id, list);
      }

      return entries.map((e) => ({
        id: e.id,
        meal_type: e.meal_type,
        at: e.date_time,
        kcal: Math.round(Number(e.total_kcal) || 0),
        protein_g: Math.round(Number(e.total_protein_g) || 0),
        carbs_g: Math.round(Number(e.total_carbs_g) || 0),
        fat_g: Math.round(Number(e.total_fat_g) || 0),
        items: byEntry.get(e.id) ?? [],
      }));
    },
  });
}
