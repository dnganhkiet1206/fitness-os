#!/usr/bin/env node
/**
 * Golden cho luật bữa ăn (#527, chỉ thị 6091878507 · A3) — mã RN @ fac9ac2 biên
 * dịch (`build.sh`), không chép tay:
 * - `plannedMealIsLoggedToday` (`lib/planned-meal.ts`) → `MealPlans.isLoggedToday`;
 * - `foldRecentMeals` / `mealSignature` (`lib/recent-meals.ts`) → `MealLog.recentMeals`;
 * - `macroTargetsFor` / `calorieTargetFor` (`lib/macro-targets.ts`) → `MacroTargets.grams` / `calorieTarget`.
 *
 *   node gen-meals.mjs > ../../Packages/ASCNDKit/Tests/ASCNDCoreTests/Fixtures/meals-golden.json
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { plannedMealIsLoggedToday, MEAL_ORDER } = require('./out/planned-meal.js');
const { foldRecentMeals, mealSignature } = require('./out/recent-meals.js');
const { macroTargetsFor, calorieTargetFor } = require('./out/macro-targets.js');

let seed = 6091;
const rnd = (n) => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return Math.floor(seed / 65536) % n;
};
const pick = (a) => a[rnd(a.length)];

// Tên cố ý va nhau: hoa / thường, khoảng trắng hai đầu, rỗng, chữ có dấu.
const NAMES = ['Phở bò', 'phở bò ', ' PHỞ BÒ', 'Cơm gà', 'cơm gà', 'Canh', 'Trà đá', '', '   ', 'Trứng', 'Ức gà', 'ức gà'];
const TYPES = [...MEAL_ORDER, 'brunch'];
const names = (n) => Array.from({ length: n }, () => pick(NAMES));

// 1. plannedMealIsLoggedToday — 300 ca.
const planned = [];
for (let i = 0; i < 300; i++) {
  const plan = names(rnd(4));
  const mealType = pick(TYPES.slice(0, 3));
  const entries = Array.from({ length: rnd(4) }, () => {
    // Một nửa số bữa dựng từ chính kế hoạch (đảo / lặp / thêm bớt) để có cả "có".
    let items = rnd(2) ? [...plan].reverse() : names(rnd(4));
    if (rnd(4) === 0) items = [...items, pick(NAMES)];
    if (rnd(5) === 0) items = items.slice(1);
    return { meal_type: rnd(4) ? mealType : pick(TYPES), items: items.map((food_name) => ({ food_name })) };
  });
  planned.push({
    planned: plan, mealType, entries,
    expected: plannedMealIsLoggedToday(plan.map((food_name) => ({ food_name })), mealType, entries),
  });
}

// 2. foldRecentMeals — 160 ca, mỗi ca 0–12 bữa mới → cũ.
const NUM = [null, 0, 1, 1.5, 2, 3, 0.5, 120.4, 333.5, 99.5, 41, 7.25];
const recent = [];
for (let i = 0; i < 160; i++) {
  const entries = Array.from({ length: rnd(13) }, (_, k) => ({
    id: `e${i}-${k}`,
    meal_type: pick(TYPES),
    date_time: `2026-10-0${1 + rnd(9)}T0${rnd(10)}:00:00.000Z`,
    meal_entry_items: rnd(8) === 0 ? (rnd(2) ? null : []) : Array.from({ length: 1 + rnd(3) }, () => ({
      food_name: pick(NAMES),
      food_item_id: rnd(2) ? `f${rnd(5)}` : null,
      servings: pick(NUM),
      kcal: pick(NUM),
      protein_g: pick(NUM),
      carbs_g: pick(NUM),
      fat_g: pick(NUM),
      fiber_g: pick(NUM),
    })),
  }));
  const limit = pick([6, 6, 6, 3, 1]);
  recent.push({
    entries, limit,
    signatures: entries.map((e) => mealSignature(e.meal_type, (e.meal_entry_items ?? []).map((r) => r.food_name))),
    expected: foldRecentMeals(entries, limit),
  });
}

// 3. macroTargetsFor — 240 ca: đủ / thiếu từng trường, 0, âm, lẻ.
const KCAL = [null, 0, -100, 1200, 1800.6, 2200, 2499.5, 3100, 4000];
const MAC = [null, 0, -5, 12.5, 40, 95, 150, 210.4, 300];
const macros = [];
for (let i = 0; i < 240; i++) {
  const p = {
    tdee_target_kcal: pick(KCAL), macro_protein_g: pick(MAC), macro_carbs_g: pick(MAC),
    macro_fat_g: pick(MAC), macro_fiber_g: pick(MAC),
  };
  macros.push({ profile: p, kcal: calorieTargetFor(p), expected: macroTargetsFor(p) });
}

process.stdout.write(JSON.stringify({ source: 'fac9ac2', planned, recent, macros }, null, 1) + '\n');
