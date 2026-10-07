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

/* ── tạm dừng (#235): BẢN CHÉP từ native/src/components/ascnd/day-plan.tsx ──
 * Trạng thái là `RestCountdown` rút gọn {endsAt, total, pausedLeft?}.
 * - settle: `settleRestState` (day-plan.tsx:195-216) — đang dừng thì giữ;
 *   hết giờ ≥ 1 giây thì đóng (null).
 * - pause / resume: `applyIslandIntent` (day-plan.tsx:297-311). Số giây intent
 *   mang là `remaining` của AscndNativeModule.swift:206-207: đang dừng thì
 *   `pausedRemaining`, không thì `max(endDate − now, 0)`.
 * - adjust: `onAdjust` (day-plan.tsx:410-437) — đang dừng chỉnh số đóng băng.
 * - cancel: `onSkip` (`setResting(null)`). */
function restRemaining(s, now) {
  return s.pausedLeft !== undefined ? s.pausedLeft : Math.max((s.endsAt - now) / 1000, 0);
}
function restStep(s, step) {
  if (s === null) return null;
  const now = step.at;
  switch (step.op) {
    case 'settle': {
      if (s.pausedLeft !== undefined) return s;
      const left = Math.max(0, Math.ceil((s.endsAt - now) / 1000));
      if (left <= 0 && now - s.endsAt >= 1000) return null;
      return s;
    }
    case 'pause': {
      const pausedLeft = Math.max(0, Math.ceil(restRemaining(s, now)));
      return { ...s, pausedLeft };
    }
    case 'resume': {
      const left = Math.max(1, Math.ceil(restRemaining(s, now)));
      const total = Math.max(s.total, left);
      return { endsAt: now + left * 1000, total };
    }
    case 'adjust': {
      const base = s.pausedLeft !== undefined ? s.pausedLeft : Math.max(0, Math.ceil((s.endsAt - now) / 1000));
      const left = Math.max(1, Math.min(REST_MAX, base + step.delta));
      const total = Math.max(s.total, left);
      if (s.pausedLeft !== undefined) return { ...s, pausedLeft: left, total };
      return { endsAt: now + left * 1000, total };
    }
    case 'cancel':
      return null;
    default:
      throw new Error(`op lạ: ${step.op}`);
  }
}
function runPause(input) {
  let s = { endsAt: input.start.at + input.start.seconds * 1000, total: input.start.seconds };
  let at = input.start.at;
  for (const step of input.steps) {
    s = restStep(s, step);
    at = step.at;
  }
  if (s === null) return { ended: true };
  const paused = s.pausedLeft !== undefined;
  return {
    ended: false,
    paused,
    left: paused ? s.pausedLeft : Math.max(0, Math.ceil((s.endsAt - at) / 1000)),
    total: s.total,
    ...(paused ? {} : { endsAt: s.endsAt }),
  };
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
  } else if (rule.startsWith('RT-17')) {
    actual = runPause(input);
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
