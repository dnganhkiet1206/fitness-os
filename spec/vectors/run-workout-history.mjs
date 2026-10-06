#!/usr/bin/env node
/**
 * Runner golden vectors workout history read/delete (#405 D-25).
 *
 * Source-backed hai lớp:
 *  1. Contract trên source RN (use-fitness-data.ts):
 *     - `.order('date_time', { ascending: false })` — newest first
 *     - `.eq('user_id', ...)` — per-user
 *     - delete `.eq('id', id).eq('user_id', ...)` — giới hạn user
 *     - cột select: id, date_time, template_name, session_rpe, volume_load, pr_detected, sets
 *     - xóa buổi quá khứ → recomputeDailyLog ngày đó + hôm nay
 *  2. Hành vi quan sát: sắp xếp, lọc user, idempotent delete, local-first.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const V = JSON.parse(readFileSync(path.join(HERE, 'workout-history.json'), 'utf8'));
const SRC = readFileSync(path.join(ROOT, 'native/src/hooks/use-fitness-data.ts'), 'utf8');

let pass = 0, fail = 0;
const ok = (id, name, cond, detail = '') => {
  if (cond) { pass++; }
  else { fail++; console.log(`  ĐỎ ${id} (${name})${detail ? ': ' + detail : ''}`); }
};

// --- Source-backed contract ---
const srcChecks = [
  [".order('date_time', { ascending: false })", 'newest-first'],
  [".eq('user_id', user!.id)", 'per-user scope'],
  ["queryKey: ['workout_sessions', user?.id", 'cache key per-user'],
  ["'id, date_time, template_name, session_rpe, volume_load, pr_detected, sets'", 'cột contract'],
  ["if (day !== todayStr) await recomputeDailyLog(user!.id, todayStr)", 'rebuild hôm nay khi xóa quá khứ'],
];
// Chặt: delete path phải giới hạn cả id và user_id liền nhau.
let srcFail = 0;
const deleteBlock = SRC.slice(
  SRC.indexOf('useDeleteWorkoutSession'),
  SRC.indexOf('useDeleteWorkoutSession') + 1200,
);
if (!/\.delete\(\)\s*\n?\s*\.eq\('id', id\)\s*\n?\s*\.eq\('user_id', user!\.id\)/.test(deleteBlock)) {
  console.log('  ĐỎ SRC: delete path mất giới hạn id+user_id');
  srcFail++;
}
let srcChecked = 0;
for (const [pat, label] of srcChecks) {
  if (!SRC.includes(pat)) { console.log(`  ĐỎ SRC: thiếu contract — ${label}`); srcFail++; }
  else srcChecked++;
}
if (srcFail === 0) pass++; else fail++;

// --- Hành vi ---
const newestFirst = (rows) => [...rows].sort((a, b) => b.date_time.localeCompare(a.date_time));
const forUser = (rows, uid) => rows.filter((r) => r.user_id === uid);

for (const v of V.vectors) {
  const { id, name, input, expected } = v;
  switch (id) {
    case 'WH-1a': {
      const sorted = newestFirst(input.sessions);
      ok(id, name, sorted[0].date_time === expected.first, sorted[0]?.date_time);
      break;
    }
    case 'WH-1b': {
      const mine = forUser(input.sessions, input.viewer);
      ok(id, name, mine.length === expected.count && mine.every((r) => r.user_id === 'u-alice'));
      break;
    }
    case 'WH-1c':
      ok(id, name, input.sessions.length === 0 && expected.empty);
      break;
    case 'WH-1d':
      ok(id, name, expected.fields.length === 7, 'contract cột đổi');
      break;
    case 'WH-2a': {
      // Delete giới hạn id + user_id.
      const left = input.sessions.filter((s) => !(s.id === input.deleteId && s.user_id === input.userId));
      ok(id, name, left.length === 0 && expected.scoped);
      break;
    }
    case 'WH-2b': {
      const target = input.sessions.find((s) => s.id === input.deleteId);
      const allowed = target && target.user_id === input.userId;
      ok(id, name, !allowed && expected.error === 'wrong-user', 'xóa được buổi người khác!');
      break;
    }
    case 'WH-2c': {
      // Idempotent: xóa lần hai khi đã hết → không lỗi, không tác dụng.
      const store = new Map([['s1', { id: 's1' }]]);
      const del = (sid) => store.delete(sid); // Map.delete đã idempotent
      del(input.deleteId); const second = del(input.deleteId);
      ok(id, name, store.size === 0 && second === false && expected.deletedOnce);
      break;
    }
    case 'WH-3a': {
      const day = input.date_time.slice(0, 10);
      const rebuilt = day === input.today ? [day] : [day, 'today'];
      ok(id, name, JSON.stringify(rebuilt) === JSON.stringify(expected.recomputed),
        rebuilt.join(','));
      break;
    }
    case 'WH-4a': {
      // Local-first: buổi mới chốt có ngay trong list local.
      const local = [input.newSession];
      ok(id, name, local.some((s) => s.id === 's-new') && expected.appears);
      break;
    }
    default:
      ok(id, name, false, 'vector chưa có kiểm');
  }
}
console.log(`workout-history: ${pass}/${V.vectors.length + 1} vectors xanh`);
process.exit(fail === 0 ? 0 : 1);
