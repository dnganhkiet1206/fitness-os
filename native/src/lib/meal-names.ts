/**
 * The one definition of "the same foods", shared by the meal plan's
 * "already logged?" check (`lib/planned-meal.ts`) and the recent-meals
 * "eat again" list (`lib/recent-meals.ts`).
 *
 * ── why one definition lives here ──
 *
 * The two files answered the question differently and both had a comment
 * defending their answer: the plan compared food names as a SET ("a food
 * written twice in one meal is a plan somebody wrote, not a second meal"),
 * while the recent-meals signature sorted and joined the names — a MULTISET,
 * where "egg,egg" and "egg" are different breakfasts. The recent-meals header
 * even said "the set of food names" while the code below it kept duplicates.
 *
 * So the same pair of meals matched in one place and not the other: a plan
 * ticked "already logged" for a breakfast the "eat again" list showed as two
 * different meals. The set reading is the one both gates pin — `planned-meal`
 * explicitly ("a food written twice in one meal is one food, on both sides")
 * and `repeat-meal` by requiring order/case/spacing insensitivity — so the
 * multiset was the drift, and this file is where the drift cannot recur.
 *
 * ── the rule ──
 *
 * Names are trimmed, lowercased, blanks dropped, compared as a set. Order is
 * not meaningful; a duplicate is not a second food; an empty name is not a
 * food at all. Meal *type* is not part of this — the plan compares it
 * separately, the recent-meals signature folds it in; both reduce to the same
 * comparison.
 */

/** Lowercased, trimmed, blanks dropped, duplicates collapsed. */
export function foodNameSet(names: readonly (string | null | undefined)[]): Set<string> {
  const out = new Set<string>();
  for (const n of names) {
    const clean = (n ?? '').trim().toLowerCase();
    if (clean) out.add(clean);
  }
  return out;
}

/** Order-independent identity of a food set — what the signature is built from. */
export function foodSetKey(set: ReadonlySet<string>): string {
  return [...set].sort().join(',');
}
