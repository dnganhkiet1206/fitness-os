#!/usr/bin/env node
/**
 * Runner golden vectors AdHoc exercise lifecycle (#404 D-24).
 *
 * Logic trích nguyên văn từ day-plan.tsx:
 *  - add:    `{ id: Crypto.randomUUID(), name: '', sets: 1 }`
 *  - rename: map theo id
 *  - +set:   `Math.min(20, e.sets + 1)` — trần 20
 *  - delete: filter theo id
 *  - legacy: `Array.isArray(saved.extra) ? saved.extra.filter(valid) : []`
 *  - adHocRows: clamp [1,20], key `x${id}-${n}`, weight/reps 0,
 *    heads chỉ hàng đầu (n === 0)
 * Source-backed: đổi source → SRC check đỏ.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const V = JSON.parse(readFileSync(path.join(HERE, 'adhoc-exercise.json'), 'utf8'));
const SRC = readFileSync(path.join(ROOT, 'native/src/components/ascnd/day-plan.tsx'), 'utf8');

// --- Logic trích nguyên văn ---
const add = (id) => ({ id, name: '', sets: 1 });
const rename = (list, id, name) => list.map((e) => (e.id === id ? { ...e, name } : e));
const incSets = (list, id) => list.map((e) => (e.id === id ? { ...e, sets: Math.min(20, e.sets + 1) } : e));
const remove = (list, id) => list.filter((e) => e.id !== id);
const restoreExtra = (saved) =>
  Array.isArray(saved) ? saved.filter((e) => e && typeof e.id === 'string' && e.id.length > 0) : [];
function adHocRows(list) {
  const rows = [];
  for (const e of list) {
    const count = Math.max(1, Math.min(20, Math.round(e.sets)));
    for (let n = 0; n < count; n++) {
      rows.push({ key: `x${e.id}-${n}`, exerciseName: e.name, weight: 0, reps: 0, heads: n === 0, adHoc: e.id });
    }
  }
  return rows;
}

let pass = 0, fail = 0;
const ok = (id, name, cond, detail = '') => {
  if (cond) { pass++; }
  else { fail++; console.log(`  ĐỎ ${id} (${name})${detail ? ': ' + detail : ''}`); }
};

const srcOk =
  SRC.includes("name: '', sets: 1") &&
  SRC.includes("Math.min(20, e.sets + 1)") &&
  SRC.includes("Math.max(1, Math.min(20, Math.round(e.sets)))") &&
  SRC.includes("key: `x${e.id}-${n}`") &&
  SRC.includes("heads: n === 0");
if (!srcOk) { console.log('  ĐỎ SRC: contract AdHoc đổi trong day-plan.tsx'); fail++; }
else pass++;

for (const v of V.vectors) {
  const { id, name, input, expected } = v;
  switch (id) {
    case 'AH-1a': {
      const e = add('uuid-1');
      ok(id, name, e.id === 'uuid-1' && e.name === '' && e.sets === 1);
      break;
    }
    case 'AH-1b': {
      const [e] = rename([{ id: 'x-1', name: '', sets: 1 }], input.id, input.name);
      ok(id, name, e.name === expected.name && e.id === 'x-1');
      break;
    }
    case 'AH-2a':
    case 'AH-2b': {
      const [e] = incSets([{ id: 'x-1', name: 'C', sets: input.sets }], input.id);
      ok(id, name, e.sets === expected.sets, `sets=${e.sets}`);
      break;
    }
    case 'AH-3a': {
      const left = remove([{ id: 'x-1', name: 'C', sets: 2 }], input.id);
      ok(id, name, left.length === expected.count);
      break;
    }
    case 'AH-4a':
    case 'AH-4b': {
      const extra = restoreExtra(input.savedExtra);
      ok(id, name, JSON.stringify(extra) === JSON.stringify(expected.extra),
        JSON.stringify(extra));
      break;
    }
    case 'AH-5a':
    case 'AH-5b':
    case 'AH-5c':
    case 'AH-5d': {
      const rows = adHocRows(input.list);
      if (id === 'AH-5a') ok(id, name, rows.length === 2 && rows[0].key === expected.keys[0] && rows[1].key === expected.keys[1], rows.map((r) => r.key).join(','));
      else if (id === 'AH-5b') ok(id, name, rows.length === 20, `rows=${rows.length}`);
      else if (id === 'AH-5c') ok(id, name, rows[0].heads === true && rows[1].heads === false);
      else ok(id, name, rows[0].weight === 0 && rows[0].reps === 0);
      break;
    }
    default:
      ok(id, name, false, 'vector chưa có kiểm');
  }
}
console.log(`adhoc-exercise: ${pass}/${V.vectors.length + 1} vectors xanh`);
process.exit(fail === 0 ? 0 : 1);
