// ASCND – Fitness calculation utilities

/** Mifflin-St Jeor BMR */
export function calcBMR(weight_kg: number, height_cm: number, age: number, sex: 'male' | 'female' | 'other'): number {
  const base = 10 * weight_kg + 6.25 * height_cm - 5 * age;
  if (sex === 'female') return Math.round(base - 161);
  return Math.round(base + 5); // male / other
}

const ACTIVITY_MULTIPLIERS: Record<string, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  high: 1.725,
  athlete: 1.9,
};

export function calcTDEE(bmr: number, activityLevel: string): number {
  return Math.round(bmr * (ACTIVITY_MULTIPLIERS[activityLevel] || 1.55));
}

export type Sex = 'male' | 'female' | 'other';

/**
 * The lowest daily calorie target this app will hand anybody.
 *
 * `cut` is a flat 20% cut of TDEE, and 20% of a small number is a small
 * number. A 45 kg, 150 cm, 25-year-old sedentary woman has a TDEE of 1,322,
 * so the old rule prescribed **1,058 kcal a day** — below her own resting
 * metabolism of 1,102, from an app with nobody supervising it.
 *
 * The NIH puts the safe floor for an unsupervised weight-loss plan at 1,200
 * kcal for women and 1,500 for men, and MyFitnessPal enforces exactly those
 * two numbers: it will not let a goal be set below them however the maths
 * comes out. This does the same.
 *
 * `other` takes the higher of the two, for the same reason `calcBMR` gives it
 * the male constant: when the input does not say, do not pick the answer that
 * prescribes eating less.
 *
 * The floor raising a target is not a failure of the maths — it is the maths
 * asking for something the app will not ask a person to do. Somebody whose
 * deficit is squeezed to nothing by it needs a smaller goal, not a smaller
 * plate.
 */
const CALORIE_FLOOR_KCAL: Record<Sex, number> = { female: 1200, male: 1500, other: 1500 };

/** Goal-adjusted TDEE, never below the floor for that person. */
export function calcTargetCalories(tdee: number, goal: string, sex: Sex): number {
  let target: number;
  switch (goal) {
    case 'bulk': target = Math.round(tdee * 1.1); break;
    case 'cut': target = Math.round(tdee * 0.8); break;
    case 'strength': target = Math.round(tdee * 1.05); break;
    case 'endurance': target = Math.round(tdee * 1.05); break;
    default: target = Math.round(tdee); // maintain, recomp
  }
  return Math.max(target, CALORIE_FLOOR_KCAL[sex] ?? CALORIE_FLOOR_KCAL.other);
}

/**
 * Adequate Intake for total fibre, from the IOM/Food and Nutrition Board: 14 g
 * per 1,000 kcal, the level at which the coronary-heart-disease association
 * was observed. The familiar "25 g for women, 38 g for men" is this same
 * number applied to reference calorie intakes.
 *
 * It replaces a flat 30 g, which was right for nobody in particular: too much
 * for a 1,500 kcal cut (21 g) and too little for a 3,500 kcal bulk (49 g).
 */
export const FIBER_G_PER_1000_KCAL = 14;

/** Fat below this share of calories stops being a diet and starts being a problem — the low end of the IOM's acceptable range (20–35%). */
const FAT_FLOOR_FRACTION = 0.2;
const FAT_TARGET_FRACTION = 0.25;

/** Carbohydrate is the remainder, but not all the way to nothing. */
const MIN_CARB_G = 50;

/**
 * The body weight a protein target should be computed from.
 *
 * Protein need tracks fat-free mass, and fat mass above BMI 30 adds almost
 * none. Charging 2.4 g/kg against *total* weight therefore overshoots badly
 * for anybody with obesity: a 150 kg person was being told to eat 360 g of
 * protein a day — 1,440 kcal of it, most of a 1,982 kcal cut target — which
 * left carbohydrate negative and got silently clamped.
 *
 * Weijs, "Protein requirement in obesity" (Curr Opin Clin Nutr Metab Care,
 * doi:10.1097/MCO.0000000000001087), states the practical rule directly:
 *
 *   "The excessive fat mass accumulation above BMI 30 could be ignored by
 *    using a maximum adjusted body weight at BMI 30."
 *
 * so that is what this does. For everybody under BMI 30 — which is nearly
 * everybody this app is built for — it changes nothing at all.
 *
 * Without a height there is no BMI, and a guessed one would move somebody's
 * protein target by a hundred grams. So without a height it does not adjust.
 */
export function proteinReferenceWeight(weight_kg: number, height_cm?: number): number {
  if (!height_cm || height_cm < 100 || height_cm > 250) return weight_kg;
  const m = height_cm / 100;
  return Math.min(weight_kg, 30 * m * m);
}

/** Same paper: during weight loss, protein should not fall below 1.2 g/kg of that same reference weight. */
const PROTEIN_FLOOR_PER_KG = 1.2;

/**
 * Macro suggestions based on goal + weight.
 *
 * The three numbers must add up to `targetKcal`. That sounds obvious and the
 * previous version did not do it: when protein and fat between them ate the
 * whole budget, carbohydrate came out negative and was clamped to 50 g — so
 * the four rings on the nutrition card added up to *more* than the calorie
 * ring above them, and somebody could hit every macro target and be 225 kcal
 * over their calorie target on the same screen.
 *
 * Here carbohydrate is derived from the identity last, so it holds by
 * construction. When the remainder would fall under `MIN_CARB_G`, the shortfall
 * is taken back out of fat first — down to the 20% floor — and only then out
 * of protein, down to 1.2 g/kg. Nothing is clamped without something else
 * moving to pay for it.
 */
export function calcMacros(targetKcal: number, weight_kg: number, goal: string, height_cm?: number) {
  const refKg = proteinReferenceWeight(weight_kg, height_cm);
  const proteinPerKg = goal === 'bulk' ? 2.2 : goal === 'cut' ? 2.4 : goal === 'strength' ? 2.0 : 1.8;

  let protein_g = Math.round(refKg * proteinPerKg);
  let fat_g = Math.round((targetKcal * FAT_TARGET_FRACTION) / 9);

  let short = MIN_CARB_G * 4 + protein_g * 4 + fat_g * 9 - targetKcal;
  if (short > 0) {
    const fatFloor_g = Math.round((targetKcal * FAT_FLOOR_FRACTION) / 9);
    const fromFat = Math.min(short, Math.max(fat_g - fatFloor_g, 0) * 9);
    fat_g -= Math.round(fromFat / 9);
    short -= fromFat;
  }
  if (short > 0) {
    const proteinFloor_g = Math.round(refKg * PROTEIN_FLOOR_PER_KG);
    const fromProtein = Math.min(short, Math.max(protein_g - proteinFloor_g, 0) * 4);
    protein_g -= Math.round(fromProtein / 4);
  }

  const carbs_g = Math.max(Math.round((targetKcal - protein_g * 4 - fat_g * 9) / 4), 0);
  const fiber_g = Math.round((targetKcal / 1000) * FIBER_G_PER_1000_KCAL);
  return { protein_g, carbs_g, fat_g, fiber_g };
}

/**
 * Water target.
 *
 * 35 ml/kg is the usual rule and it is fine through the normal range — 70 kg
 * comes out at 2,450 ml, next to EFSA's 2.5 L/day of beverages for men. It is
 * charged against total body weight, though, and adipose tissue holds far less
 * water than lean tissue, so it runs away at the top: a 150 kg person was being
 * told to drink **5.25 litres a day**.
 *
 * The documented adjustment is to drop the coefficient to 25 ml/kg at BMI 30
 * and above, for exactly that reason. Applied as written it puts an 870 ml step
 * in the middle of the scale — cross from BMI 29.9 to 30.1 and the target falls
 * by most of a litre overnight, which reads as a bug because it looks like one.
 *
 * So the adjusted figure is never allowed below what somebody at BMI 30 with
 * this height would be told to drink. Both numbers are the published ones; the
 * `max` only removes the step. The result is continuous at BMI 30, never
 * decreases as weight rises, and lands a 150 cm/170 cm person at 3.75 L instead
 * of 5.25 L.
 *
 * Without a height there is no BMI, so it does what it always did.
 */
export function calcWaterTarget(weight_kg: number, height_cm?: number): number {
  const perKg = 35;
  if (!height_cm || height_cm < 100 || height_cm > 250) return Math.round(weight_kg * perKg);
  const m = height_cm / 100;
  const bmi = weight_kg / (m * m);
  if (bmi < 30) return Math.round(weight_kg * perKg);
  const weightAtBmi30 = 30 * m * m;
  return Math.round(Math.max(weight_kg * 25, weightAtBmi30 * perKg));
}

/** Age from DOB (parsed as local so the birthday doesn't shift a day in negative-offset timezones) */
export function calcAge(dob: string): number {
  const birth = new Date(`${dob}T00:00:00`);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age;
}
