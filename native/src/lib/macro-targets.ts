/**
 * The day's calorie and macro targets, from the profile.
 *
 * Extracted because two screens now draw the same nutrition card — the
 * dashboard and the Nutrition tab — and a target computed twice is a target
 * that eventually disagrees with itself. The card is already one component;
 * this makes its inputs one function.
 *
 * The fallbacks are the dashboard's own and are what a profile that has not
 * been through the onboarding maths gets. They are here rather than at each
 * call site for the same reason: a default written twice is a default that
 * drifts.
 */

export interface MacroProfile {
  tdee_target_kcal?: number | string | null;
  macro_protein_g?: number | string | null;
  macro_carbs_g?: number | string | null;
  macro_fat_g?: number | string | null;
  macro_fiber_g?: number | string | null;
}

export const calorieTargetFor = (p: MacroProfile | undefined | null): number =>
  Math.round(Number(p?.tdee_target_kcal) || 2200);

export const macroTargetsFor = (p: MacroProfile | undefined | null) => ({
  protein: Number(p?.macro_protein_g) || 150,
  carbs: Number(p?.macro_carbs_g) || 250,
  fat: Number(p?.macro_fat_g) || 70,
  // 30g is the usual adult guideline and what the column defaults to when the
  // onboarding maths has not run
  fiber: Number(p?.macro_fiber_g) || 30,
});
