#!/usr/bin/env node
/**
 * Golden cho màn sửa hồ sơ (#527 Phase 8, `app/edit-profile.tsx` @ fac9ac2):
 *
 * - `macroDriftFor` / `calorieTargetFor` của `native/src/lib/macro-targets.ts`
 *   — CHÍNH mã RN biên dịch — trên chuỗi của form (ô đã qua `intText`);
 * - các biểu thức đổi ô hiển thị ↔ cột hệ mét mà màn dựng trên `units.ts`
 *   (chép nguyên văn, không hàm nào export):
 *   - cao (`edit-profile.tsx:482–486`): `v && !isNaN(n) ? String(Math.round(heightToCm(n, u))) : ''`;
 *   - nặng (`:495–499`): `… String(Math.round(weightToKg(n, u) * 10) / 10) : ''`;
 *   - nước (`:625–629`): `… String(volumeToMl(n, vUnit)) : ''`;
 *   - hạt giống (`:151–153`): `v == null ? '' : String(display*(Number(v), u))`;
 *   - đổi đơn vị (`:510–513`, `:524–527`, `:636–639`): `x = Number(f) || 0; x ? String(display*(x, u)) : ''`.
 *
 *   ./build.sh && node gen-profile-entry.mjs > ../../Packages/ASCNDKit/Tests/ASCNDCoreTests/Fixtures/profile-entry-golden.json
 */
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const u = require('./out/units.js');
const m = require('./out/macro-targets.js');

// Ô đã qua `decText` / `intText` — chỉ những chuỗi ô thật sự có thể chứa.
const decs = ['', '0', '0.', '0.5', '5', '12', '12.5', '61.2', '69', '70', '71.5', '100', '150.25', '175', '180.3', '250', '400', '999.99', '1000'];
const ints = ['', '0', '1', '30', '139', '150', '250', '1399', '1907', '2200', '2539', '3200', '100000'];

const entries = [];
for (const v of decs) {
  const n = parseFloat(v);
  for (const unit of ['cm', 'in']) entries.push({ field: 'height', unit, text: v, out: v && !isNaN(n) ? String(Math.round(u.heightToCm(n, unit))) : '' });
  for (const unit of ['kg', 'lbs']) entries.push({ field: 'weight', unit, text: v, out: v && !isNaN(n) ? String(Math.round(u.weightToKg(n, unit) * 10) / 10) : '' });
  for (const unit of ['ml', 'oz']) entries.push({ field: 'water', unit, text: v, out: v && !isNaN(n) ? String(u.volumeToMl(n, unit)) : '' });
}

// Cột hệ mét (chuỗi của form) → ô hiển thị: lúc mở form và lúc đổi đơn vị.
const metric = ['', '0', '1', '45.4', '61.2', '70', '72.5', '150', '175', '180', '1500', '2000', '2365', '3000'];
const displays = [];
for (const v of metric) {
  const x = Number(v) || 0;
  for (const unit of ['cm', 'in']) displays.push({ field: 'height', unit, metric: v, seed: v === '' ? '' : String(u.displayHeight(Number(v), unit)), flip: x ? String(u.displayHeight(x, unit)) : '' });
  for (const unit of ['kg', 'lbs']) displays.push({ field: 'weight', unit, metric: v, seed: v === '' ? '' : String(u.displayWeight(Number(v), unit)), flip: x ? String(u.displayWeight(x, unit)) : '' });
  for (const unit of ['ml', 'oz']) displays.push({ field: 'water', unit, metric: v, seed: v === '' ? '' : String(u.displayVolume(Number(v), unit)), flip: x ? String(u.displayVolume(x, unit)) : '' });
}

// Lệch macro: các bộ form, gồm đúng ca của chú thích RN (1.399 kcal + 250 g carb).
const forms = [
  ['', '', '', '', ''],
  ['2200', '150', '250', '70', '30'],
  ['2200', '150', '250', '70', ''],
  ['2200', '150', '', '70', '30'],
  ['1399', '139', '250', '39', '20'],
  ['1399', '139', '139', '39', '20'],
  ['1399', '139', '141', '39', '20'],
  ['1399', '139', '142', '40', '20'],
  ['', '150', '250', '70', '30'],
  ['0', '150', '250', '70', '30'],
  ['3200', '200', '400', '80', '45'],
  ['3200', '0', '0', '0', '0'],
  ['2539', '190', '286', '70', '35'],
  ['100000', '1', '1', '1', '1'],
];
const drifts = forms.map(([kcal, protein, carbs, fat, fiber]) => {
  const p = { tdee_target_kcal: kcal, macro_protein_g: protein, macro_carbs_g: carbs, macro_fat_g: fat, macro_fiber_g: fiber };
  return { kcal, protein, carbs, fat, fiber, calorieTarget: m.calorieTargetFor(p), drift: m.macroDriftFor(p) };
});

process.stdout.write(JSON.stringify({
  source: 'native/src/lib/{units,macro-targets}.ts + edit-profile.tsx @ fac9ac2 — apps/ios/tools/insights-golden/gen-profile-entry.mjs',
  tolerance: m.MACRO_DRIFT_TOLERANCE_KCAL,
  entries, displays, drifts,
}, null, 1) + '\n');
