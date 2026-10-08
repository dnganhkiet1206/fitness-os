#!/usr/bin/env node
/**
 * Golden cho dải "Lần trước" (#527 Phase 2): `lastSetText` và phần trăm của
 * `components/ascnd/exercise-progress.tsx` @ fac9ac2 — chép NGUYÊN VĂN (không
 * export) — trên CHÍNH `fillCopy` (`lib/copy-fill.ts`) và `displayWeight` /
 * `weightLabel` (`lib/units.ts`) biên dịch. Chữ tiếng Anh của
 * `native-strings.ts` (`nRepsN`, `nRdBodyweight`).
 *
 *   ./build.sh && node gen-progress.mjs > ../../Packages/ASCNDKit/Tests/ASCNDCoreTests/Fixtures/progress-golden.json
 */
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const { fillCopy } = require('./out/copy-fill.js');
const { displayWeight, weightLabel } = require('./out/units.js');
const i18n = { nRepsN: '{n} {n:rep|reps}', nRdBodyweight: 'Bodyweight' };

// --- chép nguyên văn `exercise-progress.tsx` (`lastSetText`, `pct`) ---
function lastSetText(p, u, i18n) {
  if (p.bestDurationSec !== null && p.bestReps === null) return `${Math.round(p.bestDurationSec)}s`;
  if (p.bestReps === null) return null;
  const kg = (n) => Math.round(displayWeight(n, u) * 10) / 10;
  const load = (p.bodyweightKg ?? 0) * (p.kind === 'bodyweight' ? 1 : 0) + (p.bestWeightKg ?? 0);
  if (load <= 0) return `${fillCopy(i18n.nRepsN, { n: String(p.bestReps) })} × ${i18n.nRdBodyweight.toLowerCase()}`;
  return `${kg(load)} ${weightLabel(u)} × ${fillCopy(i18n.nRepsN, { n: String(p.bestReps) })}`;
}
const pctOf = (insight) => (insight && insight.changePct !== null ? Math.round(insight.changePct * 100) : null);

let seed = 20261008;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const performances = [];
for (let n = 0; n < 150; n++) {
  const timed = rnd() < 0.15;
  const p = {
    kind: pick(['compound', 'isolation', 'bodyweight', 'timed']),
    bestDurationSec: timed || rnd() < 0.05 ? pick([20, 45, 61]) : null,
    bestReps: timed ? null : rnd() < 0.1 ? null : pick([1, 2, 5, 8, 12]),
    bestWeightKg: rnd() < 0.3 ? null : pick([0, 2.5, 20, 61.23, 100, 102.06]),
    bodyweightKg: rnd() < 0.4 ? pick([70, 82.4]) : null,
  };
  performances.push({ performance: p, text: { kg: lastSetText(p, 'kg', i18n), lbs: lastSetText(p, 'lbs', i18n) } });
}
const percents = [null, 0, 0.004, 0.005, -0.005, -0.006, 0.0349, 0.125, -0.0849, 1.5].map((changePct) => ({
  changePct,
  pct: pctOf({ changePct }),
}));
console.log(JSON.stringify({ performances, percents }, null, 1));
