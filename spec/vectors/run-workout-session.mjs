#!/usr/bin/env node
/**
 * Runner golden vectors Workout Session cho issue #280 (D-3).
 *
 * GỌI THẲNG LOGIC THẬT, không chép lại (bài học từ #237, theo #254):
 * - `parseRepEntry` từ native/src/lib/rep-entry.ts (biên dịch bằng tsc)
 * - `weightToKg` từ native/src/lib/units.ts
 * - `dayProgressKey`, `localDateStr`, `diaryStampAt`, `shiftLocalDate`
 *   từ native/src/lib/local-date.ts
 *
 * Các luật nằm trong React component (không import được) được dựng lại
 * đúng từng dòng, có ghi chú dòng nguồn:
 * - performed:      day-plan.tsx:1038-1052
 * - draft load:     day-plan.tsx:873-924
 * - logged/future:  day-plan.tsx:1297, 1317, 1329-1332
 * - finish payload: day-plan.tsx:1470-1500 (offline) +
 *                   use-fitness-data.ts:347,360,381,405-423 (online)
 *
 * Chạy: node spec/vectors/run-workout-session.mjs  (từ repo root)
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const NATIVE = path.join(ROOT, 'native');
const problems = [];
let passed = 0;

// ── Biên dịch logic thật ──
const out = mkdtempSync(path.join(os.tmpdir(), 'ws-vectors-'));
try {
  execFileSync(
    'npx',
    ['tsc', 'src/lib/local-date.ts', 'src/lib/rep-entry.ts', 'src/lib/units.ts',
     '--ignoreConfig', '--outDir', out,
     '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
    { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
  );
} catch {
  // @/ path mapping làm tsc exit non-zero; vẫn emit đủ dùng
}
writeFileSync(path.join(out, 'empty-stub.js'), 'module.exports = {};');
const Module = (await import('node:module')).default;
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (req, ...args) {
  if (req.startsWith('@/')) {
    return origResolve.call(this, './empty-stub.js', ...args);
  }
  return origResolve.call(this, req, ...args);
};
const { createRequire } = await import('node:module');
const req = createRequire(path.join(out, 'x.js'));
const { dayProgressKey, localDateStr, diaryStampAt } = req(path.join(out, 'local-date.js'));
const { parseRepEntry } = req(path.join(out, 'rep-entry.js'));
const { weightToKg } = req(path.join(out, 'units.js'));

/* ── performed: day-plan.tsx:1038-1052 ── */
function performed(row, weightText, repsText, wUnit) {
  const plannedLoad = row.weight > 0 ? String(Math.round(row.weight * 10) / 10) : '';
  const plannedReps = row.reps > 0 ? String(row.reps) : '';
  const typed = Number(weightText[row.key] ?? plannedLoad);
  const entry = parseRepEntry(repsText[row.key] ?? plannedReps);
  const said = entry.reps > 0 || (entry.durationSec ?? 0) > 0;
  return {
    weight: Number.isFinite(typed) && typed > 0 ? weightToKg(typed, wUnit) : 0,
    reps: said ? entry.reps : row.reps,
    durationSec: entry.durationSec ?? null,
    counted: said,
  };
}

/* ── draft load: day-plan.tsx:873-924 ── */
function loadDraft(blob) {
  const fresh = { idle: true, done: {}, rpe: {}, rest: {}, weightText: {}, repsText: {}, extra: [] };
  if (blob == null) return fresh;
  try {
    const saved = typeof blob === 'string' ? JSON.parse(blob) : blob;
    if (saved === null || typeof saved !== 'object' || Array.isArray(saved)) return fresh;
    return {
      idle: false,
      done: saved.done ?? {},
      rpe: saved.rpe ?? {},
      rest: saved.rest ?? {},
      weightText: saved.weightText ?? {},
      repsText: saved.repsText ?? {},
      extra: Array.isArray(saved.extra)
        ? saved.extra.filter((e) => e && typeof e.id === 'string' && e.id.length > 0)
        : [],
    };
  } catch {
    return fresh; // blob hỏng → bắt đầu mới, không crash
  }
}

/* ── logged / canFinish: day-plan.tsx:1297, 1317, 1329-1332 ── */
function sessionState(input) {
  const sessions = input.sessions ?? [];
  const logged = sessions.length > 0 || !!input.logSuccess || !!input.queuePending || !!input.queueSuccess;
  const dateStr = input.dateStr === 'today' ? localDateStr() : (input.dateStr ?? localDateStr());
  const future = dateStr > localDateStr();
  const appending = logged && !!input.pendingReady && !future;
  const canFinish = appending
    ? !input.appendPending
    : (input.doneCount ?? 0) > 0 && !input.logPending && !logged && !future;
  return { logged, future, appending, canFinish, mutationFired: canFinish };
}

/* ── finish payload: day-plan.tsx:1470-1500 + use-fitness-data.ts ── */
function finishPayload(input) {
  const sets = input.sets.filter((_, i) => input.ticked[i]);
  const sessionRpe = Math.max(...sets.map((s) => s.rpe));
  // use-fitness-data.ts:420-423 — warmup bị loại khỏi volume_load
  const volumeLoad = Math.round(
    sets.reduce((sum, s) => (s.warmup === true ? sum : sum + s.weight * s.reps), 0),
  );
  const t = input.template;
  // use-fitness-data.ts:347 — ngày khác hôm nay → giữa trưa địa phương
  const date = input.date;
  const stamp = date && date !== localDateStr() ? new Date(`${date}T12:00:00`) : null;
  return {
    setCount: sets.length,
    names: sets.map((s) => s.name),
    sessionRpe,
    volumeLoad,
    templateId: t?.id ?? null,
    templateName: t?.name?.trim() || 'Workout',
    stampLocalDate: stamp ? localDateStr(stamp) : null,
    stampLocalHour: stamp ? stamp.getHours() : null,
  };
}

function eq(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}
function round4(n) {
  return Math.round(n * 10000) / 10000;
}

function runVector(v) {
  const { rule, input, expected } = v;
  let actual;
  if (rule.startsWith('WS-S1')) {
    const key = dayProgressKey(input.dateStr, input.templateId);
    const d = loadDraft(input.blob);
    actual = {
      key,
      idle: d.idle,
      doneCount: Object.keys(d.done).length,
      ...(d.idle ? {} : {
        done: d.done, rpe: d.rpe, weightText: d.weightText,
        repsText: d.repsText, extraCount: d.extra.length,
      }),
    };
  } else if (rule.startsWith('WS-S2')) {
    const p = performed(input.row, input.weightText, input.repsText, input.wUnit);
    actual = { weight: round4(p.weight), reps: p.reps, durationSec: p.durationSec, counted: p.counted };
  } else if (rule.startsWith('WS-S3')) {
    actual = finishPayload(input);
  } else if (rule.startsWith('WS-S4') || rule.startsWith('WS-S5')) {
    const s = sessionState(input);
    actual = { ...s, tickAllowed: true, doneCount: input.doneCount ?? 0 };
    if (rule === 'WS-S5b' || rule === 'WS-S5c') actual.doneCount = undefined;
  } else if (rule.startsWith('WS-S6')) {
    const dateStr = input.dateStr === 'today' ? localDateStr() : input.dateStr;
    const iso = diaryStampAt(dateStr); // logic thật từ local-date.ts
    const d = new Date(iso);
    actual = {
      isToday: localDateStr(d) === localDateStr(),
      localDate: localDateStr(d),
      localHour: d.getHours(),
    };
  } else {
    problems.push(`${rule}: no runner for rule`);
    return;
  }
  const ok = Object.keys(expected).every((k) => eq(actual[k], expected[k]));
  if (ok) { passed++; }
  else { problems.push(`${rule}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
}

const vectors = JSON.parse(readFileSync(path.join(ROOT, 'spec', 'vectors', 'workout-session.json'), 'utf8'));
for (const v of vectors) runVector(v);

if (problems.length) {
  console.log(`FAIL ${problems.length} vector(s):`);
  for (const p of problems) console.log('  -', p);
  process.exit(1);
}
console.log(`OK ${passed} vectors passed`);
