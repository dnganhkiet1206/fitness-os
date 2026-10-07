#!/usr/bin/env node
/**
 * Golden cho `recomputeDailyLog` (#266) — chạy CHÍNH mã RN (`native/src/lib`)
 * (`daily-log-service.ts` + `readiness-engine.ts` + `session-load.ts` +
 * `training-card.ts` + `local-date.ts`) trên một Supabase giả trong bộ nhớ.
 *
 *   ./build.sh
 *   node gen.mjs > ../../Packages/ASCNDKit/Tests/ASCNDCoreTests/Fixtures/daily-log-golden.json
 *
 * Mỗi múi giờ chạy trong một process con (`TZ=…`): `local-date.ts` dựng ngày
 * bằng `Date` địa phương, nên múi giờ phải là của process. `new Date()` bị
 * đóng đinh ở NOW (`chronicDays` đọc đồng hồ thật).
 *
 * Ghi lại cho từng ca: bảng trước khi chạy, hàng `daily_logs` RN ghi (insert
 * hay update), và các cửa sổ thời gian RN hỏi — Swift phải hỏi đúng các cửa sổ
 * ấy và ghi đúng hàng ấy (`DailyLogGoldenTests`).
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const TZS = ['Asia/Ho_Chi_Minh', 'America/Los_Angeles', 'Europe/London', 'Pacific/Auckland', 'America/St_Johns', 'Asia/Kathmandu'];
// Hai ngày sau khi Anh lùi giờ (25/10/2026 dài 25 giờ); Auckland đã sang giờ hè.
const NOW_ISO = '2026-10-27T09:30:00.000Z';
const USER = 'u-1';
const self = fileURLToPath(import.meta.url);

if (!process.env.GOLDEN_CHILD) {
  const cases = [];
  let scenarios = null;
  for (const tz of TZS) {
    const out = JSON.parse(String(execFileSync(process.execPath, [self], { env: { ...process.env, TZ: tz, GOLDEN_CHILD: '1' }, maxBuffer: 1 << 28 })));
    // Dữ liệu không phụ thuộc múi giờ: ghi MỘT lần, và kiểm điều đó.
    if (scenarios && JSON.stringify(scenarios) !== JSON.stringify(out.scenarios)) throw new Error(`bảng lệch ở ${tz}`);
    scenarios = out.scenarios;
    cases.push(...out.cases);
  }
  process.stdout.write(JSON.stringify({ now: NOW_ISO, userId: USER, scenarios, cases }));
  process.exit(0);
}

// ── process con: một múi giờ ──
const NOW = Date.parse(NOW_ISO);
const RealDate = Date;
globalThis.Date = class extends RealDate {
  constructor(...a) { if (a.length === 0) super(NOW); else super(...a); }
  static now() { return NOW; }
};

const require = createRequire(import.meta.url);
const { recomputeDailyLog } = require('./out/daily-log-service.js');
const { localDateStr, shiftLocalDate } = require('./out/local-date.js');

const DAY = 86_400_000;
const iso = (ms) => new RealDate(ms).toISOString();

/** PRNG xác định — cùng hạt, cùng dữ liệu ở mọi máy. */
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
const pick = (r, a) => a[Math.floor(r() * a.length)];
const round1 = (x) => Math.round(x * 10) / 10;

/** Một buổi: `sets` dạng app ghi (reps số / chuỗi), RPE có thể thiếu. */
function session(r, id, ms, { rpe, empty } = {}) {
  const n = empty ? 0 : 1 + Math.floor(r() * 6);
  const sets = [];
  for (let i = 0; i < n; i++) {
    const reps = pick(r, [5, 8, 10, 12, '8', '45s', 0, '']);
    sets.push({ exerciseName: pick(r, ['Bench Press', 'Squat', 'Pull-up']), setIndex: i + 1, weight: pick(r, [0, 20, 60, 62.5]), reps });
  }
  return {
    id, user_id: USER, date_time: iso(ms), sets,
    volume_load: Math.round(r() * 4000),
    session_rpe: rpe === undefined ? pick(r, [null, 0, 6, 7, 8, 9, 10, 11]) : rpe,
  };
}

function scenario(name, seed, opts = {}) {
  const r = rng(seed);
  const t = { meal_entries: [], workout_sessions: [], sleep_logs: [], supplements: [], supplement_intake_logs: [], biometric_samples: [], profiles: [], water_logs: [], daily_logs: [] };
  const span = opts.days ?? 35;
  for (let d = -span; d <= 3; d++) {
    const base = NOW + d * DAY;
    if (!opts.noMeals && r() < 0.8) {
      for (let k = 0; k < 1 + Math.floor(r() * 3); k++) {
        t.meal_entries.push({ id: `m${d}_${k}`, user_id: USER, date_time: iso(base - Math.floor(r() * DAY)), total_kcal: round1(200 + r() * 700), total_protein_g: round1(r() * 50), total_carbs_g: round1(r() * 90), total_fat_g: round1(r() * 30), total_fiber_g: r() < 0.2 ? null : round1(r() * 12) });
      }
    }
    if (!opts.noTraining && r() < (opts.trainP ?? 0.5)) {
      t.workout_sessions.push(session(r, `w${d}`, base - Math.floor(r() * DAY), { rpe: opts.rpe, empty: r() < 0.1 }));
    }
    if (!opts.noSleep && r() < 0.85) {
      const wake = base - Math.floor(r() * DAY);
      const mins = opts.shortSleep ? 150 + Math.floor(r() * 80) : 300 + Math.floor(r() * 260);
      t.sleep_logs.push({ id: `s${d}`, user_id: USER, bedtime: iso(wake - mins * 60_000), waketime: iso(wake), quality: r() < 0.2 ? null : 1 + Math.floor(r() * 10), light_min: null, deep_min: null, rem_min: null, asleep_min: r() < 0.4 ? mins - Math.floor(r() * 40) : null });
      if (r() < 0.25) {
        // Ngủ trưa: hàng thứ hai cùng ngày — `mainSleep` lấy giấc DÀI nhất.
        const nap = wake + 6 * 3_600_000;
        t.sleep_logs.push({ id: `n${d}`, user_id: USER, bedtime: iso(nap - 90 * 60_000), waketime: iso(nap), quality: 6, light_min: null, deep_min: null, rem_min: null, asleep_min: null });
      }
    }
    if (!opts.noBio && r() < 0.7) {
      const family = opts.family ?? (r() < 0.5 ? 'sdnn' : 'rmssd');
      t.biometric_samples.push({
        id: `b${d}`, user_id: USER, date_time: iso(base - Math.floor(r() * DAY)),
        hr_bpm: r() < 0.15 ? null : 48 + Math.floor(r() * 25),
        hrv_rmssd_ms: family === 'rmssd' || r() < 0.2 ? round1(20 + r() * 80) : null,
        hrv_sdnn_ms: family === 'sdnn' ? round1(25 + r() * 90) : null,
        soreness_1_10: opts.soreness ?? (r() < 0.3 ? 1 + Math.floor(r() * 10) : null),
        illness_flag: opts.illness ?? r() < 0.05,
      });
    }
    if (r() < 0.6) t.water_logs.push({ id: `wa${d}`, user_id: USER, amount_ml: 250 * (1 + Math.floor(r() * 4)), date: iso(base).slice(0, 10) });
  }
  for (let i = 0; i < (opts.supplements ?? 2); i++) t.supplements.push({ id: `sup${i}`, user_id: USER });
  for (let d = -3; d <= 0; d++) if (r() < 0.7) t.supplement_intake_logs.push({ id: `si${d}`, user_id: USER, taken: r() < 0.8, date_time: iso(NOW + d * DAY - Math.floor(r() * DAY)) });
  if (!opts.noProfile) t.profiles.push({ user_id: USER, sleep_target_hours: opts.sleepTarget ?? pick(r, [7, 7.5, 8, 9, null]) });
  return { name, tables: t, existing: opts.existing, fail: opts.fail };
}

const SCENARIOS = [
  scenario('full', 11),
  scenario('rmssd-only', 12, { family: 'rmssd' }),
  scenario('sdnn-only', 13, { family: 'sdnn' }),
  scenario('empty', 14, { noMeals: true, noTraining: true, noSleep: true, noBio: true, supplements: 0, noProfile: true }),
  scenario('load-only', 15, { noSleep: true, noBio: true, rpe: 8, trainP: 0.6 }),
  scenario('new-user-5-days', 16, { days: 5, trainP: 0.9, rpe: 7 }),
  scenario('illness-soreness', 17, { illness: true, soreness: 8 }),
  scenario('short-sleep', 18, { shortSleep: true }),
  scenario('no-profile', 19, { noProfile: true }),
  scenario('watch-imports', 20, { rpe: null }),
  scenario('existing-row', 21, { existing: true }),
  scenario('rested-no-training', 22, { noTraining: true, family: 'sdnn', sleepTarget: 7 }),
  // Một nguồn đọc lỗi: KHÔNG được ghi gì (`DailyLogRebuildError`).
  scenario('read-fails', 23, { fail: ['sleep_logs'] }),
  ...Array.from({ length: 6 }, (_, i) => scenario(`seed-${i}`, 100 + i)),
];

const today = localDateStr(new Date());
const DATES = [today, shiftLocalDate(today, -1), shiftLocalDate(today, -5), '2026-10-25'];

const out = [];
const scenarios = {};
for (const sc of SCENARIOS) {
  scenarios[sc.name] = sc.tables;
  for (const date of DATES) {
    const tables = structuredClone(sc.tables);
    if (sc.existing) tables.daily_logs.push({ id: 'dl-old', user_id: USER, date, updated_at: '2026-10-20T01:02:03.456789+00:00', kcal: 1 });
    const before = structuredClone(tables);
    void before.daily_logs;
    globalThis.__tables = tables;
    globalThis.__log = [];
    globalThis.__failTables = sc.fail;
    let error = null;
    try {
      await recomputeDailyLog(USER, date);
    } catch (e) {
      error = e.name;
    }
    const writes = globalThis.__log.filter((q) => q.write);
    const reads = globalThis.__log.filter((q) => !q.write).map(({ table, columns, filters, order, limit, mode }) => ({ table, columns, filters, order, limit, mode }));
    out.push({
      scenario: sc.name, tz: process.env.TZ, date, existing: before.daily_logs[0] ?? null, error,
      reads, write: writes.map((w) => ({ kind: w.write.kind, row: w.write.row, filters: w.filters })),
    });
  }
}
process.stdout.write(JSON.stringify({ scenarios, cases: out }));
