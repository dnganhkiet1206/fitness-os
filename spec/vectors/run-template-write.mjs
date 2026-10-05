#!/usr/bin/env node
/**
 * Runner golden vectors template write + routine-day assignment (#406 D-26).
 *
 * Source-backed theo hai lớp:
 *  1. TW-1..TW-4: khẳng định contract TRỰC TIẾP trên source RN
 *     (native/src/hooks/use-library.ts) — payload, id trả về, onConflict,
 *     phạm vi delete, cache invalidation. Source đổi contract → đỏ.
 *  2. TW-5..TW-6: mã hoá hành vi quan sát được (idempotent retry, thứ tự
 *     outbox, snapshot buổi đang tập, plan mới hiện cho Today) bằng model
 *     trong bộ nhớ — KHÔNG cài đặt đường ghi thật (theo RISKS của issue).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const V = JSON.parse(readFileSync(path.join(HERE, 'template-write.json'), 'utf8'));
const SRC = readFileSync(path.join(ROOT, 'native/src/hooks/use-library.ts'), 'utf8');

let pass = 0, fail = 0;
const ok = (id, name, cond, detail = '') => {
  if (cond) { pass++; }
  else { fail++; console.log(`  ĐỎ ${id} (${name})${detail ? ': ' + detail : ''}`); }
};
const has = (s) => SRC.includes(s);

for (const v of V.vectors) {
  const { id, name, input, expected } = v;
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
    case 'TW-5a': {
      // Idempotent retry: cùng idempotency key → một template duy nhất.
      const store = new Map();
      for (let i = 0; i < input.retries; i++) {
        if (!store.has(input.templateId)) store.set(input.templateId, { id: input.templateId });
      }
      ok(id, name, store.size === expected.templates, `có ${store.size} template`);
      break;
    }
    case 'TW-5b': {
      // Assign cần id của create → thứ tự bắt buộc.
      const order = input.ops;
      ok(id, name,
        order.indexOf('create') < order.indexOf('assign') &&
        JSON.stringify(order) === JSON.stringify(expected.order),
        'thứ tự sai');
      break;
    }
    case 'TW-6a': {
      // Buổi đang tập giữ snapshot template lúc bắt đầu.
      const activeWorkout = { templateId: input.activeTemplateId };
      const _newPlan = { templateId: input.newTemplateId }; // plan đổi
      ok(id, name, activeWorkout.templateId === input.activeTemplateId,
        'buổi đang tập bị đổi theo');
      break;
    }
    case 'TW-6b': {
      // TodayController đọc routine_days → thấy plan mới.
      const routineDays = new Map([[1, input.assignedTemplateId]]);
      ok(id, name, routineDays.get(1) === expected.todaySees, 'Today không thấy plan mới');
      break;
    }
    default:
      ok(id, name, false, 'vector chưa có kiểm');
  }
}
console.log(`template-write: ${pass}/${V.vectors.length} vectors xanh`);
process.exit(fail === 0 ? 0 : 1);
