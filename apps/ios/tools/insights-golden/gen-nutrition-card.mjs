#!/usr/bin/env node
/**
 * Golden cho thẻ Dinh dưỡng hôm nay (#527, `(tabs)/nutrition` → `NutritionCard`)
 * — @ fac9ac2.
 *
 * BIÊN DỊCH (`build.sh`): `macro-targets.ts` (`calorieTargetFor`, `macroTargetsFor`).
 *
 * CHÉP NGUYÊN VĂN:
 * - `app/(tabs)/nutrition.tsx:387` — `kcal = Math.round(Number(dailyLog?.kcal) || 0)`
 *   và `Number(dailyLog?.x_g) || 0` của bốn macro (`:546-549`);
 * - `components/ascnd/dashboard-cards.tsx`: `SURPLUS_ALLOWANCE` (:97), vòng calo
 *   (:597-654), ô macro (:948) và `MacroSwap` (:444-473).
 *
 *   node gen-nutrition-card.mjs > ../../Packages/ASCNDKit/Tests/ASCNDCoreTests/Fixtures/nutrition-card-golden.json
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { calorieTargetFor, macroTargetsFor } = require('./out/macro-targets.js');

const SURPLUS_ALLOWANCE = 0.1;

let s = 90210;
const rnd = (n) => {
  s = (s * 1103515245 + 12345) % 2147483648;
  return Math.floor(s / 65536) % n;
};
const pick = (xs) => xs[rnd(xs.length)];

const KCAL = [null, 0, '0', '', 'x', 1, 980, 1500, 1980, 2199.6, 2200, 2200.4, 2310, 2420, 2421, 2500, 3100, 5000, -50, '1875.5'];
const G = [null, 0, '', 'x', 3.4, 12, 49.5, 50, 50.4, 92, 149.6, 150, 165, 165.1, 210, 380, -4, '61.2'];
const TDEE = [null, 0, -100, 1200, 1800, 2200, 2500, 2950.6, 3400];
const MACRO = [null, null, 0, 40, 120, 150.5, 180, 250, 30];

const days = [];
for (let i = 0; i < 400; i++) {
  const row = rnd(12) === 0 ? null : { kcal: pick(KCAL), protein_g: pick(G), carbs_g: pick(G), fat_g: pick(G), fiber_g: pick(G) };
  const profile = rnd(10) === 0 ? null : {
    tdee_target_kcal: pick(TDEE),
    macro_protein_g: pick(MACRO), macro_carbs_g: pick(MACRO), macro_fat_g: pick(MACRO), macro_fiber_g: pick(MACRO),
  };
  // Một phần ca ghim kcal đúng bằng / quanh mục tiêu, để có "vừa đủ" và mép dải.
  if (row && rnd(6) === 0) {
    const t = calorieTargetFor(profile);
    row.kcal = pick([t, t - 1, t + 1, Math.round(t * 1.1), Math.round(t * 1.1) + 1]);
  }
  const dailyLog = row;

  // ── nutrition.tsx:387, :546-549 ──
  const kcal = Math.round(Number(dailyLog?.kcal) || 0);
  const calorieTarget = calorieTargetFor(profile);
  const macros = macroTargetsFor(profile);
  const tiles = [
    { current: Number(dailyLog?.protein_g) || 0, target: macros.protein },
    { current: Number(dailyLog?.carbs_g) || 0, target: macros.carbs },
    { current: Number(dailyLog?.fat_g) || 0, target: macros.fat },
    { current: Number(dailyLog?.fiber_g) || 0, target: macros.fiber },
  ];

  // ── dashboard-cards.tsx:597-654 ──
  const calPct = Math.min((kcal / (calorieTarget || 1)) * 100, 100);
  const pctOfTarget = Math.round((kcal / (calorieTarget || 1)) * 100);
  const delta = kcal - calorieTarget;
  const over = delta > 0;
  const onTarget = delta === 0;
  const overBudget = delta > calorieTarget * SURPLUS_ALLOWANCE;
  const inBand = !overBudget && kcal >= calorieTarget;
  const overPct = calorieTarget > 0 ? Math.min((Math.max(delta, 0) / calorieTarget) * 100, 100) : 0;

  days.push({
    row, profile,
    kcal, calorieTarget,
    ring: { calPct, pctOfTarget, delta, over, onTarget, overBudget, inBand, overPct },
    tiles: tiles.map(({ current, target }) => {
      // ── :948 ──
      const pct = Math.min((current / (target || 1)) * 100, 100);
      // ── MacroSwap :444-473 ──
      const eatenNow = Math.round(current);
      const left = Math.round(target - current);
      const over = left < 0;
      const leftWord = over ? 'over' : left === 0 ? 'done' : 'left';
      const leftNum = `${over ? '+' : ''}${Math.abs(left)}`;
      const overHard = current > target * (1 + SURPLUS_ALLOWANCE);
      return { current, target, pct, eatenNow, left, over, leftWord, leftNum, overHard };
    }),
  });
}

process.stdout.write(JSON.stringify({ surplusAllowance: SURPLUS_ALLOWANCE, days }).replace(/\},\{"row"/g, '},\n{"row"') + '\n');
