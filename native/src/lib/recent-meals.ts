/**
 * Turning logged meals back into meals you can eat again.
 *
 * ── why this is not in the hook ──
 *
 * Two rules here can go wrong without erroring, and both would show up as
 * quietly wrong calories rather than as a crash:
 *
 *   - the stored figures are already multiplied by `servings`, and the log form
 *     works in per-serving figures with a separate multiplier. Hand the form
 *     pre-multiplied numbers *and* the multiplier and every repeated meal
 *     doubles.
 *   - two breakfasts made of the same foods are the same breakfast, whatever
 *     order they were added in.
 *
 * The hook that calls this pulls in react-query and the Supabase client, which
 * will not load in Node. This file imports nothing, so `tools/repeat-meal.mjs`
 * runs the real function against real shapes instead of a description of them.
 */

/** One food inside a repeatable meal, at per-serving values. */
export interface RepeatFood {
  food_item_id: string | null;
  food_name: string;
  servings: number;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  serving_g: number;
}

/** A meal you have eaten before, ready to be eaten again. */
export interface RecentMeal {
  /** the entry it came from — a stable key, not something to write back */
  id: string;
  meal_type: string;
  date_time: string;
  kcal: number;
  foods: RepeatFood[];
}

/** A `meal_entries` row with its items, as the nested select returns it. */
export interface LoggedEntry {
  id: string;
  meal_type: string;
  date_time: string;
  meal_entry_items: {
    food_name: string;
    food_item_id: string | null;
    servings: number | null;
    kcal: number | null;
    protein_g: number | null;
    carbs_g: number | null;
    fat_g: number | null;
    fiber_g: number | null;
  }[] | null;
}

/**
 * What makes two meals the same meal.
 *
 * The meal type and the set of food names, folded to lower case and sorted —
 * the order foods were added in is not part of what makes two breakfasts the
 * same breakfast, and neither is whether one was typed with a capital.
 */
export function mealSignature(mealType: string, names: string[]): string {
  return `${mealType}|${names.map((n) => n.trim().toLowerCase()).sort().join(',')}`;
}

/**
 * The distinct meals in a run of logged entries, newest first.
 *
 * Expects the entries already ordered newest-first, which is what makes the
 * first of a repeated meal the one kept: amounts drift, and the last time you
 * ate it is the best guess at what you will eat now.
 *
 * Entries whose items have all been deleted are skipped — a row with nothing in
 * it is nothing to repeat.
 */
export function foldRecentMeals(entries: LoggedEntry[], limit = 6): RecentMeal[] {
  const seen = new Set<string>();
  const out: RecentMeal[] = [];

  for (const entry of entries) {
    const rows = entry.meal_entry_items ?? [];
    if (rows.length === 0) continue;

    const signature = mealSignature(
      entry.meal_type,
      rows.map((r) => r.food_name),
    );
    if (seen.has(signature)) continue;
    seen.add(signature);

    const foods: RepeatFood[] = rows.map((r) => {
      // A stored `servings` of 0 or null would divide the meal to nothing or to
      // Infinity; one serving is the only reading of "unstated" that keeps the
      // numbers the size they were.
      const s = Number(r.servings) || 1;
      return {
        food_item_id: r.food_item_id,
        food_name: r.food_name,
        servings: s,
        kcal: Math.round(Number(r.kcal) / s),
        protein_g: Math.round(Number(r.protein_g) / s),
        carbs_g: Math.round(Number(r.carbs_g) / s),
        fat_g: Math.round(Number(r.fat_g) / s),
        fiber_g: Math.round(Number(r.fiber_g || 0) / s),
        // The line carries no gram weight; the form reads 0 as "not stated".
        serving_g: 0,
      };
    });

    out.push({
      id: entry.id,
      meal_type: entry.meal_type,
      date_time: entry.date_time,
      // Summed from the items rather than read from `total_kcal`, so the figure
      // on the card is the one the form it fills will add up to.
      kcal: foods.reduce((n, f) => n + f.kcal * f.servings, 0),
      foods,
    });

    if (out.length >= limit) break;
  }

  return out;
}
