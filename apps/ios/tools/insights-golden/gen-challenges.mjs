#!/usr/bin/env node
/**
 * Golden cho thử thách tuần (#527) — CHÍNH `lib/challenge-progress.ts`
 * (`challengeStep`) và `lib/macro-targets.ts` (`macroTargetsFor`) @ fac9ac2,
 * cộng các biểu thức không export của `hooks/use-extras.ts`, chép NGUYÊN VĂN
 * (chỉ bỏ kiểu TS):
 *
 * - `CHALLENGE_POOL` + `pickChallengesForWeek` (`:396–418`);
 * - ngưỡng theo hồ sơ (`:509–511`);
 * - phép đo của từng khoá (`:551–645`) trên hàng đã đọc.
 *
 *   ./build.sh && node gen-challenges.mjs > ../../Packages/ASCNDKit/Tests/ASCNDCoreTests/Fixtures/challenges-golden.json
 */
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const P = require('./out/challenge-progress.js');
const M = require('./out/macro-targets.js');

const CHALLENGE_POOL = [
  { key: 'workouts_5', icon: 'dumbbell', target: 5, tier: 'silver' },
  { key: 'workouts_3', icon: 'dumbbell', target: 3, tier: 'bronze' },
  { key: 'protein_7', icon: 'beef', target: 7, tier: 'gold' },
  { key: 'steps_50k', icon: 'footprints', target: 50000, tier: 'silver' },
  { key: 'sleep_7', icon: 'moon', target: 7, tier: 'silver' },
  { key: 'log_7', icon: 'target', target: 7, tier: 'gold' },
  { key: 'calories_5', icon: 'target', target: 5, tier: 'silver' },
  { key: 'water_7', icon: 'droplets', target: 7, tier: 'silver' },
];

function pickChallengesForWeek(weekStart) {
  const seed = weekStart.replace(/-/g, '');
  const num = parseInt(seed, 10) % CHALLENGE_POOL.length;
  const picked = [];
  for (let i = 0; i < 3; i++) {
    picked.push(CHALLENGE_POOL[(num + i) % CHALLENGE_POOL.length]);
  }
  return picked;
}

const pool = CHALLENGE_POOL;
const weeks = ['2026-01-05', '2026-03-30', '2026-10-05', '2026-10-12', '2026-12-28', '2027-01-04', '2025-12-29', '2026-06-01'];
const pick = weeks.map((w) => ({ weekStart: w, keys: pickChallengesForWeek(w).map((c) => c.key) }));

function targetsFor(profile) {
  const sleepTargetMin = Math.round((Number(profile?.sleep_target_hours) || 8) * 60);
  const waterTargetMl = Number(profile?.water_target_ml) || 2500;
  const proteinTargetG = M.macroTargetsFor(profile).protein;
  return { sleepTargetMin, waterTargetMl, proteinTargetG };
}
const profiles = [
  null,
  {},
  { sleep_target_hours: 7.5, water_target_ml: 3000, macro_protein_g: 150 },
  { sleep_target_hours: '6.25', water_target_ml: '0', macro_protein_g: '0' },
  { sleep_target_hours: 0, water_target_ml: null, macro_protein_g: '' },
  { sleep_target_hours: 9, water_target_ml: 3500, macro_protein_g: -5 },
];
const targets = profiles.map((p) => ({ profile: p, ...targetsFor(p) }));

function measure(key, logs, { sleepTargetMin, waterTargetMl, proteinTargetG }) {
  let newValue = 0;
  if (key.startsWith('workouts_')) {
    newValue = logs.length ?? 0;
  } else if (key === 'log_7') {
    newValue = logs?.length ?? 0;
  } else if (key === 'steps_50k') {
    newValue = (logs ?? []).reduce((sum, l) => sum + (l.steps ?? 0), 0);
  } else if (key === 'sleep_7') {
    newValue = (logs ?? []).filter((l) => (l.sleep_duration_min ?? 0) >= sleepTargetMin).length;
  } else if (key === 'protein_7') {
    newValue = (logs ?? []).filter((l) => (Number(l.protein_g) || 0) >= proteinTargetG).length;
  } else if (key === 'calories_5') {
    newValue = (logs ?? []).filter((l) => (Number(l.kcal) || 0) > 500).length;
  } else if (key === 'water_7') {
    const byDate = new Map();
    (logs ?? []).forEach((l) => {
      byDate.set(l.date, (byDate.get(l.date) ?? 0) + l.amount_ml);
    });
    newValue = [...byDate.values()].filter((v) => v >= waterTargetMl).length;
  }
  return newValue;
}

const daily = [
  { date: '2026-10-05', steps: 12000, sleep_duration_min: 480, protein_g: 150, kcal: 2100 },
  { date: '2026-10-06', steps: null, sleep_duration_min: 450, protein_g: '149', kcal: '500' },
  { date: '2026-10-07', steps: 8000, sleep_duration_min: null, protein_g: null, kcal: 501 },
  { date: '2026-10-08', steps: 31000, sleep_duration_min: 360, protein_g: 'x', kcal: null },
  { date: '2026-10-09', steps: 0, sleep_duration_min: 600, protein_g: 200, kcal: 2800 },
];
const water = [
  { date: '2026-10-05', amount_ml: 2000 },
  { date: '2026-10-05', amount_ml: 500 },
  { date: '2026-10-06', amount_ml: 2499 },
  { date: '2026-10-07', amount_ml: 3000 },
  { date: '2026-10-08', amount_ml: 1500 },
  { date: '2026-10-08', amount_ml: 1500 },
];
const workouts = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
const logged = [{ date: '2026-10-05' }, { date: '2026-10-06' }];
const rowsFor = (key) =>
  key.startsWith('workouts_') ? workouts : key === 'log_7' ? logged : key === 'water_7' ? water : daily;
const keys = [...pool.map((p) => p.key), 'mystery_1'];
const measured = [];
for (const t of targets) {
  for (const key of keys) {
    measured.push({ key, profile: t.profile, value: measure(key, rowsFor(key), t) });
  }
}

const stepCases = [];
const rows = [
  { current_value: 0, target_value: 5, completed: false, completed_at: null },
  { current_value: 4, target_value: 5, completed: false, completed_at: null },
  { current_value: 5, target_value: 5, completed: true, completed_at: '2026-10-07T10:00:00Z' },
  { current_value: 4, target_value: 5, completed: false, completed_at: '2026-10-07T10:00:00Z' },
  { current_value: 3, target_value: 0, completed: false, completed_at: null },
  { current_value: 7, target_value: 7, completed: false, completed_at: '' },
];
for (const r of rows) {
  for (const v of [-2, 0, 3, 4, 5, 6, 7, 50001, NaN]) {
    stepCases.push({ row: r, newValue: Number.isNaN(v) ? null : v, step: P.challengeStep(r, v) });
  }
}

const display = [
  [0, 5], [3, 5], [9, 5], [2, 3], [1, 0], [33333, 50000], [6, 7],
].map(([current, target]) => {
  const t = Number(target) || 1;
  const c = Math.min(Number(current) || 0, t);
  return { current, target, shown: c, of: t, pct: Math.round((c / t) * 100) };
});

process.stdout.write(
  JSON.stringify({ pool, pick, targets, measured, step: stepCases, display }, null, 1) + '\n',
);
