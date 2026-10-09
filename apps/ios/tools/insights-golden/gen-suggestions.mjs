#!/usr/bin/env node
/**
 * Golden cho chip gợi ý của Trợ lý / AI Coach (#527) — CHÍNH
 * `lib/assistant-suggestions.ts` @ fac9ac2 (`suggestionsFor`).
 *
 * Tín hiệu lấy mẫu bằng LCG cố định trên lưới giá trị chạm mọi ngưỡng
 * (ACWR 0.65 / 0.8 / 1.3 / 1.6, ngủ 420 / 450, bước 4000, đạm 70 %, còn
 * 200 kcal, 3 ngày nghỉ) + vài ca chọn tay. `toLocaleString` của số bước ghim
 * en-US (Hermes theo máy) — phía Swift so bằng cách nhóm số en-US.
 *
 *   ./build.sh && node gen-suggestions.mjs > ../../Packages/ASCNDKit/Tests/ASCNDCoreTests/Fixtures/suggestions-golden.json
 */
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const plain = Number.prototype.toLocaleString;
Number.prototype.toLocaleString = function () {
  return plain.call(this, 'en-US');
};
const { suggestionsFor } = require('./out/assistant-suggestions.js');

const grid = {
  readiness: [null, 31, 58, 64, 88],
  status: [null, 'red', 'yellow', 'green'],
  acwr: [null, 0.5, 0.649, 0.65, 0.7, 0.8, 1.0, 1.3, 1.301, 1.45, 1.6, 1.61, 2.2],
  sleepMin: [0, 245, 419, 420, 449, 450, 512],
  kcal: [0, 640, 1999, 2001, 2600],
  kcalTarget: [2200, 1800, 2750],
  proteinG: [0, 41.6, 97.9, 98, 150.4],
  proteinTarget: [0, 140, 112.5],
  steps: [0, 950, 3999, 4000, 1234, 12500],
  daysSinceWorkout: [null, 0, 1, 2, 3, 14],
};
let seed = 527;
const rnd = (n) => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return Math.floor(seed / 65536) % n; // bit cao: bit thấp của LCG lặp chu kỳ ngắn
};
const pick = (k) => grid[k][rnd(grid[k].length)];
const sample = () => Object.fromEntries(Object.keys(grid).map((k) => [k, pick(k)]));
const base = {
  readiness: null, status: null, hasRecovery: false, acwr: null, sleepMin: 0, kcal: 0, kcalTarget: 2200,
  proteinG: 0, proteinTarget: 140, steps: 0, name: '', daysSinceWorkout: null,
};
const signals = [
  base,
  // Không luật dữ liệu nào bắn: bốn chip chung (`weekly-plan` là chip thứ tư).
  { ...base, sleepMin: 430, kcal: 2100, proteinG: 130 },
  // Ngày tốt: bốn chủ đề từ dữ liệu.
  { ...base, readiness: 84, status: 'green', acwr: 1.05, sleepMin: 480, kcal: 900, proteinG: 120, daysSinceWorkout: 0 },
  // Ngày xấu: đỏ + tải vọt + ngủ ít — mỗi chủ đề một chip.
  { ...base, readiness: 38, status: 'red', acwr: 1.9, sleepMin: 300, kcal: 500, proteinG: 20, steps: 2100 },
];
for (let i = 0; i < 400; i++) signals.push({ ...base, ...sample() });

const cases = signals.map((s) => ({
  signal: s,
  chips: suggestionsFor(s).map((c) => ({
    key: c.key, topic: c.topic, glyph: c.glyph, label: { vi: c.label.vi, en: c.label.en },
    question: { vi: c.question.vi, en: c.question.en },
  })),
}));
process.stdout.write(JSON.stringify(cases, null, 1) + '\n');
