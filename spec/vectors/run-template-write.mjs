#!/usr/bin/env node
/**
 * Runner golden vectors template write + routine-day assignment (#406 D-26,
 * takeover D-34 #501).
 *
 * Hai loại vector:
 *  - Regression thật (gate): khẳng định contract/hành vi TRỰC TIẾP trên source
 *    production. Source đổi sai → đỏ.
 *    + TW-1..TW-4: source RN (native/src/hooks/use-library.ts) — payload, id
 *      trả về, onConflict, phạm vi delete, cache invalidation.
 *    + TW-5b: source RN (native/src/app/workout-builder.tsx) — thứ tự
 *      create→assign được ÉP BỞI CẤU TRÚC: upsertDay.mutate({template_id: id})
 *      nằm TRONG onSuccess của addTemplate.mutate, dùng đúng id do create
 *      trả về. Đổi thứ tự hay dùng id khác → đỏ.
 *  - Spec-only (KHÔNG tính vào gate): TW-5a, TW-6a, TW-6b. Không có production
 *    logic nào chạy được trên Linux cho các hành vi này (idempotency và
 *    snapshot/today thuộc Swift PlanEditor/WorkoutSessionController/TodayController).
 *    Giữ trong file để ghi lại hành vi mong muốn, runner in ra và bỏ qua.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const V = JSON.parse(readFileSync(path.join(HERE, 'template-write.json'), 'utf8'));
const SRC = readFileSync(path.join(ROOT, 'native/src/hooks/use-library.ts'), 'utf8');
// Cho phép override đường dẫn workout-builder để thử negative mutation:
//   WB_PATH=/tmp/workout-builder.mutated.tsx node spec/vectors/run-template-write.mjs
const WB_PATH = process.env.WB_PATH || path.join(ROOT, 'native/src/app/workout-builder.tsx');
const WB = readFileSync(WB_PATH, 'utf8');

let pass = 0, fail = 0, skipped = 0;
const ok = (id, name, cond, detail = '') => {
  if (cond) { pass++; }
  else { fail++; console.log(`  ĐỎ ${id} (${name})${detail ? ': ' + detail : ''}`); }
};
const has = (s) => SRC.includes(s);

/**
 * Bóc khối cân bằng ngoặc { } bắt đầu tại openIdx (vị trí của '{').
 * Bỏ qua ngoặc trong string/comment để đếm không lệch.
 * Trả về text trong khối, hoặc null nếu không cân bằng.
 */
function balancedBlock(src, openIdx) {
  let depth = 0, i = openIdx, quote = null;
  for (; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (quote) {
      if (c === '\\') { i++; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && n === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++; i++; continue; }
    if (c === '{') depth++;
    if (c === '}') { depth--; if (depth === 0) return src.slice(openIdx + 1, i); }
  }
  return null;
}

/**
 * TW-5b thật: thứ tự create→assign được ép bởi cấu trúc production code.
 * upsertDay.mutate({ template_id: id }) PHẢI nằm trong onSuccess của
 * addTemplate.mutate và PHẢI dùng đúng `id` do create trả về.
 * Đổi thứ tự (assign ngoài onSuccess) hay dùng id khác → đỏ.
 */
function checkCreateAssignOrder(src) {
  const createIdx = src.indexOf('addTemplate.mutate(');
  if (createIdx < 0) return 'không thấy addTemplate.mutate';
  const onSuccessIdx = src.indexOf('onSuccess: (id) =>', createIdx);
  if (onSuccessIdx < 0) return 'không thấy onSuccess nhận id từ create';
  const braceIdx = src.indexOf('{', onSuccessIdx);
  const block = balancedBlock(src, braceIdx);
  if (block === null) return 'không bóc được khối onSuccess';
  if (!block.includes('upsertDay.mutate(')) return 'upsertDay.mutate không nằm trong onSuccess của create';
  if (!block.includes('template_id: id')) return 'assign không dùng id do create trả về';
  return null; // xanh
}

for (const v of V.vectors) {
  const { id, name, specOnly, specOnlyReason } = v;
  if (specOnly) {
    skipped++;
    console.log(`  SPEC-ONLY ${id} (${name}) — ngoài gate: ${specOnlyReason.slice(0, 90)}…`);
    continue;
  }
  switch (id) {
    case 'TW-1a':
      ok(id, name,
        has("user_id: user!.id") && has("name: tpl.name") &&
        has("type: tpl.type || 'custom'") && has("exercises: tpl.exercises"),
        'payload thiếu trường trong useCreateWorkoutTemplate');
      break;
    case 'TW-1b':
      ok(id, name, has(".select('id')") && has("return data.id"),
        'không trả về id hàng mới');
      break;
    case 'TW-2a':
    case 'TW-2b':
    case 'TW-2c': {
      const conflict = has("onConflict: 'user_id,day_of_week'");
      const shape = has(".from('routine_days')") && has(".upsert({ user_id: user!.id, ...day }");
      ok(id, name, conflict && shape, 'upsert routine_days sai contract');
      break;
    }
    case 'TW-3a':
      ok(id, name,
        has(".from('workout_templates')") && has(".delete()") &&
        has(".eq('id', id)") && has(".eq('user_id', user!.id)"),
        'delete không giới hạn theo id + user_id');
      break;
    case 'TW-4a':
      ok(id, name,
        has("['workout_templates', user?.id]") && has("['workout_template_names', user?.id]"),
        'thiếu invalidate cache sau create');
      break;
    case 'TW-4b':
      ok(id, name, has("['routine_days', user?.id]"),
        'thiếu invalidate cache sau assign');
      break;
    case 'TW-5b': {
      const err = checkCreateAssignOrder(WB);
      ok(id, name, err === null, err || '');
      break;
    }
    default:
      ok(id, name, false, 'vector chưa có kiểm');
  }
}
const total = V.vectors.length;
console.log(`template-write: ${pass}/${total - skipped} regression xanh, ${skipped} spec-only ngoài gate`);
process.exit(fail === 0 ? 0 : 1);
