import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useAuth } from '@/hooks/use-auth';
import { supabase } from '@/integrations/supabase/client';
import { recomputeDailyLog } from '@/lib/daily-log-service';
import { todayKeys } from '@/lib/today-keys';
import { localDateStr } from '@/lib/local-date';
import { offlineNow } from '@/lib/offline';
import { foldRecentMeals } from '@/lib/recent-meals';
export type { RecentMeal, RepeatFood } from '@/lib/recent-meals';

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
      const { data, error } = await supabase
        .from('food_items')
        .select('id, user_id, name, brand, kcal, protein_g, carbs_g, fat_g, fiber_g, serving_g, is_favorite')
        .eq('is_favorite', true)
        .order('name')
        .limit(50);
      if (error) throw error;
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
      const { data, error } = await supabase
        .from('food_items')
        .select('id, user_id, name, brand, kcal, protein_g, carbs_g, fat_g, fiber_g, serving_g, is_favorite')
        .eq('user_id', user!.id)
        .order('name')
        .limit(200);
      if (error) throw error;
      return (data ?? []) as FoodItemRow[];
    },
  });
}

/**
 * "My foods", favourites first — the one order every screen shows them in.
 *
 * Favourites used to be their own section, so the same food was drawn twice on
 * any screen that showed both, with identical name, identical macros and the
 * identical star. Sorting them to the front says which they are in half the
 * height, using the star you toggle them with.
 *
 * It is a hook rather than a helper because two screens list these foods — the
 * Nutrition tab's first five and the full list behind "Xem thêm" — and the two
 * disagreeing about which food is first is exactly the kind of difference
 * nobody reports and everybody notices.
 *
 * `favIds` is not redundant with `is_favorite`: starring a food invalidates
 * `favorite_foods` first, so for one render `my_foods` still holds the old flag
 * and the row would drop back down before jumping up again.
 */
export function useMyFoodsSorted() {
  const { data: myFoods } = useMyFoods();
  const { data: favorites } = useFavoriteFoods();
  const favIds = useMemo(() => new Set((favorites ?? []).map((f) => f.id)), [favorites]);
  return useMemo(() => {
    const fav = (f: FoodItemRow) => (f.is_favorite || favIds.has(f.id) ? 0 : 1);
    // A copy: the array belongs to react-query's cache and sorting it in place
    // would reorder it for every other reader.
    return [...(myFoods ?? [])].sort((a, b) => fav(a) - fav(b) || a.name.localeCompare(b.name));
  }, [myFoods, favIds]);
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
      const { data, error } = await supabase
        .from('meal_entry_items')
        .select('food_name, food_item_id, kcal, protein_g, carbs_g, fat_g, fiber_g, servings, created_at')
        .order('created_at', { ascending: false })
        .limit(30);
      if (error) throw error;
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

/**
 * Edit the cached diary in place, and hand back what it was.
 *
 * Both mutations below take three round trips before the server agrees —
 * the write, the parent entry's re-total, and the day's recompute — and the
 * list has no reason to sit still for any of them. The row is already gone
 * from the user's point of view; the network is catching up, not deciding.
 *
 * `cancelQueries` first, or an in-flight refetch that started before the tap
 * can land after this edit and put the row back.
 *
 * The returned snapshot is the rollback. If the write fails the list has to
 * go back to exactly what it showed, not to whatever a refetch would produce
 * — those are the same thing when the server is reachable and very much not
 * when it is the reason the write failed.
 */
async function patchDiary(
  qc: ReturnType<typeof useQueryClient>,
  userId: string | undefined,
  edit: (items: LoggedItem[]) => LoggedItem[],
) {
  const key = ['today_meals_detail', userId, localDateStr()];
  // See `@/lib/offline`: a paused write is never rolled back, so patching now
  // would leave a row deleted on screen and present on the server.
  if (offlineNow()) return { key, previous: undefined };
  await qc.cancelQueries({ queryKey: key });
  const previous = qc.getQueryData<LoggedMeal[]>(key);
  if (previous) {
    qc.setQueryData<LoggedMeal[]>(
      key,
      previous
        .map((meal) => {
          const items = edit(meal.items);
          // Totals are re-derived here too. Leaving the meal's header showing
          // the old figure while its items change is a card disagreeing with
          // itself, which reads as the delete having half-worked.
          const sum = (k: 'kcal' | 'protein_g' | 'carbs_g' | 'fat_g') =>
            Math.round(items.reduce((n, it) => n + it[k], 0));
          return {
            ...meal,
            items,
            kcal: sum('kcal'),
            protein_g: sum('protein_g'),
            carbs_g: sum('carbs_g'),
            fat_g: sum('fat_g'),
          };
        })
        // an entry whose last item just went is a meal that did not happen —
        // the server deletes the row, so the cache must drop it too
        .filter((meal) => meal.items.length > 0),
    );
  }
  return { key, previous };
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
    onMutate: ({ itemId }) =>
      patchDiary(qc, user?.id, (items) => items.filter((it) => it.id !== itemId)),
    onError: (_e, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(ctx.key, ctx.previous);
    },
    onSettled: () => invalidateLogQueries(qc, user?.id),
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
      /*
        Stored exactly, rounded only where it is read.

        These were rounded to whole numbers on the way in, and the next edit
        rescales *from the rounded figure* — so every change threw away the
        fraction and the next one multiplied what was left. It compounds and it
        cannot be undone by going back:

          10 kcal ×0.4 → 4 ·  ×0.4 → 2 (from 1.6) ·  back to 1 serving → 13

        Thirty per cent added to a food by changing the portion three times and
        changing it back. The columns are NUMERIC, so the rounding bought
        nothing the schema wanted; it only lost precision. Exact values make the
        scaling reversible — 10 → 4 → 1.6 → 10 — and `resyncMealEntry` still
        rounds the meal's totals, so nothing downstream sees a fraction.
      */
      const { error } = await supabase
        .from('meal_entry_items')
        .update({
          servings,
          kcal: (Number(row.kcal) || 0) * k,
          protein_g: (Number(row.protein_g) || 0) * k,
          carbs_g: (Number(row.carbs_g) || 0) * k,
          fat_g: (Number(row.fat_g) || 0) * k,
          fiber_g: (Number(row.fiber_g) || 0) * k,
        })
        .eq('id', itemId);
      if (error) throw error;

      await resyncMealEntry(entryId);
      await recomputeDailyLog(user!.id, localDateStr());
    },
    onMutate: ({ itemId, servings }) =>
      patchDiary(qc, user?.id, (items) =>
        items.map((it) => {
          if (it.id !== itemId) return it;
          // the same ratio the server will apply, so the optimistic figures and
          // the refetched ones agree rather than flicker past each other
          const k = servings / (it.servings || 1);
          return {
            ...it,
            servings,
            kcal: it.kcal * k,
            protein_g: it.protein_g * k,
            carbs_g: it.carbs_g * k,
            fat_g: it.fat_g * k,
          };
        }),
      ),
    onError: (_e, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(ctx.key, ctx.previous);
    },
    onSettled: () => invalidateLogQueries(qc, user?.id),
  });
}

/**
 * Everything that changes when a logged food does.
 *
 * `useInvalidateToday` is a hook and cannot be called from inside a mutation's
 * callback, which is why this exists at all — but the *keys* are no longer
 * repeated here. They were, and the two copies drifted twice; the second time
 * it left the streak grey for somebody who had already logged.
 */
function invalidateLogQueries(qc: ReturnType<typeof useQueryClient>, userId?: string) {
  for (const key of todayKeys(userId, localDateStr())) {
    qc.invalidateQueries({ queryKey: key });
  }
}

/**
 * One planned food, as the plan stores it.
 *
 * ── why none of these are optional ──
 *
 * They were, and it hid a real bug for a release. `useMealPlanItems` selected
 * six columns — enough for a card showing a name and a calorie count — and when
 * "Log to today" started reading those same rows, handing them to this type
 * typechecked perfectly: every field it did not fetch was simply "not provided".
 *
 * At runtime `carbs_g` and `fat_g` were `undefined`, became 0, and were written
 * into the diary as 0. The meal was there, with its name and its calories, and
 * two of the four macro bars on the Nutrition tab did not move.
 *
 * `number | null` rather than `number?` is the difference that matters here.
 * The database really can hold null, so null has to be sayable — but *omitting*
 * the field must not compile, because omitting the field is exactly how a
 * missing column arrives.
 */
export interface PlannedFood {
  food_item_id: string | null;
  food_name: string;
  serving_g: number | null;
  kcal: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
}

/**
 * Eat what was planned: a meal from the plan, written into today's diary.
 *
 * ── why this exists ──
 *
 * The meal plan and the food diary did not know about each other. You could
 * write "chicken breast, breakfast, day 2", and on day 2 you opened Log Meal
 * and typed it again from nothing. The plan was a notebook — the only thing in
 * the app that ever read it was the shopping list, and only for the names.
 *
 * The workout side had the same hole and it is closed there: the weekly plan is
 * ticked off and the session writes itself. This is that, for food.
 *
 * ── it writes to *today*, whatever day of the plan it came from ──
 *
 * A plan's "Day 2" is the second day of a routine, not a date — it has no
 * calendar meaning and cannot be given one without asking the user when the
 * week starts. What is certain is that you are eating it now, so it lands on
 * today, and the button that calls this says so.
 *
 * ── one entry, all its foods, the same shape `log-meal` writes ──
 *
 * `meal_entries` holds the totals and `meal_entry_items` the foods, with
 * `servings: 1` because a planned row already *is* the amount planned — its
 * kcal and macros are for that portion, not for one serving of it.
 *
 * ── the one thing that is lost, stated ──
 *
 * `meal_plan_items` has no `fiber_g` column, so fibre arrives as 0 where
 * logging by hand would have carried it. Rounding the number down to a
 * confident zero is wrong in a way worth naming: it is not that the meal had no
 * fibre, it is that the plan never recorded any. Fixing it properly is a
 * migration, not a change here.
 */
export function useLogPlannedMeal() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ mealType, foods }: { mealType: string; foods: PlannedFood[] }) => {
      if (!user) throw new Error('Not signed in');
      if (foods.length === 0) throw new Error('Nothing planned');

      const n = (v: number | null | undefined) => Math.round(Number(v) || 0);
      const total = (k: keyof PlannedFood) =>
        foods.reduce((s, f) => s + (Number(f[k]) || 0), 0);

      const { data: entry, error } = await supabase
        .from('meal_entries')
        .insert({
          user_id: user.id,
          meal_type: mealType,
          total_kcal: Math.round(total('kcal')),
          total_protein_g: Math.round(total('protein_g')),
          total_carbs_g: Math.round(total('carbs_g')),
          total_fat_g: Math.round(total('fat_g')),
          // See the note above: the plan has no fibre to carry over.
          total_fiber_g: 0,
        })
        .select('id')
        .single();
      if (error) throw error;

      const { error: itemsError } = await supabase.from('meal_entry_items').insert(
        foods.map((f) => ({
          meal_entry_id: entry.id,
          food_item_id: f.food_item_id ?? null,
          food_name: f.food_name,
          // The planned row is the portion, so it is one of itself
          servings: 1,
          kcal: n(f.kcal),
          protein_g: n(f.protein_g),
          carbs_g: n(f.carbs_g),
          fat_g: n(f.fat_g),
          fiber_g: 0,
        })),
      );
      if (itemsError) throw itemsError;

      await recomputeDailyLog(user.id, localDateStr());
    },
    onSuccess: () => invalidateLogQueries(qc, user?.id),
  });
}

/**
 * The meals you have already eaten, so you can eat them again without typing.
 *
 * ── why whole meals and not foods ──
 *
 * `useRecentFoods` already offers the last dozen *foods*, and it is the wrong
 * unit for the thing people actually repeat. Breakfast is not "oats"; it is
 * oats and a banana and milk, in the same amounts, four mornings a week. Picked
 * one food at a time that is three searches and three taps for something you
 * did not decide — you had already decided, months ago, that this is what
 * breakfast is.
 *
 * The folding, the de-duplication and the per-serving arithmetic live in
 * `@/lib/recent-meals`, away from react-query and the Supabase client, so
 * `tools/repeat-meal.mjs` can run them. Everything this function does is fetch.
 */
export function useRecentMeals(limit = 6) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['recent_meals', user?.id, limit],
    enabled: !!user,
    queryFn: async () => {
      // RLS scopes these to the caller; the nested select is one round trip
      // rather than an entry query followed by one per entry.
      const { data, error } = await supabase
        .from('meal_entries')
        .select(
          'id, meal_type, date_time, meal_entry_items(food_name, food_item_id, servings, kcal, protein_g, carbs_g, fat_g, fiber_g)',
        )
        .order('date_time', { ascending: false })
        .limit(40);
      if (error) throw error;
      return foldRecentMeals(data ?? [], limit);
    },
  });
}
