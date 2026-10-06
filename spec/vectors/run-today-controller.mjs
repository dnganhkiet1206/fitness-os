#!/usr/bin/env node
/**
 * Runner golden vectors TodayPlan + TodayController (#371 D-19).
 * Gọi LOGIC THẬT từ native/src (không cài đặt lại):
 *  - todayCta          ← native/src/lib/today-cta.ts
 *  - sessionTicks/mergeProgress ← native/src/lib/day-progress.ts
 *  - dayProgressKey/localDateStr ← native/src/lib/local-date.ts
 *  - future = dateStr > localDateStr() ← day-plan.tsx (công thức nguyên văn)
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const NATIVE = path.resolve(HERE, '..', '..', 'native');
const V = JSON.parse(readFileSync(path.join(HERE, 'today-controller.json'), 'utf8'));

const out = mkdtempSync(path.join(tmpdir(), 'tc-vectors-'));
try {
  execFileSync('npx', ['tsc',
    'src/lib/today-cta.ts', 'src/lib/day-progress.ts', 'src/lib/local-date.ts',
    'src/lib/exercise-key.ts',
    '--ignoreConfig', '--outDir', out, '--module', 'commonjs', '--target', 'es2020',
    '--skipLibCheck', '--esModuleInterop'],
    { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] });
} catch { /* vẫn emit đủ dùng */ }
// day-progress.ts import '@/lib/exercise-key' — trỏ về file vừa biên dịch.
const Module = (await import('node:module')).default;
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (req, ...args) {
  if (req === '@/lib/exercise-key') return path.join(out, 'exercise-key.js');
  return origResolve.call(this, req, ...args);
};
const { createRequire } = await import('node:module');
const req = createRequire(path.join(out, 'x.js'));
const cta = req(path.join(out, 'today-cta.js'));
const dp = req(path.join(out, 'day-progress.js'));
const ld = req(path.join(out, 'local-date.js'));

const deepEq = (a, b) => {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return a === b;
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => deepEq(a[k], b[k]));
};
let pass = 0, fail = 0;

for (const v of V.vectors) {
  let got, note = '';
  try {
    if (v.id.startsWith('TC-1')) {
      got = { cta: cta.todayCta(v.input) };
    } else if (v.id.startsWith('TC-2')) {
      // Công thức nguyên văn day-plan.tsx: const future = dateStr > localDateStr();
      const today = ld.localDateStr();
      const d = v.input.dateStr === 'today' ? today
        : v.input.dateStr === 'tomorrow' ? ld.shiftLocalDate(today, 1)
        : ld.shiftLocalDate(today, -1);
      got = { future: d > today };
    } else if (v.id === 'TC-3a') {
      got = { key: ld.dayProgressKey(v.input.date, v.input.templateId) };
    } else if (v.id.startsWith('TC-4')) {
      const { rows, sets, stored } = v.input;
      if (v.id === 'TC-4a' || v.id === 'TC-4c') {
        got = { ticks: dp.sessionTicks(rows, sets) };
      } else {
        got = { merged: dp.mergeProgress(stored, rows, sets) };
      }
    }
  } catch (e) { got = { error: String(e).slice(0, 80) }; }
  const want = v.expected;
  if (deepEq(got, want)) { pass++; }
  else { fail++; console.log(`  ĐỎ ${v.id} (${v.name}): nhận ${JSON.stringify(got)}, muốn ${JSON.stringify(want)}`); }
}
console.log(`today-controller: ${pass}/${V.vectors.length} vectors xanh`);
process.exit(fail === 0 ? 0 : 1);
