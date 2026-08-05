/**
 * Whether a planned meal is already in today's diary.
 *
 * ── the question the old answer dodged ──
 *
 * "Ghi vào hôm nay" marked itself done and forgot on relaunch, with a stated
 * reason: whether you *ate* a meal is not a fact the plan holds, and the diary
 * cannot settle it either, because two eggs for breakfast is one meal logged
 * twice as legitimately as it is a double tap.
 *
 * That reasoning is right about the hard part and answers a question nobody
 * asked. Nothing here needs to know what you ate. The diary knows exactly what
 * it already *contains*, and that is a different question with a real answer —
 * one that survives leaving the screen, because it is stored rather than
 * remembered.
 *
 * ── the rule, and which way it errs ──
 *
 * A planned meal counts as already logged when today holds an entry of the same
 * meal type whose foods are exactly the planned ones — same names, as a set.
 *
 * Names, because that is all both sides reliably have. Sets, because order is
 * not meaningful and a food listed twice in one meal is a plan somebody wrote,
 * not a second meal.
 *
 * *Exactly*, not "contains", so it errs toward saying no. Add a coffee to the
 * breakfast you logged and this stops matching — you get offered the button
 * again, which is a small annoyance. The other direction is worse: matching
 * loosely would quietly refuse to log a meal that genuinely has not been.
 *
 * And nothing built on this may *block*. It is evidence, not a verdict: the
 * screen uses it to say "today already has this" and to ask before writing a
 * second copy. Somebody who really did eat it twice can still say so.
 */

/**
 * The meals a day can hold, in the order a day runs.
 *
 * Here rather than in a screen because three of them need it and they must
 * agree: the wizard offers the first N as slots, the plan page groups a day by
 * it, and the shopping list walks it. A second copy that drifted by one entry
 * would file food under a meal one of them does not draw.
 */
export const MEAL_ORDER = [
  'breakfast',
  'lunch',
  'dinner',
  'snack',
  'preworkout',
  'postworkout',
] as const;

/** A plan is a week. `day_index` is 0–6 and is a position, not a date. */
export const PLAN_DAYS = [0, 1, 2, 3, 4, 5, 6];

export interface NamedFood {
  food_name: string;
}

export interface LoggedEntry {
  meal_type: string;
  items: NamedFood[];
}

/** Lowercased, trimmed, blanks dropped — the form both sides are compared in. */
function nameSet(foods: readonly NamedFood[]): Set<string> {
  const out = new Set<string>();
  for (const f of foods) {
    const n = (f.food_name ?? '').trim().toLowerCase();
    if (n) out.add(n);
  }
  return out;
}

function sameSet(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

/**
 * Does today's diary already hold this planned meal?
 *
 * An empty plan is never "already logged" — there is nothing to have logged,
 * and saying yes would put a tick against a meal with no food in it.
 */
export function plannedMealIsLoggedToday(
  planned: readonly NamedFood[],
  mealType: string,
  entries: readonly LoggedEntry[],
): boolean {
  const want = nameSet(planned);
  if (want.size === 0) return false;
  return entries.some((e) => e.meal_type === mealType && sameSet(nameSet(e.items), want));
}
