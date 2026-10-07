#!/usr/bin/env node
/**
 * Sinh golden vectors cho Exercise Insights (#419) bằng CHÍNH mã RN @ fac9ac2.
 *
 *   ./build.sh                       # tách + biên dịch lib RN vào ./out
 *   TZ=Asia/Ho_Chi_Minh node gen.mjs > ../../Packages/ASCNDKit/Tests/ASCNDCoreTests/Fixtures/insights-golden.json
 *
 * Không chép công thức nào: `performancesFrom` / `insightsFrom` là bản biên
 * dịch của `native/src/lib/exercise-performance.ts`, `exercise-trend.ts`. Swift
 * phải ra đúng các con số này (`ExerciseInsightGoldenTests`).
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { performancesFrom } = require('./out/exercise-performance.js');
const { insightsFrom } = require('./out/exercise-trend.js');

const NOW = new Date('2026-10-05T07:00:00.000Z'); // 14:00 Sài Gòn, Thứ Hai
const DAY = 86_400_000;
const at = (daysAgo, hour = 18) => {
  const d = new Date(NOW.getTime() - daysAgo * DAY);
  // giờ địa phương cố định để ngày không phụ thuộc giờ chạy
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};
const s = (exerciseName, weight, reps, extra = {}) => ({ exerciseName, weight, reps, ...extra });

const bench = [
  ['b1', 30, [s('Bench Press', 40, 10, { warmup: true }), s('Bench Press', 60, 8), s('Bench Press', 60, 7)]],
  ['b2', 27, [s('Bench Press', 62.5, 8), s('bench  press', 62.5, 6)]],
  ['b3', 24, [s('Bench Press', 65, 6)]],
  ['b4', 20, [s('Bench Press', 65, 8), s('Squat', 100, 5)]],
  ['b5', 17, [s('Bench Press', 67.5, 5), s('Squat', 100, 5)]],
  ['b6', 13, [s('Bench Press', 70, 5), s('Squat', 95, 5)]],
  ['b7', 10, [s('Bench Press', 70, 6), s('Squat', 90, 5)]],
];
const others = [
  ['p1', 26, [s('Pull-up', 0, 8), s('Plank', 0, 0, { durationSec: 45 })]],
  ['p2', 19, [s('Pull-up', 0, 10), s('Plank', 0, 0, { durationSec: 60 })]],
  ['p3', 12, [s('Pull-up', 10, 6), s('Plank', 0, 0, { durationSec: 50 })]],
  ['p4', 5, [s('Pull-up', 0, 12), s('Curl', 12.5, 12), s('Leg Press', 100, 15)]],
  ['c1', 15, [s('Curl', 12.5, 10), s('Leg Press', 100, 12)]],
  ['c2', 8, [s('Curl', 15, 8), s('Row', 60, 8)]],
  ['d1', 50, [s('Deadlift', 140, 3), s('Row', 40, 8)]],
  ['d2', 40, [s('Deadlift', 150, 3), s('Row', 62, 8)]],
  ['o1', 29, [s('OHP', 40, 8)]],
  ['o2', 22, [s('OHP', 40, 8)]],
  ['o3', 16, [s('OHP', '41', '8')]],
  ['o4', 9, [s('OHP', 40.5, 8)]],
  ['o5', 2, [s('OHP', 40, 8), s('', 50, 5), s('Junk', 'x', 'y')]],
];
const row = ([id, daysAgo, sets]) => ({ id, date_time: at(daysAgo), sets });
const multi = [...bench, ...others].map(row).reverse(); // server: mới trước

const weighIns = [
  { date: '2026-09-05', value: 70 },
  { date: '2026-09-20', value: 71.234 },
];

const cases = [
  { name: 'empty', sessions: [], weighIns: [], declaredKinds: {} },
  { name: 'single', sessions: [row(bench[0])], weighIns: [], declaredKinds: {} },
  { name: 'multi', sessions: multi, weighIns, declaredKinds: { curl: 'isolation' } },
  {
    name: 'multi-deleted',
    sessions: multi.filter((r) => r.id !== 'b4' && r.id !== 'p2'),
    weighIns,
    declaredKinds: { curl: 'isolation' },
  },
  { name: 'no-weighins', sessions: multi, weighIns: [], declaredKinds: {} },
  { name: 'later', sessions: multi, weighIns, declaredKinds: { curl: 'isolation' }, now: '2026-11-20T07:00:00.000Z' },
];

const out = cases.map((c) => {
  const now = c.now ? new Date(c.now) : NOW;
  const performances = performancesFrom(c.sessions, { weighIns: c.weighIns, declaredKinds: c.declaredKinds });
  const insights = insightsFrom(performances, now).map(({ generatedAt, ...rest }) => rest);
  return { ...c, now: now.toISOString(), performances, insights };
});
process.stdout.write(JSON.stringify({ source: 'native/src/lib @ fac9ac2', timeZone: 'Asia/Ho_Chi_Minh', cases: out }, null, 1) + '\n');
