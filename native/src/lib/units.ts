/**
 * Unit conversion + display helpers for a global audience. All body
 * metrics are stored in metric (weight_kg, height_cm) — these convert
 * to/from the user's display units (profile.units_weight / units_height)
 * so a US user sees lb / ft-in while the DB stays canonical metric.
 */

export type WeightUnit = 'kg' | 'lbs';
export type HeightUnit = 'cm' | 'in';
export type VolumeUnit = 'ml' | 'oz';

const LB_PER_KG = 2.2046226218;
const CM_PER_IN = 2.54;
const ML_PER_FLOZ = 29.5735296; // US fluid ounce

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

/** Weight converted to the display unit, unrounded (caller formats) */
export function convertWeight(kg: number, unit: WeightUnit): number {
  return unit === 'lbs' ? kgToLbs(kg) : kg;
}

/** Weight in the display unit, rounded to 1 decimal (for whole-body weights) */
export function displayWeight(kg: number, unit: WeightUnit): number {
  return Math.round(convertWeight(kg, unit) * 10) / 10;
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

/** Length (body measurements) converted to the display unit, unrounded */
export function convertLength(cm: number, unit: HeightUnit): number {
  return unit === 'in' ? cmToIn(cm) : cm;
}

/** Length in the display unit, rounded to 1 decimal */
export function displayLength(cm: number, unit: HeightUnit): number {
  return Math.round(convertLength(cm, unit) * 10) / 10;
}

/** Parse a display-unit length back to cm for storage */
export function lengthToCm(value: number, unit: HeightUnit): number {
  return unit === 'in' ? inToCm(value) : value;
}

/** Short length unit label */
export function lengthLabel(unit: HeightUnit): string {
  return unit === 'in' ? 'in' : 'cm';
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

export function mlToOz(ml: number): number {
  return ml / ML_PER_FLOZ;
}
export function ozToMl(oz: number): number {
  return oz * ML_PER_FLOZ;
}

/** Volume in the display unit — ml stays integer, oz rounds to 1 decimal */
export function displayVolume(ml: number, unit: VolumeUnit): number {
  return unit === 'oz' ? Math.round(mlToOz(ml) * 10) / 10 : Math.round(ml);
}

/** Parse a display-unit volume back to ml for storage */
export function volumeToMl(value: number, unit: VolumeUnit): number {
  return unit === 'oz' ? Math.round(ozToMl(value)) : Math.round(value);
}

/** Short volume unit label */
export function volumeLabel(unit: VolumeUnit): string {
  return unit === 'oz' ? 'oz' : 'ml';
}
