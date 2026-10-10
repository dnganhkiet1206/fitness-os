#!/usr/bin/env node
/**
 * Golden cho form thêm / sửa thực phẩm (#527) — `app/food-editor.tsx` @ fac9ac2.
 *
 * `outOfRangeMessage` là mã RN biên dịch (`build.sh`, `plausible.ts`). Phần tính
 * của màn không export: chép NGUYÊN VĂN `digits` (`:56-60`), ánh xạ của
 * `useFormSeed` (`:91-100`), `num` / `calcKcal` / ba tỉ lệ (`:112-118`),
 * `fieldErrors` / `hasFieldErrors` / `canSave` (`:131-139`, với `saving` /
 * `saved` = false) và `FoodFormData` của `save` (`:143-152`). Chỉ bỏ React
 * (state → đối số). Không chạm dữ liệu thật.
 *
 *   node gen-food-form.mjs > ../../Packages/ASCNDKit/Tests/ASCNDCoreTests/Fixtures/food-form-golden.json
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { outOfRangeMessage } = require('./out/plausible.js');

// food-editor.tsx:56-60
const digits = (v) => {
  const only = v.replace(/[^0-9]/g, '');
  const trimmed = only.replace(/^0+(?=\d)/, '');
  return trimmed;
};

// food-editor.tsx:91-100 (`useFormSeed`, phần ánh xạ)
const seed = (existing) => ({
  name: existing.name ?? '',
  brand: existing.brand ?? '',
  serving: String(Number(existing.serving_g) || 100),
  kcal: String(Math.round(Number(existing.kcal)) || ''),
  protein: String(Math.round(Number(existing.protein_g)) || ''),
  carbs: String(Math.round(Number(existing.carbs_g)) || ''),
  fat: String(Math.round(Number(existing.fat_g)) || ''),
  fiber: String(Math.round(Number(existing.fiber_g)) || ''),
});

// food-editor.tsx:112-118, 131-139, 143-152 (saving = saved = false)
function evaluate({ name, brand, serving, kcal, protein, carbs, fat, fiber }) {
  const num = (v) => Number(v) || 0;
  const calcKcal = Math.round(num(protein) * 4 + num(carbs) * 4 + num(fat) * 9);
  const totalMacroG = num(protein) + num(carbs) + num(fat);
  const proteinPct = totalMacroG > 0 ? Math.round((num(protein) / totalMacroG) * 100) : 0;
  const carbsPct = totalMacroG > 0 ? Math.round((num(carbs) / totalMacroG) * 100) : 0;
  const fatPct = totalMacroG > 0 ? 100 - proteinPct - carbsPct : 0;
  const saving = false, saved = false;
  const T = 'x';
  const fieldErrors = {
    kcal: outOfRangeMessage('meal_kcal', kcal, T),
    protein: outOfRangeMessage('macro_g', protein, T),
    carbs: outOfRangeMessage('macro_g', carbs, T),
    fat: outOfRangeMessage('macro_g', fat, T),
    fiber: outOfRangeMessage('macro_g', fiber, T),
  };
  const hasFieldErrors = Object.values(fieldErrors).some(Boolean);
  const canSave = name.trim().length > 0 && !saving && !saved && !hasFieldErrors;
  const data = {
    name: name.trim(),
    brand: brand.trim(),
    serving_g: num(serving) || 100,
    kcal: num(kcal),
    protein_g: num(protein),
    carbs_g: num(carbs),
    fat_g: num(fat),
    fiber_g: num(fiber),
  };
  return { calcKcal, proteinPct, carbsPct, fatPct, hasFieldErrors, canSave, data };
}

let s = 9527;
const rnd = (n) => {
  s = (s * 1103515245 + 12345) % 2147483648;
  return Math.floor(s / 65536) % n;
};
const pick = (a) => a[rnd(a.length)];

// 1. digits — chuỗi bàn phím / dán.
const RAW = ['', '0', '00', '000', '00040', '40', '12.5', '1,000', '-50', ' 7 ', 'abc', '0a1', '١٢', '１２', '10001', '2000', '0.0', '+3', '1e3'];
const digitCases = [...RAW];
for (let i = 0; i < 120; i++) digitCases.push(Array.from({ length: 1 + rnd(5) }, () => pick(RAW)).join(''));
const digitsGolden = digitCases.map((input) => ({ input, expected: digits(input) }));

// 2. seed — hàng `food_items` đọc về.
const NUMS = [null, 0, 0.4, 0.5, 1, 12.5, 99.5, 100, 150.5, 165.49, 2000, 2000.6, -3, -0.4];
const seeds = [];
for (let i = 0; i < 160; i++) {
  const row = {
    id: `f${i}`, name: pick(['Ức gà', '  Sữa chua ', 'Táo']), brand: pick([null, 'CP', ' Vinamilk ']),
    serving_g: pick(NUMS), kcal: pick(NUMS), protein_g: pick(NUMS), carbs_g: pick(NUMS), fat_g: pick(NUMS),
    fiber_g: pick(NUMS),
  };
  seeds.push({ row, expected: seed(row) });
}

// 3. form — chuỗi trong ô (sau `digits`, hoặc từ seed / dán), cả biên dải.
const GOOD = ['', '0', '4', '12', '12.5', '31', '100', '1999', '2000', ' 7 ', '0.5'];
const EDGE = ['2001', '9999', '10000', '10001', '-1', 'abc', '1e3'];
// Bốn phần năm là ô hợp lệ, để cả nhánh lưu được và hàng ghi cũng được phủ.
const field = () => (rnd(5) ? pick(GOOD) : pick(EDGE));
const forms = [];
for (let i = 0; i < 400; i++) {
  const f = {
    name: pick(['', ' ', 'Ức gà', '  Phở  ']), brand: pick(['', ' CP ', 'Vinamilk']),
    serving: pick(['', '0', '100', '150', '12.5', 'abc']),
    kcal: rnd(3) ? pick(['', '0', '165', '1999', '9999', '10000']) : field(), protein: field(), carbs: field(), fat: field(), fiber: field(),
  };
  forms.push({ form: f, expected: evaluate(f) });
}

process.stdout.write(JSON.stringify({ source: 'fac9ac2', digits: digitsGolden, seeds, forms }, null, 1) + '\n');
