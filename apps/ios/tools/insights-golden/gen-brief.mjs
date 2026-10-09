#!/usr/bin/env node
/**
 * Golden cho lời chào + tóm tắt hôm nay của Trợ lý (#527) — CHÍNH
 * `lib/assistant-brief.ts` @ fac9ac2 (`briefFor`, `givenName`).
 *
 * Tín hiệu lấy mẫu bằng LCG cố định (bit cao) trên lưới chạm mọi ngưỡng
 * (ngủ 420 / 450, ACWR 1.3 / 1.6, 2 ngày nghỉ, calo còn / vượt / chưa ghi,
 * có / không tín hiệu hồi phục), giờ 0…23, tên một / nhiều chữ / quá dài.
 *
 *   ./build.sh && node gen-brief.mjs > ../../Packages/ASCNDKit/Tests/ASCNDCoreTests/Fixtures/brief-golden.json
 */
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const { briefFor, givenName } = require('./out/assistant-brief.js');

const grid = {
  readiness: [null, 40, 66, 85],
  status: [null, 'red', 'yellow', 'green'],
  hasRecovery: [false, true],
  acwr: [null, 0.5, 1.0, 1.3, 1.301, 1.6, 1.61, 2.35],
  sleepMin: [0, 245, 419, 420, 449, 450, 480, 512],
  kcal: [0, 640, 2200, 2199, 3150],
  kcalTarget: [2200, 1800, 2750, 12000],
  proteinG: [0, 98],
  proteinTarget: [140],
  steps: [0, 950, 1234, 12500, 123456],
  daysSinceWorkout: [null, 0, 1, 2, 3, 14],
  name: ['', 'Kiệt', 'Nguyễn Anh Kiệt', '  Maria  José  ', 'Wolfeschlegelsteinhausen Bergerdorff'],
};
let seed = 1206;
const rnd = (n) => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return Math.floor(seed / 65536) % n;
};
const sample = () => Object.fromEntries(Object.keys(grid).map((k) => [k, grid[k][rnd(grid[k].length)]]));
const cases = [];
for (let i = 0; i < 400; i++) {
  const s = sample();
  const hour = rnd(24);
  const b = briefFor(s, hour, true);
  cases.push({ signal: s, hour, greeting: b.greeting, lines: b.lines });
}
const names = grid.name.concat(['A', 'Lê Thị Bảo Ngọc', 'Ana']).map((n) => ({
  name: n, vi: givenName(n, true), en: givenName(n, false),
}));
process.stdout.write(JSON.stringify({ cases, names }, null, 1) + '\n');
