#!/usr/bin/env node
/**
 * Golden cho bảng chỉ số 7 ngày của tab Trợ lý (#527) — CHÍNH
 * `lib/metric-analysis.ts` @ fac9ac2 (`analyse`, `direction`).
 *
 * Bốn loại (readiness / sleep / kcal / hr) × chuỗi điểm lấy mẫu bằng LCG cố
 * định: 0…7 ngày có số, ngày lệch ngoài cửa sổ, giá trị chạm ngưỡng 7 giờ,
 * ±10 % mục tiêu calo, hướng lên / xuống / phẳng (±5 %), median chia đôi.
 * "Hôm nay" theo giờ máy: chạy với TZ=Asia/Ho_Chi_Minh.
 *
 *   ./build.sh && TZ=Asia/Ho_Chi_Minh node gen-metrics.mjs > ../../Packages/ASCNDKit/Tests/ASCNDCoreTests/Fixtures/metrics-golden.json
 */
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
if (process.env.TZ !== 'Asia/Ho_Chi_Minh') throw new Error('TZ=Asia/Ho_Chi_Minh');
const { analyse, direction } = require('./out/metric-analysis.js');

let seed = 2026;
const rnd = (n) => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return Math.floor(seed / 65536) % n;
};
const iso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const VALUES = {
  readiness: [12, 38, 55, 61, 62, 64, 70, 71.5, 88, 100],
  sleep: [240, 380, 419, 420, 421, 450, 455.5, 480, 512, 600],
  kcal: [640, 1600, 1979, 1980, 2000, 2200, 2420, 2421, 3100, 12000],
  hr: [44, 48, 52, 52.4, 55, 58, 61, 63.6, 70, 88],
};
const TODAYS = [new Date(2026, 9, 9, 9, 30), new Date(2026, 0, 1, 23, 59), new Date(2024, 1, 29, 0, 5)];
const cases = [];
for (const kind of ['readiness', 'sleep', 'kcal', 'hr']) {
  for (let i = 0; i < 60; i++) {
    const today = TODAYS[rnd(TODAYS.length)];
    const count = rnd(10); // 0…9 (một số ngày ngoài cửa sổ / trùng)
    const points = [];
    for (let j = 0; j < count; j++) {
      const back = rnd(9) - 1; // -1 (mai) … 7 (ngoài cửa sổ)
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - back);
      points.push({ date: iso(d), value: VALUES[kind][rnd(10)] });
    }
    const kcalTarget = [0, 2200, 1800][rnd(3)];
    const a = analyse({ kind, points, today, kcalTarget });
    cases.push({ kind, today: iso(today), kcalTarget, points, analysis: a });
  }
}
const directions = [
  [], [1, 2, 3], [100, 100, 100, 100], [100, 100, 106, 106], [100, 100, 104, 104], [100, 100, 94, 94],
  [0, 0, 5, 5], [10, 20, 30, 40, 50], [50, 40, 30, 20, 10, 5, 1], [60, 70, 65, 66, 64, 63, 62],
].map((v) => ({ values: v, direction: direction(v) }));
process.stdout.write(JSON.stringify({ cases, directions }, null, 1) + '\n');
