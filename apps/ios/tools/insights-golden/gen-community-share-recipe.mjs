#!/usr/bin/env node
/**
 * Golden cho chia sẻ công thức (#527, lát 13) @ fac9ac2:
 *
 * - `payload`: CHÍNH `payloadFromMeal` (`lib/recipe-post.ts` biên dịch).
 * - `meals`: phần ghép của `useShareableMeals` (`hooks/use-community-recipe.ts`)
 *   chép nguyên văn — lọc lại theo khoá, khẩu phần gốc, bỏ bữa rỗng.
 *
 *   node gen-community-share-recipe.mjs > ../../Packages/ASCNDKit/Tests/ASCNDCoreTests/Fixtures/community-share-recipe-golden.json
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { payloadFromMeal } = require('./out/recipe-post.js');

function join(entries, items, foods, me) {
  const mine = (entries ?? []).filter((e) => e && typeof e.id === 'string' && e.user_id === me);
  if (mine.length === 0) return [];
  const ids = mine.map((e) => e.id);
  const rows = (items ?? []).filter((r) => ids.includes(r.meal_entry_id));
  const foodIds = rows.map((r) => r.food_item_id).filter((x, i, a) => !!x && a.indexOf(x) === i);
  let servingG = {};
  if (foodIds.length > 0) {
    servingG = Object.fromEntries((foods ?? []).filter((f) => foodIds.includes(f.id)).map((f) => [f.id, Number(f.serving_g) || 0]));
  }
  return mine
    .map((e) => {
      const own = rows.filter((r) => r.meal_entry_id === e.id);
      const sg = Object.fromEntries(own.filter((r) => r.food_item_id && r.food_item_id in servingG).map((r) => [r.food_item_id, servingG[r.food_item_id]]));
      return { id: e.id, dateTime: e.date_time, mealType: e.meal_type, rows: own, servingG: sg, preview: payloadFromMeal('', e.meal_type, own, sg) };
    })
    .filter((m) => m.preview.ingredientCount > 0);
}

let seed = 4747;
const rnd = (n) => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return Math.floor(seed / 65536) % n;
};
const pick = (xs) => xs[rnd(xs.length)];

const NAMES = ['Ức gà', '  Cơm  ', '', null, 'Bơ', ' Salad', 'Trứng '];
const row = (k, entry) => ({
  id: `i${pick(['a', 'b', 'c', 'd', 'e', 'f'])}${k}`,
  meal_entry_id: entry,
  food_item_id: pick(['f1', 'f2', 'f3', null, '']),
  food_name: pick(NAMES),
  servings: pick([1, 1.5, 0, null, '2', -1, 0.33]),
  kcal: pick([120, 250.5, null, 0, '99.5', 2.5]),
  protein_g: pick([10, 3.4, null, 31.5]),
  carbs_g: pick([0, 45.2, null]),
  fat_g: pick([5, 0.5, null, 1.49]),
  created_at: pick(['2026-10-09T08:00:00+00:00', '2026-10-09T08:00:00+00:00', '2026-10-09T09:00:00+00:00', '2026-10-08T12:00:00+00:00']),
});
const FOODS = [{ id: 'f1', serving_g: 100 }, { id: 'f2', serving_g: 0 }, { id: 'f3', serving_g: '30' }, { id: 'f9', serving_g: 50 }];

const payload = [];
for (let i = 0; i < 160; i++) {
  const rows = Array.from({ length: rnd(8) + (i === 0 ? 55 : 0) }, (_, k) => row(k, 'm1'));
  const sg = {};
  for (const f of FOODS) if (rnd(3)) sg[f.id] = Number(f.serving_g) || 0;
  const title = pick(['', '  Cơm gà  ', 'Bowl', '\tTab\t']);
  payload.push({ title, mealType: pick(['lunch', 'dinner']), rows, servingG: sg, out: payloadFromMeal(title, 'lunch', rows, sg) });
  payload[payload.length - 1].mealType = 'lunch';
}

const meals = [];
for (let i = 0; i < 60; i++) {
  const entries = Array.from({ length: rnd(5) }, (_, k) => ({ id: `m${k}`, user_id: rnd(6) ? 'me' : 'u2', date_time: `2026-10-0${9 - k}T12:00:00+00:00`, meal_type: pick(['breakfast', 'lunch', 'snack']) }));
  const items = Array.from({ length: rnd(10) }, (_, k) => row(k, `m${rnd(6)}`));
  const out = join(entries, items, FOODS, 'me');
  meals.push({ entries, items, foods: FOODS, out: out.map((m) => ({ id: m.id, servingG: m.servingG, rows: m.rows.map((r) => r.id), preview: m.preview })) });
}

process.stdout.write(JSON.stringify({ payload, meals }, null, 1) + '\n');
