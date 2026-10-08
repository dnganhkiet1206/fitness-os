#!/usr/bin/env node
/**
 * Golden cho màn huy chương (#527) — CHÍNH `lib/award-grant.ts` @ fac9ac2
 * (`AWARD_DEFINITIONS`, `awardsToGrant`, `isDuplicateAward`, `grantAll`), cộng
 * các biểu thức không export, chép NGUYÊN VĂN (chỉ bỏ kiểu TS):
 *
 * - `currentFor` (`app/awards.tsx:72–86`);
 * - tiến độ huy chương (`app/awards.tsx:128–130`): `pct`, `showCount`;
 * - phần trăm đầu màn (`app/awards.tsx:292`);
 * - mốc trên mặt đĩa (`components/ascnd/medal.tsx:387–388`).
 *
 *   ./build.sh && node gen-awards.mjs > ../../Packages/ASCNDKit/Tests/ASCNDCoreTests/Fixtures/awards-golden.json
 */
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const A = require('./out/award-grant.js');

function currentFor(type, src) {
  if (!src) return null;
  switch (type) {
    case 'streak': return src.streak;
    case 'volume_milestone':
    case 'first_workout': return src.workoutCount;
    case 'pr': return src.prCount;
    case 'steps_goal': return src.steps;
    case 'nutrition': return src.mealCount;
    case 'water': return src.waterDays;
    case 'sleep': return src.sleepCount;
    case 'body': return src.weighCount;
    default: return null;
  }
}

const ALL_NULL = { streak: null, workoutCount: null, prCount: null, steps: null, mealCount: null, waterDays: null, sleepCount: null, weighCount: null };
const sourceCases = [
  ALL_NULL,
  { streak: 0, workoutCount: 0, prCount: 0, steps: 0, mealCount: 0, waterDays: 0, sleepCount: 0, weighCount: 0 },
  { ...ALL_NULL, streak: 3 },
  { ...ALL_NULL, streak: 2 },
  { ...ALL_NULL, streak: 400 },
  { ...ALL_NULL, streak: 29.9 },
  { ...ALL_NULL, workoutCount: 1 },
  { ...ALL_NULL, workoutCount: 10, prCount: 1 },
  { ...ALL_NULL, workoutCount: 99, prCount: 5 },
  { ...ALL_NULL, workoutCount: 100, prCount: 4 },
  { ...ALL_NULL, steps: 9999 },
  { ...ALL_NULL, steps: 10000 },
  { ...ALL_NULL, steps: 15000 },
  { ...ALL_NULL, steps: 25000 },
  { ...ALL_NULL, mealCount: 1, waterDays: 7, sleepCount: 30, weighCount: 200 },
  { ...ALL_NULL, mealCount: 249, waterDays: 29, sleepCount: 6, weighCount: 9 },
  { ...ALL_NULL, mealCount: 250, waterDays: 100, sleepCount: 100, weighCount: 50 },
  { streak: 14, workoutCount: 50, prCount: 7, steps: 20000, mealCount: 50, waterDays: 30, sleepCount: 7, weighCount: 10 },
];
const earnedSets = [[], ['streak_3', 'first_workout', 'workouts_10'], ['meals_50', 'steps_10k', 'first_pr', 'unknown_key']];

const grant = [];
for (const s of sourceCases) {
  for (const e of earnedSets) {
    grant.push({ sources: s, earned: e, grant: A.awardsToGrant(s, new Set(e)).map((d) => d.key) });
  }
}

const duplicate = [
  { error: { code: '23505', message: 'duplicate key value violates unique constraint' } },
  { error: { code: '23503', message: 'duplicate' } },
  { error: { code: null } },
  { error: null },
].map((c) => ({ code: c.error?.code ?? null, duplicate: A.isDuplicateAward(c.error) }));

// `grantAll`: cái hỏng ở giữa không chạm hai bên.
const defs = A.AWARD_DEFINITIONS.slice(0, 6);
const failOn = new Set(['streak_7', 'streak_30']);
const all = await A.grantAll(defs, async (d) => {
  if (failOn.has(d.key)) throw new Error('refused');
});
const grantAll = { keys: defs.map((d) => d.key), failOn: [...failOn], ...all };

const progress = [];
for (const d of A.AWARD_DEFINITIONS) {
  for (const earned of [false, true]) {
    for (const current of [null, 0, 1, 5, 12, 99, 100, 20000, -3]) {
      const need = 'requirement' in d ? d.requirement : null;
      const pct = earned || need == null || current == null ? 0 : Math.max(0, Math.min(1, current / need));
      const showCount = !earned && need != null && current != null;
      progress.push({ key: d.key, earned, current, pct, showCount });
    }
  }
}
const current = [];
for (const type of ['streak', 'volume_milestone', 'first_workout', 'pr', 'steps_goal', 'nutrition', 'water', 'sleep', 'body', 'other']) {
  current.push({ type, value: currentFor(type, sourceCases[17]), none: currentFor(type, undefined) });
}
const percent = [0, 1, 2, 7, 14, 15, 28, 29].map((earned) => {
  const totalCount = A.AWARD_DEFINITIONS.length;
  return { earned, pct: totalCount > 0 ? Math.round((earned / totalCount) * 100) : 0 };
});
const mark = [null, 1, 3, 100, 365, 999, 1000, 1499, 1500, 10000, 15000, 20000].map((requirement) => ({
  requirement,
  mark: requirement == null ? null : requirement >= 1000 ? `${Math.round(requirement / 1000)}K` : String(requirement),
}));

const catalogue = A.AWARD_DEFINITIONS.map((d) => ({
  key: d.key, type: d.type, icon: d.icon, tier: d.tier, requirement: 'requirement' in d ? d.requirement : null,
}));
process.stdout.write(JSON.stringify({ catalogue, grant, duplicate, grantAll, progress, current, percent, mark }, null, 1) + '\n');
