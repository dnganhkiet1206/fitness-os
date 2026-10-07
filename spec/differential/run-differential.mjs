#!/usr/bin/env node
/**
 * Differential runner RN ↔ native cho A11/A12 (#373 D-21).
 *
 * Cùng fixtures chuẩn (từ spec/vectors/personal-record.json) chạy qua:
 *  - RN:    native/src/lib/personal-record.ts (bestsFrom + findRecords) — thật
 *  - Native: PersonalRecords.bests/findRecords — thật, qua DifferentialHarness
 *
 * So sánh từng case; khác biệt đã ghi trong expected-differences.json thì
 * đánh dấu documented, còn lại là undocumented → exit 1.
 * Báo cáo machine-readable ra stdout (JSON).
 *
 * Chạy: node spec/differential/run-differential.mjs [thư-mục-vectors]
 * Yêu cầu: swift toolchain trong PATH (như các test Swift khác).
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const NATIVE = path.join(ROOT, 'native');
const KIT = path.join(ROOT, 'apps/ios/Packages/ASCNDKit');
const VECTORS_DIR = process.argv[2] ?? path.join(ROOT, 'spec', 'vectors');

const vectors = JSON.parse(readFileSync(path.join(VECTORS_DIR, 'personal-record.json'), 'utf8'));
const expectedDiffs = JSON.parse(readFileSync(path.join(HERE, 'expected-differences.json'), 'utf8'));

// ---- RN ----
const out = mkdtempSync(path.join(tmpdir(), 'diff-rn-'));
try {
  execFileSync('npx', ['tsc', 'src/lib/personal-record.ts', 'src/lib/exercise-key.ts',
    '--ignoreConfig', '--outDir', out, '--module', 'commonjs', '--target', 'es2020',
    '--skipLibCheck', '--esModuleInterop'],
    { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] });
} catch { /* vẫn emit đủ dùng */ }
const Module = (await import('node:module')).default;
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (req, ...args) {
  if (req === '@/lib/exercise-key') return path.join(out, 'exercise-key.js');
  return origResolve.call(this, req, ...args);
};
const { createRequire } = await import('node:module');
const req = createRequire(path.join(out, 'x.js'));
const pr = req(path.join(out, 'personal-record.js'));

const norm = (sets) => sets.map((s) => ({
  exerciseName: s.exerciseName, weight: s.weight, reps: s.reps, warmup: !!s.warmup,
}));
const rnResults = vectors.map((v) => {
  const bests = pr.bestsFrom(norm(v.input.history));
  const recs = pr.findRecords(norm(v.input.session), bests);
  return { id: v.rule, records: recs.map((r) => ({ exercise: r.exercise, kind: r.kind, value: r.value, previous: r.previous })) };
});

// ---- Native ----
const fixtures = vectors.map((v) => ({
  id: v.rule,
  history: v.input.history.map((s) => ({ exerciseName: s.exerciseName, weight: s.weight, reps: s.reps, warmup: !!s.warmup })),
  session: v.input.session.map((s) => ({ exerciseName: s.exerciseName, weight: s.weight, reps: s.reps, warmup: !!s.warmup })),
}));
const inPath = path.join(tmpdir(), `diff-in-${Date.now()}.json`);
const outPath = path.join(tmpdir(), `diff-out-${Date.now()}.json`);
writeFileSync(inPath, JSON.stringify(fixtures));
try {
  execFileSync('swift', ['test', '--filter', 'DifferentialHarness'], {
    cwd: KIT,
    env: { ...process.env, DIFF_INPUT: inPath, DIFF_OUTPUT: outPath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
} catch (e) {
  console.log(JSON.stringify({ ok: false, error: 'swift harness failed', detail: String(e.stdout ?? e).slice(0, 500) }));
  process.exit(2);
}
const nativeResults = JSON.parse(readFileSync(outPath, 'utf8'));

// ---- So sánh ----
const round2 = (n) => Math.round(n * 100) / 100;
const canon = (rs) => rs.map((r) => ({ exercise: r.exercise, kind: r.kind, value: round2(r.value), previous: round2(r.previous) }))
  .sort((a, b) => a.exercise.localeCompare(b.exercise) || a.kind.localeCompare(b.kind));
const report = { ok: true, cases: [] };
for (const rn of rnResults) {
  const nv = nativeResults.find((x) => x.id === rn.id);
  const match = nv && JSON.stringify(canon(rn.records)) === JSON.stringify(canon(nv.records));
  const documented = expectedDiffs[rn.id];
  const status = match ? 'match' : documented ? 'differ-documented' : 'differ-undocumented';
  if (status === 'differ-undocumented') report.ok = false;
  report.cases.push({
    id: rn.id, status,
    ...(documented ? { documented: documented.reason } : {}),
    ...(!match ? { rn: canon(rn.records), native: nv ? canon(nv.records) : null } : {}),
  });
}
console.log(JSON.stringify(report, null, 1));
process.exit(report.ok ? 0 : 1);
