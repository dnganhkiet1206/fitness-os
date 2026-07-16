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

let pending: ScannedFood[] | null = null;

export function setPendingScan(items: ScannedFood | ScannedFood[]) {
  pending = Array.isArray(items) ? items : [items];
}

export function consumePendingScan(): ScannedFood[] | null {
  const f = pending;
  pending = null;
  return f;
}
