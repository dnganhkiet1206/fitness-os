#!/usr/bin/env node
/**
 * Golden cho đồng bộ Apple Health (#66/HealthKit) — CHÍNH mã RN
 * (`health.ts`: gom giấc ngủ đêm qua, sinh trắc mới nhất, buổi tập từ đồng hồ,
 * tổng hôm nay, lịch sử bước; `step-days.ts`; `health-days.ts`) chạy trên
 * HealthKit giả, ở sáu múi giờ.
 *
 *   ./build.sh && node gen.mjs > ../../Packages/ASCNDKit/Tests/ASCNDCoreTests/Fixtures/health-golden.json
 *
 * Fixture là các mẫu HealthKit ĐÃ trả về cho truy vấn (HealthKit lọc / sắp
 * xếp); golden ghi cả tham số truy vấn RN gửi để Swift hỏi y như vậy.
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const TZS = ['Asia/Ho_Chi_Minh', 'America/Los_Angeles', 'Europe/London', 'Pacific/Auckland', 'America/St_Johns', 'Asia/Kathmandu'];
const NOWS = ['2026-10-27T06:30:00.000Z', '2026-10-25T09:15:00.000Z', '2026-03-29T14:00:00.000Z'];
const self = fileURLToPath(import.meta.url);

if (!process.env.GOLDEN_CHILD) {
  const cases = [];
  for (const tz of TZS) {
    for (const now of NOWS) {
      const out = execFileSync(process.execPath, [self], { env: { ...process.env, TZ: tz, NOW: now, GOLDEN_CHILD: '1' }, maxBuffer: 1 << 26 });
      cases.push(...JSON.parse(String(out)));
    }
  }
  process.stdout.write(JSON.stringify({ cases }));
  process.exit(0);
}

const NOW = Date.parse(process.env.NOW);
const RealDate = Date;
globalThis.Date = class extends RealDate {
  constructor(...a) { if (a.length === 0) super(NOW); else super(...a); }
  static now() { return NOW; }
};
const require = createRequire(import.meta.url);
const health = require('./out/health.js');
const { touchedDays } = require('./out/health-days.js');
const { localDateStr } = require('./out/local-date.js');

let seed = 0;
for (const c of process.env.TZ + process.env.NOW) seed = (seed * 31 + c.charCodeAt(0)) >>> 0;
const r = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const pick = (a) => a[Math.floor(r() * a.length)];
const iso = (ms) => new RealDate(ms).toISOString();
const MIN = 60_000;

function sleepSamples() {
  const out = [];
  // Giấc trưa hôm qua, rồi đêm qua (có thể bị cắt bởi một khoảng thức > 90').
  let t = NOW - (30 + r() * 4) * 3600_000;
  if (r() < 0.5) {
    out.push({ startDate: iso(t), endDate: iso(t + 70 * MIN), value: 1 });
  }
  t = NOW - (9 + r() * 3) * 3600_000;
  const n = Math.floor(r() * 14);
  for (let i = 0; i < n; i++) {
    const len = 5 + Math.floor(r() * 80);
    const s = { startDate: iso(t), endDate: iso(t + len * MIN), value: pick([0, 1, 2, 3, 4, 5, 3, 4]) };
    if (r() < 0.08) s.metadata = { HKExternalUUID: `ascnd:${i}` };
    if (r() < 0.05) s.metadata = { HKExternalUUID: 'other:x' };
    out.push(s);
    t += len * MIN + (r() < 0.1 ? (60 + Math.floor(r() * 90)) * MIN : Math.floor(r() * 3) * MIN);
  }
  return out;
}

function latest() {
  const q = (lo, hi, round = 1) => (r() < 0.2 ? null : { quantity: Math.round((lo + r() * (hi - lo)) * round) / round, startDate: iso(NOW - Math.floor(r() * 6 * 86_400_000)), uuid: r() < 0.1 ? '' : `u-${Math.floor(r() * 1e6)}` });
  const spo2 = r() < 0.5 ? q(0.88, 1, 1000) : q(85, 100);
  const out = {
    HKQuantityTypeIdentifierRestingHeartRate: q(42, 80, 10),
    HKQuantityTypeIdentifierHeartRateVariabilitySDNN: q(15, 120, 10),
    HKQuantityTypeIdentifierOxygenSaturation: spo2 && r() < 0.05 ? { ...spo2, quantity: 0 } : spo2,
    HKQuantityTypeIdentifierRespiratoryRate: q(10, 22, 10),
  };
  if (r() < 0.1) for (const k of Object.keys(out)) out[k] = null;
  return out;
}

function workouts() {
  const out = [];
  for (let i = 0; i < Math.floor(r() * 5); i++) {
    const w = {
      uuid: `w-${Math.floor(r() * 1e6)}`,
      startDate: iso(NOW - Math.floor(r() * 7 * 86_400_000)),
      duration: { quantity: Math.floor(r() * 5400) },
      workoutActivityType: pick([13, 16, 20, 24, 35, 37, 44, 46, 50, 52, 59, 63, 3000, 77, 1]),
    };
    if (r() < 0.7) w.totalEnergyBurned = { quantity: r() * 700 };
    if (r() < 0.1) w.metadata = { HKExternalUUID: 'ascnd:abc' };
    out.push(w);
  }
  return out;
}

function stepBuckets() {
  const out = [];
  const anchor = new Date();
  anchor.setHours(0, 0, 0, 0);
  for (let d = 13; d >= 0; d--) {
    const s = new Date(anchor);
    s.setDate(s.getDate() - d);
    if (r() < 0.1) continue;
    out.push({ startDate: s.toISOString(), sumQuantity: r() < 0.1 ? null : { quantity: r() * 15000 } });
  }
  return out;
}

const cases = [];
for (let k = 0; k < 12; k++) {
  const fixture = {
    sleep: sleepSamples(),
    latest: latest(),
    workouts: workouts(),
    stepBuckets: stepBuckets(),
    totals: {
      HKQuantityTypeIdentifierStepCount: r() < 0.2 ? null : r() * 12000,
      HKQuantityTypeIdentifierActiveEnergyBurned: r() < 0.2 ? null : r() * 900,
      HKQuantityTypeIdentifierAppleExerciseTime: r() < 0.2 ? null : r() * 90,
    },
  };
  globalThis.__hk = fixture;
  globalThis.__hkLog = [];
  const [sleep, bio, recent, stepDays, steps, kcal, minutes] = [
    await health.getLastNightSleep(), await health.getLatestBiometrics(), await health.getRecentWorkouts(),
    await health.getDailyStepHistory(), await health.getTodaySteps(), await health.getTodayActiveEnergy(),
    await health.getTodayExerciseMinutes(),
  ];
  const today = localDateStr();
  cases.push({
    tz: process.env.TZ, now: process.env.NOW, today, fixture, queries: globalThis.__hkLog,
    expected: { sleep, bio, workouts: recent, stepDays, steps, kcal, minutes, touched: touchedDays({ bio, sleep, workouts: recent }, today) },
  });
}
// Tên hoạt động theo ngôn ngữ (mã lạ → "Buổi tập").
cases.push({ names: [13, 16, 20, 24, 35, 37, 44, 46, 50, 52, 59, 63, 3000, 77].flatMap((t) => ['vi', 'en', 'es'].map((l) => ({ type: t, lang: l, name: health.activityName(t, l) }))) });
process.stdout.write(JSON.stringify(cases));
