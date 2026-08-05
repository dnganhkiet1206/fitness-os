/**
 * Eating a meal again gets the meal you ate.
 *
 * ── the two rules that can go wrong in silence ──
 *
 * `meal_entry_items` stores kcal and macros **already multiplied by
 * `servings`** — that is what the log form writes and what the diary reads. The
 * form itself works in per-serving figures with a separate multiplier. So a
 * repeat has to divide back on the way out, and if it ever stops doing that,
 * nothing errors: every repeated meal is simply twice, or four times, the meal
 * you ate, and it goes into the daily log that way.
 *
 * The second is de-duplication. Two breakfasts made of the same foods are the
 * same breakfast whatever order they were added in, and if the signature stops
 * saying so the list fills with one breakfast repeated six times and offers
 * nothing else.
 *
 * ── what is checked ──
 *
 * 1. the round trip: `kcal × servings` back out equals what was stored
 * 2. the same meal in a different order is one entry, not two
 * 3. the *newest* of a repeated meal is the one kept
 * 4. a different meal type is a different meal, same foods or not
 * 5. an entry whose items were all deleted is skipped, not offered empty
 * 6. `servings` of 0 or null divides by one rather than to zero or Infinity
 * 7. the card's calorie figure is what the form it fills will add up to
 * 8. the no-division version is rebuilt and required to double, so this cannot
 *    go green again if the `/ s` disappears
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = mkdtempSync(path.join(tmpdir(), 'repeatmeal-'));
const problems = [];

try {
  execFileSync(
    'npx',
    ['tsc', 'src/lib/recent-meals.ts', '--ignoreConfig', '--outDir', out,
     '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
    { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const { foldRecentMeals, mealSignature } =
    createRequire(import.meta.url)(path.join(out, 'recent-meals.js'));

  /** an item as the database holds it: figures already multiplied by servings */
  const stored = (name, perServing, servings) => ({
    food_name: name,
    food_item_id: null,
    servings,
    kcal: Math.round(perServing * servings),
    protein_g: Math.round(perServing * 0.1 * servings),
    carbs_g: Math.round(perServing * 0.5 * servings),
    fat_g: Math.round(perServing * 0.05 * servings),
    fiber_g: 0,
  });

  const entry = (id, meal_type, date_time, items) => ({ id, meal_type, date_time, meal_entry_items: items });

  // ── 1 + 7: the round trip, and the number on the card ──
  const oats = stored('Oats', 150, 2);       // 300 kcal stored
  const banana = stored('Banana', 89, 1.5);  // 134 kcal stored
  const [breakfast] = foldRecentMeals([entry('a', 'breakfast', '2026-08-05T07:00:00Z', [oats, banana])]);

  for (const [i, src] of [oats, banana].entries()) {
    const f = breakfast.foods[i];
    const backOut = Math.round(f.kcal * f.servings);
    // Rounding to whole kcal per serving can cost up to half a kcal per
    // serving; anything beyond that is the multiplier being applied twice.
    if (Math.abs(backOut - src.kcal) > Math.ceil(f.servings / 2)) {
      problems.push(`${src.food_name}: stored ${src.kcal} kcal, repeats as ${backOut}`);
    }
  }
  const cardSum = breakfast.foods.reduce((n, f) => n + f.kcal * f.servings, 0);
  if (breakfast.kcal !== cardSum) {
    problems.push(`the card says ${breakfast.kcal} kcal, the form will add up to ${cardSum}`);
  }

  // ── 2: order does not make a second meal ──
  const same = foldRecentMeals([
    entry('a', 'breakfast', '2026-08-05T07:00:00Z', [oats, banana]),
    entry('b', 'breakfast', '2026-08-04T07:00:00Z', [banana, oats]),
  ]);
  if (same.length !== 1) problems.push(`the same foods in another order made ${same.length} meals`);
  if (mealSignature('breakfast', ['Oats', 'Banana']) !== mealSignature('breakfast', ['banana', ' oats '])) {
    problems.push('signature is sensitive to order, case or spacing');
  }

  // ── 3: the newest wins ──
  if (same[0]?.id !== 'a') problems.push(`kept ${same[0]?.id}, expected the newest ("a")`);

  // ── 4: meal type is part of the identity ──
  const twoTypes = foldRecentMeals([
    entry('a', 'breakfast', '2026-08-05T07:00:00Z', [oats]),
    entry('b', 'snack', '2026-08-05T15:00:00Z', [oats]),
  ]);
  if (twoTypes.length !== 2) problems.push('the same food at breakfast and as a snack folded into one');

  // ── 5: an emptied entry is not offered ──
  const emptied = foldRecentMeals([
    entry('a', 'lunch', '2026-08-05T12:00:00Z', []),
    entry('b', 'lunch', '2026-08-04T12:00:00Z', null),
    entry('c', 'lunch', '2026-08-03T12:00:00Z', [oats]),
  ]);
  if (emptied.length !== 1 || emptied[0].id !== 'c') {
    problems.push(`emptied entries were offered: ${emptied.map((m) => m.id).join(',')}`);
  }

  // ── 6: a missing multiplier divides by one ──
  for (const bad of [0, null, undefined, NaN]) {
    const [m] = foldRecentMeals([
      entry('a', 'lunch', '2026-08-05T12:00:00Z', [{ ...stored('Rice', 200, 1), servings: bad }]),
    ]);
    const f = m.foods[0];
    if (f.servings !== 1 || f.kcal !== 200) {
      problems.push(`servings ${String(bad)} gave ${f.kcal} kcal × ${f.servings}`);
    }
  }

  // ── 8: teeth. The version that forgets to divide has to fail rule 1. ──
  const noDivide = (item) => ({ kcal: Number(item.kcal), servings: Number(item.servings) || 1 });
  const wrong = noDivide(oats);
  if (Math.round(wrong.kcal * wrong.servings) === oats.kcal) {
    problems.push('the undivided version no longer doubles — this check proves nothing');
  }

  // ── the limit is a limit ──
  const many = foldRecentMeals(
    Array.from({ length: 20 }, (_, i) =>
      entry(`e${i}`, 'lunch', `2026-08-0${(i % 9) + 1}T12:00:00Z`, [stored(`Food ${i}`, 100, 1)]),
    ),
    6,
  );
  if (many.length !== 6) problems.push(`limit 6 returned ${many.length}`);

  if (problems.length) {
    console.error('ăn lại bữa cũ CÓ LỖI:');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }

  console.log(
    'ăn lại bữa cũ OK — chia ngược theo khẩu phần đúng cả hai chiều, ' +
      'cùng món khác thứ tự là một bữa, giữ bữa mới nhất, khác loại bữa là khác bữa, ' +
      'bữa rỗng bị bỏ, servings 0/null coi là 1; bản quên chia vẫn bị bắt',
  );
} finally {
  rmSync(out, { recursive: true, force: true });
}
