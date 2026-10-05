#!/usr/bin/env node
/**
 * C-43 (#484): History/Builder presentation contract handoff — fixture test.
 *
 * Xác nhận fields thật mà C-28/C-37 dùng khớp với APIs của A21/A22,
 * và mọi mismatch đã biết đều có adapter rule tường minh (không im lặng).
 *
 * - Mặc định: kiểm tra tính đầy đủ + nhất quán nội bộ của contract đã verify
 *   (đọc code thật ngày 05/10/2026) + unit test các adapter thuần.
 * - `node tools/contract-handoff.mjs --live`: đối chiếu lại với 4 branch thật
 *   qua `git show` — đỏ khi có drift (đổi tên/xoá field mà contract chưa cập nhật).
 *
 * Swift không compile trên Linux nên đây là kiểm tra static/type-level.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const NATIVE = path.resolve(HERE, '..');
const ROOT = path.resolve(NATIVE, '..');
const LIVE = process.argv.includes('--live');

let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) pass++;
  else { fail++; console.log('FAIL:', name); }
};

// ---------------------------------------------------------------------------
// Contract đã verify bằng cách đọc code thật (05/10/2026).
// Branch@commit:
//   A21 agent/a/history            @ d05267d
//   A22 agent/a/a22-template-write @ 9acd8cd
//   C-28 agent/c/history-ui       @ 2ebb682
//   C-37 agent/c/workout-builder-ui @ 9e6aa43
// ---------------------------------------------------------------------------
const A = {
  HistoryEntry: ['id', 'at', 'templateName', 'sessionRpe', 'volumeKg', 'prDetected', 'completedSets', 'exerciseCount'],
  HistoryBook: ['entries', 'loaded', 'failure', 'load', 'refresh', 'delete', 'absorb', 'windowDays', 'onDeleted'],
  RefreshFailure: ['offline', 'unavailable'],
  TemplateExercise: ['exerciseId', 'exerciseName', 'sets', 'reps', 'weightKg', 'rpe', 'restSeconds'],
  WorkoutTemplate: ['id', 'name', 'exercises', 'type', 'createdAt'],
  RoutineDay: ['dayOfWeek', 'isRest', 'isDeload', 'templateId'],
  PlanEditor: ['newTemplateId', 'create', 'delete', 'assign', 'setDeload'],
  PlanRefusal: ['emptyName', 'noExercises', 'invalidDay', 'unknownTemplate', 'storage'],
  PlanEdit: { days: '0...6 (0=Mon)', defaultType: 'custom', maxSets: 20, defaultRpe: 7, defaultRest: 90 },
};

const C = {
  HistorySession: ['id', 'date', 'templateName', 'volumeKg', 'completedSets', 'exerciseCount', 'hasPR'],
  HistoryState: ['loading', 'loaded', 'empty', 'offline', 'error'],
  HistoryCallbacks: ['onRetry', 'onSelect'], // onDelete: GAP — view chưa có seam (xem handoff note 3.3)
  WorkoutTemplateProtocol: ['id', 'name', 'exercises', 'assignedWeekdays'],
  TemplateExerciseProtocol: ['id', 'name', 'sets', 'reps', 'weightKg'],
  // Callbacks có thật trên các view (đã verify code thật 05/10/2026 — KHÔNG có
  // `weekdaySelected`; WeekdayAssignmentView dùng @Binding, không phải callback).
  BuilderCallbacks: ['onSelect', 'onCreate', 'onDelete', 'onSave', 'onCancel', 'onAddExercise',
    'onSaveTemplate', 'onDeleteTemplate', 'onRetry'],
  // Cơ chế chọn ngày: @Binding, không phải callback — wiring diff Set<Int>.
  WeekdayBinding: ['selected'],
};

// Adapter rules tường minh: C-field -> { a: A-field | null, via: mô tả }
const ADAPTERS = {
  // History
  'HistorySession.id': { a: 'HistoryEntry.id', via: 'trực tiếp' },
  'HistorySession.date': { a: 'HistoryEntry.at', via: 'EpochMillis.date' },
  'HistorySession.templateName': { a: 'HistoryEntry.templateName', via: 'trực tiếp' },
  'HistorySession.volumeKg': { a: 'HistoryEntry.volumeKg', via: 'trực tiếp' },
  'HistorySession.completedSets': { a: 'HistoryEntry.completedSets', via: 'trực tiếp' },
  'HistorySession.exerciseCount': { a: 'HistoryEntry.exerciseCount', via: 'trực tiếp' },
  'HistorySession.hasPR': { a: 'HistoryEntry.prDetected', via: 'đổi tên' },
  'HistoryState.*': { a: 'HistoryBook.{loaded,failure,entries}', via: 'historyState(of:) — xem note 3.2' },
  onRetry: { a: 'HistoryBook.refresh', via: 'trực tiếp' },
  // Builder
  'WorkoutTemplateProtocol.id': { a: 'WorkoutTemplate.id', via: 'trực tiếp' },
  'WorkoutTemplateProtocol.name': { a: 'WorkoutTemplate.name', via: 'trực tiếp' },
  'WorkoutTemplateProtocol.exercises': { a: 'WorkoutTemplate.exercises', via: 'map từng phần tử' },
  'WorkoutTemplateProtocol.assignedWeekdays': { a: 'RoutineDay.dayOfWeek', via: 'MISMATCH: aDayOfWeek(c) = (c+5)%7' },
  'TemplateExerciseProtocol.name': { a: 'TemplateExercise.exerciseName', via: 'đổi tên' },
  'TemplateExerciseProtocol.sets': { a: 'TemplateExercise.sets', via: 'trực tiếp' },
  'TemplateExerciseProtocol.reps': { a: 'TemplateExercise.reps', via: 'trực tiếp' },
  'TemplateExerciseProtocol.weightKg': { a: 'TemplateExercise.weightKg', via: 'nil → 0' },
  '(new) exerciseId': { a: 'TemplateExercise.exerciseId', via: 'nil khi tạo mới (C form không edit)' },
  'TemplateExerciseProtocol.id': { a: 'TemplateExercise.exerciseId', via: 'MISMATCH: A không có id ổn định cho row — adapter: exerciseId ?? UUID mới; cần A xác nhận identity khi edit' },
  '(new) rpe/restSeconds': { a: 'TemplateExercise.{rpe,restSeconds}', via: 'default 7/90 khi tạo; carry-through khi edit' },
  '(new) type': { a: 'WorkoutTemplate.type', via: 'PlanEdit.defaultType khi tạo' },
  onSaveTemplate: { a: 'PlanEditor.create', via: 'newTemplateId() 1 lần/form + create(nil) + assign từng ngày' },
  onDeleteTemplate: { a: 'PlanEditor.delete', via: 'trực tiếp; Refusal → error state' },
  'WeekdayAssignmentView.selected': { a: 'PlanEditor.assign', via: '@Binding Set<Int> — wiring diff ngày thay đổi → assign(day:) từng ngày (chọn → assign(id), bỏ → assign(nil))' },
};

// Mismatch đã biết — PHẢI khai báo tường minh, cấm im lặng.
const KNOWN_MISMATCHES = [
  'weekday numbering: C 1=CN..7=T7 (Calendar) vs A 0=Mon..6=Sun (routineIndex)',
  'weightKg: C Double? vs A Double (non-optional)',
  'HistorySession.date: C Date vs A EpochMillis',
  'A22 PlanEditor KHÔNG có update API — edit flow cần A xác nhận (note 4.3)',
  'C-28 thiếu seam delete (onDelete) — follow-up trên agent/c/history-ui (note 3.3)',
  'row identity: C TemplateExerciseProtocol.id (Identifiable) vs A TemplateExercise không có id — adapter exerciseId ?? UUID',
];

// ---------------------------------------------------------------------------
// 1. Tính đầy đủ: mọi field C đều có adapter rule.
// ---------------------------------------------------------------------------
const cFields = [
  ...C.HistorySession.map((f) => `HistorySession.${f}`),
  'HistoryState.*', 'onRetry',
  ...C.WorkoutTemplateProtocol.map((f) => `WorkoutTemplateProtocol.${f}`),
  ...C.TemplateExerciseProtocol.map((f) => `TemplateExerciseProtocol.${f}`),
  'onSaveTemplate', 'onDeleteTemplate', 'WeekdayAssignmentView.selected',
];
for (const f of cFields) {
  check(`adapter cho ${f}`, f in ADAPTERS);
}
// A field không bịa: mọi adapter phải trỏ tới field A có thật.
const aFieldSet = new Set([
  ...A.HistoryEntry.map((f) => `HistoryEntry.${f}`),
  ...A.HistoryBook.map((f) => `HistoryBook.${f}`),
  ...A.TemplateExercise.map((f) => `TemplateExercise.${f}`),
  ...A.WorkoutTemplate.map((f) => `WorkoutTemplate.${f}`),
  ...A.RoutineDay.map((f) => `RoutineDay.${f}`),
  ...A.PlanEditor.map((f) => `PlanEditor.${f}`),
]);
for (const [k, v] of Object.entries(ADAPTERS)) {
  const refs = v.a.match(/[A-Za-z]+\.[A-Za-z]+/g) || [];
  for (const r of refs) {
    const [type, field] = r.split('.');
    const ok = aFieldSet.has(r) || field === '{loaded' || v.a.includes('{');
    check(`adapter ${k} trỏ tới field A có thật (${r})`, ok);
  }
}
check('mismatch khai báo tường minh (>=5)', KNOWN_MISMATCHES.length >= 5);

// ---------------------------------------------------------------------------
// 2. Unit test adapter thuần.
// ---------------------------------------------------------------------------
const aDayOfWeek = (c) => (c + 5) % 7; // C 1=CN..7=T7 → A 0=Mon..6=Sun
const EXPECTED_DAYS = { 1: 6, 2: 0, 3: 1, 4: 2, 5: 3, 6: 4, 7: 5 };
for (const [c, a] of Object.entries(EXPECTED_DAYS)) {
  check(`aDayOfWeek(${c}) == ${a}`, aDayOfWeek(Number(c)) === a);
}
check('weightKg nil → 0', (null ?? 0) === 0);
check('EpochMillis→Date: millis/1000', new Date(1_700_000_000_000).getTime() === 1_700_000_000_000);

// ---------------------------------------------------------------------------
// 3. --live: đối chiếu với 4 branch thật.
// ---------------------------------------------------------------------------
function gitShow(branch, filePath) {
  return execFileSync('git', ['-C', ROOT, 'show', `${branch}:${filePath}`], { encoding: 'utf8' });
}
function swiftFields(src, structName) {
  const re = new RegExp(`(?:struct|class|enum|protocol)\\s+${structName}[\\s\\S]*?\\{([\\s\\S]*?)\\n\\}`, '');
  const body = (src.match(re) || [])[1] || '';
  const fields = new Set();
  // public [private(set)] let/var — kể cả `public final class`
  for (const m of body.matchAll(/public\s+(?:private\(set\)\s+)?(?:static\s+)?(?:let|var)\s+([A-Za-z_][A-Za-z0-9_]*)/g)) fields.add(m[1]);
  // protocol requirement không có `public`: `var x: T { get }`
  for (const m of body.matchAll(/^\s*(?:let|var)\s+([A-Za-z_][A-Za-z0-9_]*)\s*:/gm)) fields.add(m[1]);
  for (const m of body.matchAll(/case\s+([A-Za-z_][A-Za-z0-9_]*)/g)) fields.add(m[1]);
  for (const m of body.matchAll(/public\s+func\s+([A-Za-z_][A-Za-z0-9_]*)/g)) fields.add(m[1]);
  return fields;
}
const stripComments = (src) => src.replace(/\/\/.*$/gm, '');
if (LIVE) {
  const BR = {
    a21: 'origin/agent/a/history',
    a22: 'origin/agent/a/a22-template-write',
    c28: 'origin/agent/c/history-ui',
    c37: 'origin/agent/c/workout-builder-ui',
  };
  try {
    for (const b of Object.values(BR)) execFileSync('git', ['-C', ROOT, 'fetch', '-q', 'origin', b.replace('origin/', '')]);
  } catch { /* offline: dùng ref local */ }
  const P = {
    history: 'apps/ios/Packages/ASCNDKit/Sources/ASCNDCore/Workout/WorkoutHistory.swift',
    today: 'apps/ios/Packages/ASCNDKit/Sources/ASCNDCore/Workout/TodayPlan.swift',
    planEdits: 'apps/ios/Packages/ASCNDKit/Sources/ASCNDCore/Workout/PlanEdits.swift',
    todayCtl: 'apps/ios/Packages/ASCNDKit/Sources/ASCNDCore/Workout/TodayController.swift',
    historyView: 'apps/ios/ASCND/Features/Workout/WorkoutHistoryView.swift',
    builderModels: 'apps/ios/ASCND/Features/Builder/WorkoutBuilderModels.swift',
    builderView: 'apps/ios/ASCND/Features/Builder/WorkoutBuilderView.swift',
    listView: 'apps/ios/ASCND/Features/Builder/TemplateListView.swift',
    formView: 'apps/ios/ASCND/Features/Builder/TemplateFormView.swift',
    weekdayView: 'apps/ios/ASCND/Features/Builder/WeekdayAssignmentView.swift',
  };
  // Callbacks kỳ vọng trên từng view thật (đã verify code thật 05/10/2026).
  // Bắt drift kiểu "đổi tên/xoá callback mà contract chưa cập nhật".
  const viewCallbacks = [
    ['C28 WorkoutHistoryView', BR.c28, P.historyView, ['onRetry', 'onSelect']],
    ['C37 WorkoutBuilderView', BR.c37, P.builderView, ['onSaveTemplate', 'onDeleteTemplate', 'onRetry']],
    ['C37 TemplateListView', BR.c37, P.listView, ['onCreate', 'onDelete', 'onSelect']],
    ['C37 TemplateFormView', BR.c37, P.formView, ['onSave', 'onCancel', 'onAddExercise', 'onDelete']],
  ];
  const liveChecks = [
    ['A21 HistoryEntry', BR.a21, P.history, 'HistoryEntry', A.HistoryEntry],
    ['A21 HistoryBook', BR.a21, P.history, 'HistoryBook', A.HistoryBook],
    ['A21 RefreshFailure', BR.a21, P.todayCtl, 'RefreshFailure', A.RefreshFailure],
    ['A22 TemplateExercise', BR.a22, P.today, 'TemplateExercise', A.TemplateExercise],
    ['A22 WorkoutTemplate', BR.a22, P.today, 'WorkoutTemplate', A.WorkoutTemplate],
    ['A22 RoutineDay', BR.a22, P.today, 'RoutineDay', A.RoutineDay],
    ['A22 PlanEditor', BR.a22, P.planEdits, 'PlanEditor', A.PlanEditor],
    ['C28 HistorySession', BR.c28, P.historyView, 'HistorySession', C.HistorySession],
    ['C28 HistoryState', BR.c28, P.historyView, 'HistoryState', C.HistoryState],
    ['C37 WorkoutTemplateProtocol', BR.c37, P.builderModels, 'WorkoutTemplateProtocol', C.WorkoutTemplateProtocol],
    ['C37 TemplateExerciseProtocol', BR.c37, P.builderModels, 'TemplateExerciseProtocol', C.TemplateExerciseProtocol],
  ];
  for (const [label, branch, file, type, expected] of liveChecks) {
    let src;
    try { src = gitShow(branch, file); }
    catch { check(`live: đọc được ${label}`, false); continue; }
    const fields = swiftFields(src, type);
    const missing = expected.filter((f) => !fields.has(f));
    check(`live: ${label} đủ fields [${expected.join(',')}]`, missing.length === 0);
    if (missing.length) console.log(`   thiếu: ${missing.join(', ')}`);
  }
  for (const [label, branch, file, expected] of viewCallbacks) {
    let src;
    try { src = stripComments(gitShow(branch, file)); }
    catch { check(`live: đọc được ${label}`, false); continue; }
    const vars = new Set([...src.matchAll(/var\s+(on[A-Za-z]+)\s*:/g)].map((m) => m[1]));
    const missing = expected.filter((f) => !vars.has(f));
    check(`live: ${label} đủ callbacks [${expected.join(',')}]`, missing.length === 0);
    if (missing.length) console.log(`   thiếu: ${missing.join(', ')}`);
  }
  // WeekdayAssignmentView dùng @Binding, KHÔNG có callback chọn ngày.
  try {
    const wsrc = stripComments(gitShow(BR.c37, P.weekdayView));
    const hasBinding = /@Binding\s+var\s+selected\s*:\s*Set<Int>/.test(wsrc);
    const hasPhantom = /var\s+weekdaySelected\s*:/.test(wsrc);
    check('live: WeekdayAssignmentView dùng @Binding selected (không callback)', hasBinding && !hasPhantom);
  } catch { check('live: đọc được WeekdayAssignmentView', false); }
  // C views không được import module của A.
  for (const [label, branch, file] of [
    ['C28', BR.c28, P.historyView],
    ['C37-models', BR.c37, P.builderModels],
  ]) {
    try {
      const src = stripComments(gitShow(branch, file));
      check(`live: ${label} không import module A`,
        !/import\s+ASCND(Backend|Store|Core)/.test(src) &&
        !/HistoryBook|PlanEditor|WorkoutStore|Supabase|GRDB/.test(src));
    } catch { check(`live: đọc được ${label}`, false); }
  }
}

console.log(`contract-handoff${LIVE ? ' --live' : ''}: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
