#!/usr/bin/env node
/**
 * Golden nước uống (#527 Phase 3): chạy CHÍNH `units.ts`, `water-scale.ts`,
 * `water-presets.ts` của RN trên một lưới đầu vào.
 *
 *   ./build.sh
 *   node gen.mjs > ../../Packages/ASCNDKit/Tests/ASCNDCoreTests/Fixtures/water-golden.json
 *
 * Các chuỗi hiển thị của màn (`bigValue`, `targetLabel`, `volumeText`, trung
 * bình) là biểu thức nằm trong `water.tsx` / `water-chart.tsx` chứ không phải
 * hàm xuất ra được; chúng được tính ở đây bằng ĐÚNG biểu thức ấy (ghi dòng bên
 * cạnh) trên hàm RN thật — `toFixed` / `Math.round` là của JS, đúng thứ Swift
 * phải bắt chước (nửa làm tròn LÊN, không phải số chẵn của printf).
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const units = require('./out/units.js');
const scale = require('./out/water-scale.js');
const presets = require('./out/water-presets.js');

const UNITS = ['ml', 'oz'];
// Số ml: tròn, sát ranh làm tròn (x.xx5 L), quy đổi oz, và mức thật trong ngày.
const ML = [0, 1, 5, 236, 250, 295, 300, 330, 354, 473, 500, 750, 1000, 1005, 1015, 1125, 1250, 1375, 1800, 1999,
  2000, 2001, 2250, 2365, 2500, 2700, 2750, 3000, 3549, 4000, 4732, 5125];
// Số người dùng gõ / bấm theo đơn vị hiển thị (`volumeToMl`).
const TYPED = [0.5, 1, 8, 8.5, 12, 16, 33.8, 67.9, 68, 250, 330.4, 330.5, 750, 1999.5, 2000];

const out = {
  presets: Object.fromEntries(UNITS.map((u) => [u, [...presets.waterQuickAmounts(u)]])),
  displayVolume: UNITS.flatMap((u) => ML.map((ml) => ({ ml, unit: u, out: units.displayVolume(ml, u) }))),
  volumeToMl: UNITS.flatMap((u) => TYPED.map((v) => ({ value: v, unit: u, out: units.volumeToMl(v, u) }))),
  scaleTop: UNITS.flatMap((u) => ML.map((ml) => ({ needMl: ml, unit: u, ...scale.scaleTop(ml, u) }))),
  axisLabel: UNITS.flatMap((u) =>
    [0, 8, 16, 24, 32, 250, 500, 750, 1000, 1250, 1500, 2000, 2500, 3000, 3750].map((v) => ({
      value: v, unit: u, out: scale.axisLabel(v, u),
    })),
  ),
  screen: UNITS.flatMap((u) =>
    ML.map((ml) => ({
      ml,
      unit: u,
      // water.tsx: const bigValue = vUnit === 'oz' ? `${displayVolume(todayMl, 'oz')} oz` : `${(todayMl / 1000).toFixed(2)}L`;
      bigValue: u === 'oz' ? `${units.displayVolume(ml, 'oz')} oz` : `${(ml / 1000).toFixed(2)}L`,
      // water.tsx: const targetLabel = vUnit === 'oz' ? `${displayVolume(target, 'oz')} oz` : `${(target / 1000).toFixed(1)}L`;
      targetLabel: u === 'oz' ? `${units.displayVolume(ml, 'oz')} oz` : `${(ml / 1000).toFixed(1)}L`,
      // water-chart.tsx volumeText
      chartVolume: u === 'oz' ? `${Math.round(units.displayVolume(ml, 'oz'))} oz` : `${(ml / 1000).toFixed(2)}L`,
      // water.tsx: displayVolume(Number(l.amount_ml), vUnit)
      entry: `${units.displayVolume(ml, u)}`,
    })),
  ),
  // water-chart.tsx: avg = days.reduce(...) / days.length; avgLabel = oz ? `${displayVolume(avg,'oz')} oz` : `${(avg/1000).toFixed(2)}L`
  average: UNITS.flatMap((u) =>
    [[0, 0, 0, 0, 0, 0, 0], [250, 0, 0, 0, 0, 0, 0], [2500, 2000, 1750, 0, 3000, 1250, 500], [1125, 1125, 1125, 1125, 1125, 1125, 1125],
      [330, 500, 750, 1000, 1005, 1015, 2365]].map((totals) => {
      const avg = totals.reduce((s, t) => s + t, 0) / totals.length;
      return { totals, unit: u, out: u === 'oz' ? `${units.displayVolume(avg, 'oz')} oz` : `${(avg / 1000).toFixed(2)}L` };
    }),
  ),
};

process.stdout.write(JSON.stringify(out, null, 1) + '\n');
