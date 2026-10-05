#!/usr/bin/env node
/**
 * Runner golden vectors cho issue #230 + #254.
 *
 * Chạy các vector trong spec/vectors/*.json trên LOGIC THẬT của RN
 * (không mock logic), chứng minh vectors đúng với baseline.
 * Dùng cho D (RN) — runner Swift do B/A viết trong ASCNDCore.
 *
 * Chạy: node spec/vectors/run.mjs  (từ repo root)
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// Sync vectors (#254) chạy bằng runner riêng (logic thật từ offline-write.ts)
try {
  execFileSync('node', [path.join(ROOT, 'spec', 'vectors', 'run-sync.mjs')], { stdio: 'inherit' });
} catch {
  process.exit(1);
}
const problems = [];
let passed = 0;

/* ── restLabel: copy logic từ native/src/lib/prescription.ts ── */
function restLabel(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/* ── ±15s: copy logic từ native/src/components/ascnd/day-plan.tsx:410-438 ── */
const REST_MAX = 600;
function adjustRest(base, delta, total) {
  const left = Math.min(REST_MAX, Math.max(1, base + delta));
  return { left, total: Math.max(total, left) };
}

/* ── warn ring: copy từ native/src/components/ascnd/rest-timer.tsx ── */
const WARN_AT = 5;
function warnRing(now, paused) {
  return !paused && now > 0 && now <= WARN_AT;
}

/* ── clamp rest per-row: day-plan.tsx:1252-1257 ── */
function clampRest(n) {
  return Math.min(REST_MAX, Math.max(0, n));
}

/* ── parseRepEntry: copy từ native/src/lib/rep-entry.ts ── */
const MAX_REPS = 1000, MAX_HOLD_SEC = 3600;
function parseRepEntry(raw) {
  const t = String(raw ?? '').trim().toLowerCase();
  const hold = t.match(/^(\d+)s$/);
  if (hold) {
    const sec = parseInt(hold[1], 10);
    return { reps: 0, durationSec: sec >= 1 && sec <= MAX_HOLD_SEC ? sec : 0 };
  }
  if (/^\d+$/.test(t)) {
    const n = parseInt(t, 10);
    return { reps: n >= 1 && n <= MAX_REPS ? n : 0, durationSec: 0 };
  }
  return { reps: 0, durationSec: 0 };
}
const entered = (e) => e.reps > 0 || (e.durationSec ?? 0) > 0;

/* ── volume: WS-5 ── */
function volumeOf(sets) {
  return sets
    .filter((s) => s.warmup !== true && entered(parseRepEntry(String(s.reps))))
    .reduce((sum, s) => sum + (s.weight ?? 0) * parseRepEntry(String(s.reps)).reps, 0);
}

/* ── PR: copy từ native/src/lib/personal-record.ts ── */
const WEIGHT_EPSILON_KG = 0.05;
const weightKey = (w) => (Math.round(w / WEIGHT_EPSILON_KG) * WEIGHT_EPSILON_KG).toFixed(2);
function counts(s) {
  return s.warmup !== true && Number.isFinite(s.weight) && Number.isFinite(s.reps)
    && s.reps >= 1 && s.weight >= 0;
}
function checkRecord(set, history) {
  // Không có history cho bài đó → không kỷ lục (buổi đầu tiên không nổ PR).
  const hasHistory = (history.topWeight ?? 0) > 0 || Object.keys(history.repsByWeight ?? {}).length > 0;
  if (!hasHistory) return { isRecord: false };
  if (!counts(set)) return { isRecord: false };
  const w = set.weight, r = set.reps;
  if (w > 0 && w > (history.topWeight ?? 0) + WEIGHT_EPSILON_KG)
    return { isRecord: true, kind: 'weight' };
  const prev = history.repsByWeight?.[weightKey(w)];
  if (prev === undefined) return { isRecord: false };
  if (r > prev) return { isRecord: true, kind: 'reps' };
  return { isRecord: false };
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
  for (const v of vectors) runVector(v);
}

if (problems.length) {
  console.log(`FAIL ${problems.length} vector(s):`);
  for (const p of problems) console.log('  -', p);
  process.exit(1);
}
console.log(`OK ${passed} vectors passed`);
