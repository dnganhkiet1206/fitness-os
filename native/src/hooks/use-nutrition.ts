import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/hooks/use-auth';
import { supabase } from '@/integrations/supabase/client';
import { recomputeDailyLog } from '@/lib/daily-log-service';
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
  /**
   * The `meal_entries` row this food belongs to.
   *
   * Carried on the item because the diary merges meals of the same type into
   * one card, so by the time a row is on screen it has been separated from the
   * entry it came from — and editing or deleting it has to re-total that entry,
   * not whichever one the card happens to be grouped under.
   */
  entry_id: string;
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

  /**
   * The local day, as two absolute instants.
   *
   * `date_time` is a `timestamptz`, and a bare `2026-07-31T00:00:00` sent
   * against one is read in the *server's* zone — UTC. At UTC+7 that window is
   * 07:00 today to 07:00 tomorrow in local terms, so anything eaten before
   * seven in the morning lands in yesterday and a breakfast logged at six never
   * appears. `setHours(0,0,0,0)` then `toISOString()` gives the real instants
   * either side of the local day, whatever the zone.
   *
   * The rest of the app still compares date strings this way — `useTodayMeals`,
   * `useTodaySleep`, `useTodayBiometrics`. They have the same edge and are not
   * touched here; that is a change to make deliberately rather than as a side
   * effect of adding a diary.
   */
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + 1);

  return useQuery({
    queryKey: ['today_meals_detail', user?.id, dateStr],
    enabled: !!user,
    queryFn: async (): Promise<LoggedMeal[]> => {
      const { data: entries, error } = await supabase
        .from('meal_entries')
        .select('id, meal_type, date_time, total_kcal, total_protein_g, total_carbs_g, total_fat_g')
        .eq('user_id', user!.id)
        .gte('date_time', from.toISOString())
        .lt('date_time', to.toISOString())
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
          entry_id: it.meal_entry_id,
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

/* ── editing what is already logged ───────────────────────────────────── */

/**
 * Re-total one meal entry from the item rows it still has, and delete it if it
 * has none left.
 *
 * Both mutations below need this and neither can skip it. `daily_logs` — which
 * is what the calorie ring and every macro tile read — is rebuilt from
 * `meal_entries.total_*`, not from the items. Change an item without changing
 * its parent's totals and the diary and the ring disagree about the same food:
 * the row is gone from the list and its calories are still in the ring, which
 * looks like the delete silently failed.
 *
 * The totals are re-read from the database rather than adjusted by the delta
 * the caller happens to know. A subtraction is only right if the number it
 * starts from was right, and this is the one place that can establish that for
 * itself. It costs one extra round trip on an operation a user does a few times
 * a day.
 *
 * An entry with no items is removed rather than zeroed. A `meal_entries` row is
 * the meal; a meal with nothing in it is not an empty meal, it is a meal that
 * did not happen, and leaving it behind puts a "Breakfast · 0 kcal" card in the
 * diary that nothing can clear.
 */
async function resyncMealEntry(entryId: string) {
  const { data: rest, error } = await supabase
    .from('meal_entry_items')
    .select('kcal, protein_g, carbs_g, fat_g, fiber_g')
    .eq('meal_entry_id', entryId);
  if (error) throw error;

  if (!rest || rest.length === 0) {
    const { error: delError } = await supabase.from('meal_entries').delete().eq('id', entryId);
    if (delError) throw delError;
    return;
  }

  const sum = (k: 'kcal' | 'protein_g' | 'carbs_g' | 'fat_g' | 'fiber_g') =>
    Math.round(rest.reduce((s, r) => s + (Number(r[k]) || 0), 0));

  const { error: upError } = await supabase
    .from('meal_entries')
    .update({
      total_kcal: sum('kcal'),
      total_protein_g: sum('protein_g'),
      total_carbs_g: sum('carbs_g'),
      total_fat_g: sum('fat_g'),
      total_fiber_g: sum('fiber_g'),
    })
    .eq('id', entryId);
  if (upError) throw upError;
}

/** Remove one logged food from today's diary. */
export function useDeleteMealItem() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ itemId, entryId }: { itemId: string; entryId: string }) => {
      const { error } = await supabase.from('meal_entry_items').delete().eq('id', itemId);
      if (error) throw error;
      await resyncMealEntry(entryId);
      await recomputeDailyLog(user!.id, localDateStr());
    },
    onSuccess: () => invalidateLogQueries(qc, user?.id),
  });
}

/**
 * Change how many servings of a logged food were eaten.
 *
 * The stored numbers are per *logged serving* — `log-meal.tsx` writes
 * `kcal * servings` — so there is no per-serving figure on the row to multiply
 * by the new count. Everything is scaled by the ratio between the new count and
 * the old one instead, which is the same arithmetic and needs nothing the row
 * does not already carry.
 *
 * `fiber_g` is scaled along with the rest even though the diary never shows it:
 * the daily log totals it, and a macro that only some code paths maintain is a
 * macro that drifts.
 */
export function useUpdateMealItemServings() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      itemId,
      entryId,
      servings,
    }: {
      itemId: string;
      entryId: string;
      servings: number;
    }) => {
      const { data: row, error: readError } = await supabase
        .from('meal_entry_items')
        .select('servings, kcal, protein_g, carbs_g, fat_g, fiber_g')
        .eq('id', itemId)
        .single();
      if (readError) throw readError;

      const was = Number(row.servings) || 1;
      const k = servings / was;
      const { error } = await supabase
        .from('meal_entry_items')
        .update({
          servings,
          kcal: Math.round((Number(row.kcal) || 0) * k),
          protein_g: Math.round((Number(row.protein_g) || 0) * k),
          carbs_g: Math.round((Number(row.carbs_g) || 0) * k),
          fat_g: Math.round((Number(row.fat_g) || 0) * k),
          fiber_g: Math.round((Number(row.fiber_g) || 0) * k),
        })
        .eq('id', itemId);
      if (error) throw error;

      await resyncMealEntry(entryId);
      await recomputeDailyLog(user!.id, localDateStr());
    },
    onSuccess: () => invalidateLogQueries(qc, user?.id),
  });
}

/**
 * Everything that changes when a logged food does.
 *
 * `useInvalidateToday` is a hook and cannot be called from inside a mutation's
 * callback, so the keys it shares are repeated here. They are the same keys —
 * if one list grows a member the other has to as well, which is exactly how the
 * diary came to not refresh after a meal was logged.
 */
function invalidateLogQueries(qc: ReturnType<typeof useQueryClient>, userId?: string) {
  const dateStr = localDateStr();
  qc.invalidateQueries({ queryKey: ['today_meals_detail', userId, dateStr] });
  qc.invalidateQueries({ queryKey: ['today_meals', userId, dateStr] });
  qc.invalidateQueries({ queryKey: ['daily_log', userId, dateStr] });
  qc.invalidateQueries({ queryKey: ['readiness_history', userId] });
  qc.invalidateQueries({ queryKey: ['recent_foods', userId] });
}
