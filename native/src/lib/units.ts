/**
 * Unit conversion + display helpers for a global audience. All body
 * metrics are stored in metric (weight_kg, height_cm) — these convert
 * to/from the user's display units (profile.units_weight / units_height)
 * so a US user sees lb / ft-in while the DB stays canonical metric.
 */

export type WeightUnit = 'kg' | 'lbs';
export type HeightUnit = 'cm' | 'in';

const LB_PER_KG = 2.2046226218;
const CM_PER_IN = 2.54;

export function kgToLbs(kg: number): number {
  return kg * LB_PER_KG;
}
export function lbsToKg(lbs: number): number {
  return lbs / LB_PER_KG;
}
export function cmToIn(cm: number): number {
  return cm / CM_PER_IN;
}
export function inToCm(inches: number): number {
  return inches * CM_PER_IN;
}

/** Weight in the display unit, rounded to 1 decimal */
export function displayWeight(kg: number, unit: WeightUnit): number {
  const v = unit === 'lbs' ? kgToLbs(kg) : kg;
  return Math.round(v * 10) / 10;
}

/** Parse a value typed in the display unit back to kg for storage */
export function weightToKg(value: number, unit: WeightUnit): number {
  return unit === 'lbs' ? lbsToKg(value) : value;
}

/** Short unit label */
export function weightLabel(unit: WeightUnit): string {
  return unit === 'lbs' ? 'lb' : 'kg';
}

/** "70 kg" / "154.3 lb" */
export function formatWeight(kg: number, unit: WeightUnit, decimals = 1): string {
  const v = unit === 'lbs' ? kgToLbs(kg) : kg;
  return `${v.toFixed(decimals)} ${weightLabel(unit)}`;
}

/** Height in the display unit (cm as number, or total inches) rounded */
export function displayHeight(cm: number, unit: HeightUnit): number {
  const v = unit === 'in' ? cmToIn(cm) : cm;
  return Math.round(v * 10) / 10;
}

/** Parse a display-unit height back to cm for storage */
export function heightToCm(value: number, unit: HeightUnit): number {
  return unit === 'in' ? inToCm(value) : value;
}

/** "175 cm" / "5'9\"" */
export function formatHeight(cm: number, unit: HeightUnit): string {
  if (unit === 'in') {
    const totalIn = Math.round(cmToIn(cm));
    const ft = Math.floor(totalIn / 12);
    const inch = totalIn % 12;
    return `${ft}'${inch}"`;
  }
  return `${Math.round(cm)} cm`;
}
