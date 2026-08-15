/**
 * Hand-off channel from the scanner screens (barcode + AI photo) back to
 * the Log Meal sheet underneath them. A scanner sets one or more results
 * and pops itself; the sheet consumes them on focus and appends to its
 * item list. Carries the full macro set so AI-scanned dishes keep protein
 * / carbs / fat / fiber, not just calories.
 */
export interface ScannedFood {
  food_name: string;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  serving_g: number;
}

/**
 * How long a scan is allowed to sit here unclaimed.
 *
 * ── the bug this exists for ──
 *
 * The slot had no expiry, and it was cleared only by being consumed. `/log-meal`
 * is the only screen that consumes. So a scan taken from the **Nutrition tab**,
 * where no meal sheet sits underneath, was written here and then simply left —
 * the camera closed, nothing was logged, no error was shown.
 *
 * It did not stay lost, which is the worse half. The next time a meal sheet was
 * opened — that evening, the next morning — those items were appended to it.
 * A plate photographed at lunch quietly became part of somebody's dinner, with
 * its calories and macros, and nothing in the app connected the two events.
 *
 * The navigation half of that is fixed too (`stackHasMealSheet`), so nothing
 * should reach this timeout in normal use. It is here because "nothing should"
 * is the assumption the first version was built on: a hand-off with no expiry
 * has to be perfect for ever, and this one only had to be imperfect once.
 *
 * Five minutes is long enough for the AI round trip and a confirmation, and far
 * too short to reach the next meal.
 */
export const SCAN_TTL_MS = 5 * 60 * 1000;

let pending: { at: number; items: ScannedFood[] } | null = null;

export function setPendingScan(items: ScannedFood | ScannedFood[], now = Date.now()) {
  pending = { at: now, items: Array.isArray(items) ? items : [items] };
}

export function consumePendingScan(now = Date.now()): ScannedFood[] | null {
  const held = pending;
  pending = null;
  if (!held) return null;
  /* Stale is dropped rather than served late. A meal the person has forgotten
     photographing is not a meal they are choosing to log now. */
  if (now - held.at > SCAN_TTL_MS) return null;
  return held.items;
}

/**
 * Is there a meal sheet already open underneath this scanner?
 *
 * ── why the scanner works this out instead of being told ──
 *
 * It used to be told, by a query parameter: `scan-food?from=ai` meant "there is
 * no sheet below you, route into one", and anything else meant "just pop". The
 * comment beside that branch shows the case was understood.
 *
 * The Nutrition tab's own *four ways to log a meal* card pushes both scanners
 * with no parameter at all. So the two most prominent scan buttons in the app
 * took the "just pop" branch, popped back to the tab, and dropped the scan on
 * the floor.
 *
 * A hand-off that depends on every future caller remembering a flag will be
 * broken by the first caller who does not, and that already happened. This asks
 * the navigation state instead: the caller cannot get it wrong because the
 * caller is no longer asked.
 *
 * Unknown shapes answer `false`, which routes into a sheet. That is the safe
 * direction: the worst case is a second sheet carrying the food, and the worst
 * case of the other direction is the food disappearing.
 */
export function stackHasMealSheet(state: unknown, target = 'log-meal'): boolean {
  if (!state || typeof state !== 'object') return false;
  const s = state as { routes?: unknown };
  if (!Array.isArray(s.routes)) return false;
  return s.routes.some((r) => {
    if (!r || typeof r !== 'object') return false;
    const route = r as { name?: unknown; state?: unknown };
    if (route.name === target) return true;
    return stackHasMealSheet(route.state, target);
  });
}
