/**
 * Hand-off channel from the barcode scanner screen back to the Log Meal
 * sheet underneath it. The scanner sets the result and pops itself; the
 * sheet consumes it on focus.
 */
export interface ScannedFood {
  food_name: string;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

let pending: ScannedFood | null = null;

export function setPendingScan(f: ScannedFood) {
  pending = f;
}

export function consumePendingScan(): ScannedFood | null {
  const f = pending;
  pending = null;
  return f;
}
