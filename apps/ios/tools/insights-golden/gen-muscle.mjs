#!/usr/bin/env node
/**
 * Golden cho thư viện bài tập (#420): `muscleArtKeysFor` / `canonicalMuscleGroup`
 * / `muscleGroupLabel` của CHÍNH `native/src/lib/muscle-group.ts` @ fac9ac2.
 *
 *   ./build.sh && node gen-muscle.mjs > ../../Packages/ASCNDKit/Tests/ASCNDCoreTests/Fixtures/muscle-golden.json
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { muscleArtKeysFor, canonicalMuscleGroup, muscleGroupLabel } = require('./out/muscle-group.js');

const inputs = [
  null, '', '   ', 'chest', 'Chest', 'CHEST ', 'Ngực', 'ngực', 'NGỰC', 'Lưng', 'Vai', 'Tay trước', 'Tay sau',
  'Chân', 'Chân trước', 'Chân sau', 'Bắp chân', 'Bắp tay trước', 'Mông', 'Bụng', 'Toàn thân', 'Tim mạch',
  'quads', 'Hamstrings', 'hamstring', 'Core', 'Full Body', 'fullbody', 'cardio', 'glutes', 'calves',
  'Chest/Triceps', 'chest, shoulders', 'back+biceps', 'legs & glutes', 'Quads/Hamstrings', 'Upper chest',
  'lower back', 'rear delts', 'Đùi', 'đùi trước', 'Cẳng tay', 'Chest  /  Back', 'Bắp   chân', 'Lưng xô',
  'Calves/Calves', 'Biceps/Bicep curl', 'abs / core', 'Shoulders (side)', 'xyz', 'Tim mạch/Toàn thân',
];
const out = inputs.map((g) => ({
  input: g,
  keys: muscleArtKeysFor(g),
  canonical: canonicalMuscleGroup(g),
  vi: muscleGroupLabel(g, 'vi'),
  en: muscleGroupLabel(g, 'en'),
  es: muscleGroupLabel(g, 'es'),
}));
process.stdout.write(JSON.stringify({ source: 'native/src/lib/muscle-group.ts @ fac9ac2', cases: out }, null, 1) + '\n');
