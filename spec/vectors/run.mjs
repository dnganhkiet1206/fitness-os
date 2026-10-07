#!/usr/bin/env node --experimental-strip-types
/**
 * Runner golden vectors cho issue #230 (tiếp theo #237, #495) + #254.
 *
 * Chạy các vector trong spec/vectors/*.json trên LOGIC THẬT của RN
 * (không mock logic), chứng minh vectors đúng với baseline.
 *
 * #495: Hàm trong `native/src/lib/` được import THẬT (không chép).
 * Hàm trong component (day-plan.tsx, rest-timer.tsx) vẫn là bản chép,
 * ghi rõ số dòng nguồn.
 *
 * Chạy: node spec/vectors/run.mjs  (từ repo root)
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ── Hàm thật từ native/src/lib/ (#495) ──
// Copy vào spec/vectors/lib/ với import đã sửa (@/lib/x → ./x.ts)
// để node --experimental-strip-types chạy được.
import { restLabel } from './lib/prescription.ts';
import { parseRepEntry } from './lib/rep-entry.ts';
import { findRecords } from './lib/personal-record.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// Sync vectors (#254) chạy bằng runner riêng (logic thật từ offline-write.ts)
try {
  execFileSync('node', [path.join(ROOT, 'spec', 'vectors', 'run-sync.mjs')], { stdio: 'inherit' });
} catch {
  process.exit(1);
}
const problems = [];
let passed = 0;

/* ── ±15s: BẢN CHÉP từ native/src/components/ascnd/day-plan.tsx:410-438 ──
 * (nằm trong component, không import được) */
const REST_MAX = 600;
function adjustRest(base, delta, total) {
  const left = Math.min(REST_MAX, Math.max(1, base + delta));
  return { left, total: Math.max(total, left) };
}

/* ── warn ring: BẢN CHÉP từ native/src/components/ascnd/rest-timer.tsx ── */
const WARN_AT = 5;
function warnRing(now, paused) {
  return !paused && now > 0 && now <= WARN_AT;
}

/* ── clamp rest per-row: BẢN CHÉP từ day-plan.tsx:1252-1257 ── */
function clampRest(n) {
  return Math.min(REST_MAX, Math.max(0, n));
}

const entered = (e) => e.reps > 0 || (e.durationSec ?? 0) > 0;

/* ── checkRecord: GỌI THẬT findRecords từ native/src/lib/personal-record.ts ──
 * (copy vào spec/vectors/lib/ với import đã sửa, như restLabel/parseRepEntry).
 * Ánh xạ input vector → RN: history {topWeight, repsByWeight} → Bests;
 * set → RecordSet với exerciseName 'X' (exerciseKey('X') === 'x', đã verify).
 * Không còn bản chép thuật toán. */
function checkRecord(set, history) {
  const h = history ?? {};
  const has = (h.topWeight ?? 0) > 0 || Object.keys(h.repsByWeight ?? {}).length > 0;
  const r = findRecords([{ exerciseName: 'X', ...set }],
    has ? { x: { topWeight: h.topWeight ?? 0, repsAt: h.repsByWeight ?? {} } } : {});
  return r.length ? { isRecord: true, kind: r[0].kind } : { isRecord: false };
}

/* ── volume: WS-5 (dùng parseRepEntry thật) ── */
function volumeOf(sets) {
  return sets
    .filter((s) => s.warmup !== true && entered(parseRepEntry(String(s.reps))))
    .reduce((sum, s) => sum + (s.weight ?? 0) * parseRepEntry(String(s.reps)).reps, 0);
}

function eq(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function runVector(v) {
  const { rule, input, expected } = v;
  let actual;
  if (rule.startsWith('RT-7')) {
    actual = adjustRest(input.base, input.delta, 90);
  } else if (rule.startsWith('RT-15')) {
    actual = { label: restLabel(input.seconds) };
  } else if (rule.startsWith('RT-10')) {
    actual = { warn: warnRing(input.now, input.paused) };
  } else if (rule.startsWith('RT-16')) {
    actual = { clamped: clampRest(input.n) };
  } else if (rule.startsWith('WS-2')) {
    const e = parseRepEntry(input.reps);
    actual = { counted: entered(e), ...(e.reps ? { reps: e.reps } : {}), ...(e.durationSec ? { durationSec: e.durationSec } : {}) };
  } else if (rule.startsWith('WS-5')) {
    actual = { volume: volumeOf(input.sets) };
  } else if (rule.startsWith('WS-8')) {
    actual = checkRecord(input.set, input.history);
  } else if (rule === 'LT-6') {
    const sets = input.sets.filter((s) => s.warmup !== true);
    const setCount = sets.filter((s) => entered(parseRepEntry(String(s.reps))) || s.durationSec > 0).length;
    actual = { counted: setCount > 0, setCount, volume: volumeOf(input.sets) };
  } else {
    problems.push(`${rule}: no runner for rule`);
    return;
  }
  // So sánh từng key trong expected
  const ok = Object.keys(expected).every((k) => eq(actual[k], expected[k]));
  if (ok) { passed++; }
  else { problems.push(`${rule}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
}

for (const f of ['rest-timer.json', 'workout-state.json']) {
  const vectors = JSON.parse(readFileSync(path.join(ROOT, 'spec', 'vectors', f), 'utf8'));
  // Không trùng id vector — Swift runner của A (GoldenVectorTests.everySpecVectorFileIsWellFormed)
  // từ chối id trùng; báo lỗi ở đây để JS cũng bắt được (#504).
  const seen = new Set();
  for (const v of vectors) {
    if (seen.has(v.rule)) problems.push(`${f}: duplicate vector id ${v.rule}`);
    seen.add(v.rule);
  }
  for (const v of vectors) runVector(v);
}

if (problems.length) {
  console.log(`FAIL ${problems.length} vector(s):`);
  for (const p of problems) console.log('  -', p);
  process.exit(1);
}
console.log(`OK ${passed} vectors passed`);
