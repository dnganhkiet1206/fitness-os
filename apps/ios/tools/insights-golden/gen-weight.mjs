#!/usr/bin/env node
/**
 * Golden cho đơn vị cân nặng của luồng tập (#527 1.9-A): `convertWeight` /
 * `displayWeight` / `weightToKg` / `weightLabel` của
 * `native/src/lib/units.ts` @ fac9ac2 — CHÍNH mã RN biên dịch — cùng ba biểu
 * thức màn RN dựng trên chúng (chép nguyên văn, không hàm nào export):
 *
 * - `useUnits` (`hooks/use-units.ts`): `profile?.units_weight === 'lbs' ? 'lbs' : 'kg'`;
 * - ô tạ hạt giống (`day-plan.tsx:1011`): `String(Math.round(displayWeight(kg) * 10) / 10)`;
 * - khối lượng (`day-plan.tsx:1604`, `sessions.tsx:187`): `Math.round(displayWeight(v))`.
 *
 *   ./build.sh && node gen-weight.mjs > ../../Packages/ASCNDKit/Tests/ASCNDCoreTests/Fixtures/weight-golden.json
 */
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const u = require('./out/units.js');

const unitOf = (stored) => (stored === 'lbs' ? 'lbs' : 'kg');
const profiles = ['lbs', 'kg', 'LBS', 'lb', 'Lbs', ' lbs', '', null, undefined, 'pounds'].map((stored) => ({
  stored: stored === undefined ? '<missing>' : stored,
  unit: unitOf(stored),
}));

const kgs = [0, 0.5, 1, 2.5, 20, 22.5, 45.359237, 60, 61.23497, 61.2349, 62.5, 70, 72.5, 100, 100.24, 102.058, 140, 142.88, 180, 0.04535, 0.0453, 1234.5, 48200, 4200.75];
const weights = [];
for (const unit of ['kg', 'lbs']) {
  for (const kg of kgs) {
    const display = u.displayWeight(kg, unit);
    weights.push({
      unit, kg,
      convert: u.convertWeight(kg, unit),
      display,
      label: u.weightLabel(unit),
      text: String(Math.round(display * 10) / 10),
      volume: Math.round(display),
      backToKg: u.weightToKg(display, unit),
    });
  }
}

// Ô gõ theo đơn vị hiển thị → kg lưu, KHÔNG làm tròn (`performed`, `day-plan.tsx:1041`).
const typed = [];
for (const unit of ['kg', 'lbs']) {
  for (const v of [0, 1, 45, 100, 132.3, 135, 135.5, 137.8, 225, 315, 61.2, 0.1, 999.9]) {
    typed.push({ unit, value: v, kg: u.weightToKg(v, unit) });
  }
}

process.stdout.write(JSON.stringify({ source: 'native/src/lib/units.ts @ fac9ac2', lbPerKg: 2.2046226218, profiles, weights, typed }, null, 1) + '\n');
