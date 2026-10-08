#!/usr/bin/env node
/**
 * Golden cho màn "Tiến bộ từng bài" (#527 Phase 2): `planKeys` của CHÍNH
 * `native/src/lib/plan-exercises.ts` @ fac9ac2 biên dịch, và `groupOf` /
 * `seriesText` / `headline` của `app/exercise-insight.tsx` — chép NGUYÊN VĂN
 * (không hàm nào export) — trên CHÍNH `displayWeight` / `weightLabel`
 * (`lib/units.ts`) biên dịch. Lịch theo giờ Việt Nam (`routineIndex` đọc
 * `getDay()` của máy).
 *
 *   ./build.sh && TZ=Asia/Ho_Chi_Minh node gen-insight-screen.mjs > ../../Packages/ASCNDKit/Tests/ASCNDCoreTests/Fixtures/insight-screen-golden.json
 */
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const { planKeys } = require('./out/plan-exercises.js');
const { displayWeight, weightLabel } = require('./out/units.js');

// --- chép nguyên văn `exercise-insight.tsx:102–142`, `:163–170` ---
const groupOf = (i) => {
  if (i.trend === 'INSUFFICIENT_DATA') return 'thin';
  if (i.trend === 'DECLINING' || i.trend === 'PLATEAU') return 'attention';
  if (i.stale || i.evidence.some((e) => e.kind === 'volatile')) return 'attention';
  return 'fine';
};
function seriesText(values, u) {
  const kg = (n) => `${Math.round(displayWeight(n, u) * 10) / 10} ${weightLabel(u)}`;
  if (values.every((v) => v.durationSec !== null && v.reps === null)) {
    return { prefix: null, parts: values.map((v) => `${Math.round(v.durationSec)}s`) };
  }
  const loads = values.map((v) => (v.bodyweightKg ?? 0) + (v.weightKg ?? 0));
  const same = loads.every((l) => Math.abs(l - loads[0]) < 0.05);
  if (same && loads[0] > 0 && values.every((v) => v.reps !== null)) {
    return { prefix: kg(loads[0]), parts: values.map((v) => String(v.reps)) };
  }
  return {
    prefix: null,
    parts: values.map((v) =>
      v.reps === null
        ? '—'
        : (v.bodyweightKg ?? 0) + (v.weightKg ?? 0) > 0
          ? `${kg((v.bodyweightKg ?? 0) + (v.weightKg ?? 0))} × ${v.reps}`
          : `${v.reps}`,
    ),
  };
}
function headline(i, u) {
  const sets = i.evidence.find((e) => e.kind === 'best-sets');
  const kg1 = (n) => Math.round(displayWeight(n, u) * 10) / 10;
  if (i.bestDurationSec !== null && i.bestReps === null) return `${Math.round(i.bestDurationSec)}s`;
  if (i.bestReps === null) return '—';
  const bw = sets && sets.kind === 'best-sets' ? sets.values[sets.values.length - 1]?.bodyweightKg : null;
  const load = (bw ?? 0) + (i.bestWeightKg ?? 0);
  if (load <= 0) return `${i.bestReps}`;
  return `${kg1(load)} ${weightLabel(u)} × ${i.bestReps}`;
}

// Bộ sinh số giả tất định.
let seed = 20261008;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (a) => a[Math.floor(rnd() * a.length)];

// --- planKeys ---
const names = ['Bench Press', 'bench  press', 'Squat', 'Pull-up', ' Row ', '', 'Plank', 'Deadlift', 'Curl'];
const scope = [];
for (let n = 0; n < 60; n++) {
  const templates = Array.from({ length: 1 + Math.floor(rnd() * 4) }, (_, k) => ({
    id: `t${k}`,
    exercises: Array.from({ length: Math.floor(rnd() * 4) }, () => ({ exerciseName: pick(names) })),
  }));
  if (rnd() < 0.2) templates.push({ id: 't0', exercises: [{ exerciseName: 'Override' }] }); // id trùng: cái sau thắng
  const days = Array.from({ length: Math.floor(rnd() * 8) }, () => ({
    day_of_week: Math.floor(rnd() * 7),
    is_rest: rnd() < 0.2,
    template_id: rnd() < 0.15 ? null : `t${Math.floor(rnd() * 5)}`,
  }));
  const date = `2026-10-${String(1 + Math.floor(rnd() * 28)).padStart(2, '0')}`;
  const now = new Date(`${date}T12:00:00`);
  const out = {};
  for (const s of ['today', 'week', 'all']) {
    const k = planKeys(s, days, templates, now);
    out[s] = k === null ? null : [...k].sort();
  }
  scope.push({ date, days, templates, keys: out });
}

// --- groupOf / headline / seriesText ---
const trends = ['IMPROVING', 'STABLE', 'PLATEAU', 'DECLINING', 'INSUFFICIENT_DATA'];
const set = () => {
  const timed = rnd() < 0.15;
  return {
    weightKg: timed || rnd() < 0.2 ? null : pick([0, 20, 22.5, 60, 61.23, 100]),
    reps: timed ? null : rnd() < 0.1 ? null : pick([1, 5, 8, 10, 12]),
    durationSec: timed ? pick([30, 45, 61]) : null,
    bodyweightKg: rnd() < 0.3 ? pick([70, 82.4]) : null,
  };
};
const cards = [];
for (let n = 0; n < 120; n++) {
  const sameLoad = rnd() < 0.3;
  let values = Array.from({ length: Math.floor(rnd() * 5) }, set);
  if (sameLoad && values.length) values = values.map((v) => ({ ...values[0], reps: pick([6, 8, 10]) }));
  const evidence = [{ kind: 'best-sets', values }];
  if (rnd() < 0.2) evidence.push({ kind: 'volatile', spread: 0.2 });
  const timed = rnd() < 0.1;
  const i = {
    trend: pick(trends),
    stale: rnd() < 0.2,
    bestDurationSec: timed ? pick([30, 90]) : null,
    bestReps: timed ? null : rnd() < 0.1 ? null : pick([3, 8, 12]),
    bestWeightKg: rnd() < 0.3 ? null : pick([0, 40, 62.5, 61.23]),
    evidence,
  };
  cards.push({
    insight: i,
    group: groupOf(i),
    headline: { kg: headline(i, 'kg'), lbs: headline(i, 'lbs') },
    series: { kg: seriesText(values, 'kg'), lbs: seriesText(values, 'lbs') },
  });
}
console.log(JSON.stringify({ scope, cards }, null, 1));
