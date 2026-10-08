#!/usr/bin/env node
/**
 * Runner golden vectors append-after-finish cho issue #322 (D-10).
 *
 * Logic nối thêm nằm trong React hook/component (không import được) nên dựng
 * lại đúng từng dòng, có ghi chú dòng nguồn (như run-workout-session.mjs):
 * - pendingReady:      day-plan.tsx:1275 (+ rowReady 1109-1116)
 * - appending:         day-plan.tsx:1329
 * - canFinish:         day-plan.tsx:1330-1332
 * - nhánh nối offline: day-plan.tsx:1434-1437
 * - useAppendToSession: use-fitness-data.ts:599-660 (đọc → cộng set →
 *   viết lại cả hàng: sets [...old, ...added], volume_load += Σ,
 *   session_rpe = max, pr_detected chỉ bật lên)
 *
 * Chạy: node spec/vectors/run-append.mjs  (từ repo root)
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const problems = [];
let passed = 0;

/* ── day-plan.tsx:1109-1116 — hàng phát sinh đủ điều kiện ── */
const rowReady = (r) => r.name.trim() !== '' && (r.reps > 0 || (r.durationSec ?? 0) > 0);
/* ── day-plan.tsx:1275 ── */
const pendingReady = (rows) => rows.length > 0 && rows.every(rowReady);
/* ── day-plan.tsx:1329 ── */
const appending = (logged, ready, future) => logged && ready && !future;
/* ── day-plan.tsx:1330-1332 ── */
const canFinish = ({ logged, future, doneCount, isAppending, appendPending, logIsPending }) =>
  isAppending
    ? !appendPending
    : doneCount > 0 && !logIsPending && !logged && !future;

/* ── use-fitness-data.ts: useAppendToSession (lõi mutationFn) ── */
function appendPayload(v) {
  // day-plan.tsx:1434-1437 — offline thì từ chối ngay, không xếp hàng
  if (v.offline) return { blockedOffline: true };
  const old = v.oldSets ?? [];
  const added = (v.newSets ?? []).map((s, i) => ({
    setIndex: old.length + i + 1,
    weight: Math.round(s.weight * 100) / 100,
    reps: s.reps,
  }));
  const addedVolume = (v.newSets ?? []).reduce((sum, s) => sum + s.weight * s.reps, 0);
  const newRpe = Math.max(0, ...(v.newSets ?? []).map((s) => s.rpe ?? 0));
  return {
    blockedOffline: false,
    sessionId: v.sessionId,
    // cùng id buổi — UPDATE một hàng, không phải buổi thứ hai
    rowOp: 'update',
    sameSessionId: true,
    setCount: old.length + added.length,
    setIndices: added.map((a) => a.setIndex),
    volumeLoad: Math.round((v.oldVolume ?? 0) + addedVolume),
    sessionRpe: Math.max(v.oldRpe ?? 0, newRpe),
    // pr_detected chỉ bật lên, không bao giờ tắt
    prDetected: Boolean(v.oldPrDetected) || (v.newRecords ?? 0) > 0,
    // nhánh nối chỉ gửi pendingRows
    extraCount: (v.newSets ?? []).length,
    sentDoneCount: 0,
  };
}

const norm = (v) => JSON.stringify(v, Object.keys(v ?? {}).sort());
const eq = (a, b) => norm(a) === norm(b);

const vectors = JSON.parse(readFileSync(path.join(ROOT, 'spec/vectors/append.json'), 'utf8'));
for (const v of vectors) {
  let got;
  if (v.rule.startsWith('AP-1')) {
    const ready = pendingReady(v.input.pendingRows ?? []);
    const isAppending = appending(v.input.logged, ready, v.input.future);
    got = {
      pendingReady: ready,
      appending: isAppending,
      canFinish: canFinish({
        logged: v.input.logged,
        future: v.input.future,
        doneCount: v.input.doneCount ?? 0,
        isAppending,
        appendPending: false,
        logIsPending: v.input.logIsPending ?? false,
      }),
    };
  } else {
    got = appendPayload(v.input);
  }
  // Chỉ so các key mà expected nêu (expected là tập con của got)
  const subset = Object.fromEntries(
    Object.keys(v.expected).map((k) => [k, got[k]]),
  );
  if (!eq(subset, v.expected)) {
    problems.push(`${v.rule} (${v.desc}): nhận ${JSON.stringify(subset)}, muốn ${JSON.stringify(v.expected)}`);
  } else {
    passed += 1;
  }
}

console.log(`append: ${passed}/${vectors.length} vectors xanh`);
if (problems.length > 0) {
  for (const p of problems) console.log('  ĐỎ ' + p);
  process.exit(1);
}
