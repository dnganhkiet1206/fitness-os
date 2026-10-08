#!/usr/bin/env node
/**
 * Golden cho builder buổi tập (#527 Phase 2): phép tính của
 * `app/workout-builder.tsx` @ fac9ac2 — `inferType`, xếp hạng nhóm cơ cho tên
 * gợi ý, lọc thư viện — chép NGUYÊN VĂN (không hàm nào export), trên CHÍNH
 * `muscleArtKeysFor` (`lib/muscle-group.ts`) và `estimatedMinutes`
 * (`lib/prescription.ts`) biên dịch.
 *
 *   ./build.sh && node gen-builder.mjs > ../../Packages/ASCNDKit/Tests/ASCNDCoreTests/Fixtures/builder-golden.json
 */
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const { muscleArtKeysFor } = require('./out/muscle-group.js');
const { estimatedMinutes } = require('./out/prescription.js');

// --- chép nguyên văn `workout-builder.tsx:155–190` ---
const PUSH = new Set(['chest', 'shoulders', 'triceps']);
const PULL = new Set(['back', 'biceps']);
const LOWER = new Set(['legs', 'glutes', 'calves']);
const within = (got, allowed) => [...got].every((k) => allowed.has(k));
function inferType(groups) {
  if (groups.size === 0) return 'custom';
  if (within(groups, new Set(['cardio']))) return 'cardio';
  if (within(groups, new Set(['abs']))) return 'custom';
  if (within(groups, PUSH)) return 'push';
  if (within(groups, PULL)) return 'pull';
  if (within(groups, LOWER)) return 'legs';
  if (within(groups, new Set([...LOWER, 'abs']))) return 'lower';
  if (within(groups, new Set([...PUSH, ...PULL, 'abs']))) return 'upper';
  return 'full_body';
}
const GROUP_KEYS = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'abs', 'legs', 'glutes', 'calves', 'cardio'];

// `groupCounts` (`:316`) + `suggestedName` (`:345`): thứ hạng nhóm, và dạng tên.
function ranking(muscleGroups) {
  const counts = new Map();
  for (const g of muscleGroups) for (const k of muscleArtKeysFor(g)) counts.set(k, (counts.get(k) ?? 0) + 1);
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k).filter((k) => GROUP_KEYS.includes(k));
  const shape = muscleGroups.length === 0 ? 'none'
    : ranked.length === 0 ? 'title'
    : ranked.length >= 4 ? 'fullBody'
    : ranked.length === 1 ? 'one' : 'two';
  return { ranked, shape, type: inferType(new Set(counts.keys())) };
}

// `visible` (`:302`): nhóm đang chọn + chữ tìm.
function visible(lib, group, search) {
  const q = search.trim().toLowerCase();
  return lib.filter((e) => (!group || muscleArtKeysFor(e.muscle_group).includes(group)) && (!q || e.name.toLowerCase().includes(q))).map((e) => e.id);
}

const types = [];
for (let mask = 0; mask < 1 << GROUP_KEYS.length; mask++) {
  const set = GROUP_KEYS.filter((_, i) => mask & (1 << i));
  types.push({ groups: set, type: inferType(new Set(set)) });
}

const rankings = [
  [], ['Chest'], ['Chest', 'Triceps'], ['Back', 'Biceps', 'Back'], ['Quads', 'Hamstrings', 'Glutes'],
  ['Chest', 'Back', 'Legs', 'Shoulders'], ['Chest/Triceps', 'Shoulders'], ['Core'], ['Full Body'], [null, ''],
  ['Ngực', 'Lưng', 'Lưng'], ['Bắp tay trước', 'Tay sau'], ['Abs', 'Quads'], ['Biceps', 'Chest', 'Biceps', 'Chest', 'Back'],
  ['chest + triceps', 'shoulders & triceps'], ['Calves', 'Cardio'], ['Unknown'], ['Chest', 'Unknown'],
].map((gs) => ({ groups: gs, ...ranking(gs) }));

const minutes = [
  [], [{ sets: 3, reps: 10, restSeconds: 90 }], [{ sets: 1, reps: 1, restSeconds: 0 }],
  [{ sets: 4, reps: 8 }, { sets: 3, reps: 12, restSeconds: 60 }], [{ sets: 5, reps: 5, restSeconds: 180 }],
  [{ sets: 3 }, { reps: 10 }], [{ sets: 3, reps: 10, restSeconds: 90 }, { sets: 3, reps: 10, restSeconds: 90 }, { sets: 3, reps: 15, restSeconds: 45 }],
  [{ sets: 1, reps: 10, restSeconds: 0 }], [{ sets: 2, reps: 5, restSeconds: 5 }],
].map((items) => ({ items, minutes: estimatedMinutes(items) }));

const lib = [
  { id: 'a', name: 'Bench Press', muscle_group: 'Chest' }, { id: 'b', name: 'Incline Dumbbell Press', muscle_group: 'Chest/Shoulders' },
  { id: 'c', name: 'Pull-up', muscle_group: 'Back' }, { id: 'd', name: 'Squat', muscle_group: 'Quads' },
  { id: 'e', name: 'Plank', muscle_group: 'Core' }, { id: 'f', name: 'Curl', muscle_group: 'Biceps' },
  { id: 'g', name: 'Mystery', muscle_group: null }, { id: 'h', name: 'Đẩy ngực', muscle_group: 'Ngực' },
];
const filters = [];
for (const group of [null, ...GROUP_KEYS]) {
  for (const search of ['', 'press', '  PRESS ', 'u', 'zzz', 'ngực']) filters.push({ group, search, ids: visible(lib, group, search) });
}

process.stdout.write(JSON.stringify({ source: 'app/workout-builder.tsx @ fac9ac2', types, rankings, minutes, library: lib, filters }, null, 1) + '\n');
