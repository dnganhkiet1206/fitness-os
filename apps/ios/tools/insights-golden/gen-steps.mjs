#!/usr/bin/env node
/**
 * Golden cho màn Vận động (#527) — `app/steps.tsx` @ fac9ac2.
 *
 * Phần tính của màn không export: chép NGUYÊN VĂN `stats` (`:29-43`), `pct`,
 * `maxWeek` (`:44-45`), `setStepsGoal` (`use-steps-goal.ts`) và phép đọc hàng
 * của `useStepsHistory` (`Number(d.steps) || 0`). Lịch sử lấy mẫu bằng LCG cố
 * định: 0…15 hàng, có / không có hàng hôm nay, bước 0 / chuỗi / null.
 *
 *   node gen-steps.mjs > ../../Packages/ASCNDKit/Tests/ASCNDCoreTests/Fixtures/steps-golden.json
 */
let seed = 1012;
const rnd = (n) => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return Math.floor(seed / 65536) % n;
};
const iso = (d) =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
const TODAY = '2026-10-09';
const STEP_VALUES = [0, 312, 2500, 4000, 7999, 8000, 10000, 12345, 25000, null, '6500', 'abc'];

// steps.tsx:29-43
function stats(history, todayStr) {
  const h = history ?? [];
  const last7 = h.slice(-7);
  const today = h.find((d) => d.date === todayStr)?.steps ?? 0;
  const avg = last7.length > 0 ? Math.round(last7.reduce((s, d) => s + d.steps, 0) / last7.length) : 0;
  const recent3 = h.slice(-3).map((d) => d.steps);
  const older3 = h.slice(-6, -3).map((d) => d.steps);
  const avgR = recent3.length ? recent3.reduce((a, b) => a + b, 0) / recent3.length : 0;
  const avgO = older3.length ? older3.reduce((a, b) => a + b, 0) / older3.length : 0;
  const trend = avgO > 0 ? ((avgR - avgO) / avgO) * 100 : 0;
  return { today, avg, last7, trend };
}
// use-steps-goal.ts
const clampGoal = (value) => Math.max(1000, Math.min(50000, Math.round(value)));

const cases = [];
for (let i = 0; i < 200; i++) {
  const n = rnd(16);
  const withToday = rnd(3) > 0;
  const rows = [];
  for (let k = n - 1; k >= (withToday ? 0 : 1); k--) {
    if (rnd(5) === 0) continue; // ngày không có hàng
    const d = new Date(Date.UTC(2026, 9, 9 - k));
    rows.push({ date: iso(d), steps: STEP_VALUES[rnd(STEP_VALUES.length)] });
  }
  const history = rows.map((d) => ({ date: d.date, steps: Number(d.steps) || 0 }));
  const goal = [10000, 1000, 6500, 50000, 8000][rnd(5)];
  const s = stats(history, TODAY);
  const pct = Math.min(100, (s.today / goal) * 100);
  const maxWeek = Math.max(goal, ...s.last7.map((d) => d.steps));
  cases.push({
    rows, goal, today: s.today, avg: s.avg, last7: s.last7.map((d) => d.date),
    trend: s.trend, trendRounded: Math.round(s.trend), pct, pctRounded: Math.round(pct), maxWeek,
  });
}
const goals = [999, 1000, 1250, 49999.6, 50000, 50001, 10000 - 500, -3, 1749.5].map((v) => ({ value: v, goal: clampGoal(v) }));
process.stdout.write(JSON.stringify({ today: TODAY, cases, goals }, null, 1) + '\n');
