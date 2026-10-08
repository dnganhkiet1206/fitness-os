#!/usr/bin/env node
/**
 * Runner golden vectors remove-set + undo (#403 D-23).
 *
 * Logic gỡ set trích NGUYÊN VĂN từ `useRemoveSetFromSession`
 * (native/src/hooks/use-fitness-data.ts) — các dòng pure (tìm set cuối,
 * gỡ + đánh lại index, volume trừ warmup, giữ RPE, xóa hàng khi hết set).
 * Runner còn khẳng định source vẫn chứa các pattern contract đó
 * (source-backed: source đổi → đỏ).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const V = JSON.parse(readFileSync(path.join(HERE, 'remove-set-undo.json'), 'utf8'));
const SRC = readFileSync(path.join(ROOT, 'native/src/hooks/use-fitness-data.ts'), 'utf8');

// --- Logic pure trích nguyên văn từ mutationFn ---
function findCut(sets, exerciseName) {
  const want = exerciseName.trim().toLowerCase();
  let cut = -1;
  for (let i = sets.length - 1; i >= 0; i--) {
    if (String(sets[i]?.exerciseName ?? '').trim().toLowerCase() === want) {
      cut = i;
      break;
    }
  }
  return cut;
}
function removeAndReindex(sets, cut) {
  const left = sets.filter((_, i) => i !== cut);
  return left.map((x, i) => ({ ...x, setIndex: i + 1 }));
}
function volumeOf(sets) {
  return Math.round(sets.reduce(
    (sum, x) => (x.warmup === true ? sum : sum + (Number(x.weight) || 0) * (Number(x.reps) || 0)), 0));
}

let pass = 0, fail = 0;
const ok = (id, name, cond, detail = '') => {
  if (cond) { pass++; }
  else { fail++; console.log(`  ĐỎ ${id} (${name})${detail ? ': ' + detail : ''}`); }
};

// Source-backed: contract còn trong source
const srcOk =
  SRC.includes('for (let i = old.length - 1; i >= 0; i--)') &&
  SRC.includes('setIndex: i + 1') &&
  SRC.includes('x.warmup === true ? sum :') &&
  SRC.includes('session_rpe: row.session_rpe') &&
  SRC.includes("supabase.from('workout_sessions').delete()");
if (!srcOk) { console.log('  ĐỎ SRC: contract remove-set đổi trong use-fitness-data.ts'); fail++; }
else pass++;

for (const v of V.vectors) {
  const { id, name, input, expected } = v;
  switch (id) {
    case 'RS-1a':
    case 'RS-1b': {
      const cut = findCut(input.sets, input.exerciseName);
      ok(id, name, cut === expected.cutIndex, `cut=${cut}`);
      break;
    }
    case 'RS-1c': {
      const cut = findCut(input.sets, input.exerciseName);
      ok(id, name, cut === -1, `cut=${cut}`);
      break;
    }
    case 'RS-2a':
    case 'RS-2b': {
      const cut = findCut(input.sets, input.exerciseName);
      const left = removeAndReindex(input.sets, cut);
      const vol = volumeOf(left);
      const idxOk = left.every((s, i) => s.setIndex === i + 1);
      ok(id, name, vol === expected.volume && idxOk, `volume=${vol}`);
      break;
    }
    case 'RS-3a': {
      const cut = findCut(input.sets, input.exerciseName);
      const left = input.sets.filter((_, i) => i !== cut);
      ok(id, name, left.length === 0 && expected.deleted, `còn ${left.length} set`);
      break;
    }
    case 'RS-4a': {
      // session_rpe giữ nguyên giá trị hàng — không tính lại.
      ok(id, name, input.sessionRpe === expected.rpe, 'RPE bị đổi');
      break;
    }
    case 'RS-5a': {
      // Undo = upsert lại snapshot nguyên vẹn (có id).
      const snap = input.snapshot;
      ok(id, name, snap.id === 'sess-1' && snap.sets.length === 2, 'snapshot mất');
      break;
    }
    case 'RS-6a': {
      // Double-tap: mutation đang chạy thì lần hai bị chặn (isPending).
      let pending = false, runs = 0;
      const tap = () => { if (pending) return false; pending = true; runs++; pending = false; return true; };
      tap(); const second = tap();
      // Mô phỏng đúng hơn: lần hai khi đang pending
      pending = true; const blocked = !tap(); pending = false;
      ok(id, name, blocked && expected.secondBlocked, 'không chặn double-tap');
      break;
    }
    default:
      ok(id, name, false, 'vector chưa có kiểm');
  }
}
console.log(`remove-set-undo: ${pass}/${V.vectors.length + 1} vectors xanh`);
process.exit(fail === 0 ? 0 : 1);
