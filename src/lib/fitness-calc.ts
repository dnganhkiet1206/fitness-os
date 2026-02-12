// Fitness calculation utilities

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

/** Goal-adjusted TDEE */
export function calcTargetCalories(tdee: number, goal: string): number {
  switch (goal) {
    case 'bulk': return Math.round(tdee * 1.1);
    case 'cut': return Math.round(tdee * 0.8);
    case 'recomp': return tdee;
    case 'strength': return Math.round(tdee * 1.05);
    case 'endurance': return Math.round(tdee * 1.05);
    default: return tdee; // maintain
  }
}

/** Macro suggestions based on goal + weight */
export function calcMacros(targetKcal: number, weight_kg: number, goal: string) {
  // Protein: g/kg based on goal
  const proteinPerKg = goal === 'bulk' ? 2.2 : goal === 'cut' ? 2.4 : goal === 'strength' ? 2.0 : 1.8;
  const protein_g = Math.round(weight_kg * proteinPerKg);
  // Fat: 25% of calories
  const fat_g = Math.round((targetKcal * 0.25) / 9);
  // Carbs: remainder
  const carbs_g = Math.round((targetKcal - protein_g * 4 - fat_g * 9) / 4);
  const fiber_g = 30;
  return { protein_g, carbs_g: Math.max(carbs_g, 50), fat_g, fiber_g };
}

/** Water target: ~35ml per kg */
export function calcWaterTarget(weight_kg: number): number {
  return Math.round(weight_kg * 35);
}

/** Age from DOB */
export function calcAge(dob: string): number {
  const birth = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age;
}
