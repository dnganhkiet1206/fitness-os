#!/usr/bin/env node
/**
 * Golden cho Exercise Guide (#422): `pickContent`, `resolveExerciseMedia`,
 * `clockLabel`, `equipmentMatchKey`, `sameEquipment`, `sameMuscle` của CHÍNH
 * `native/src/lib` @ fac9ac2.
 *
 *   ./build.sh && node gen-guide.mjs > ../../Packages/ASCNDKit/Tests/ASCNDCoreTests/Fixtures/guide-golden.json
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { pickContent } = require('./out/guide-content.js');
const { resolveExerciseMedia, clockLabel } = require('./out/exercise-media.js');
const { equipmentMatchKey } = require('./out/equipment.js');
const { sameEquipment, sameMuscle } = require('./out/guide-related.js');
const { muscleArtKeysFor } = require('./out/muscle-group.js');

const content = [
  { name: 'empty', rows: [] },
  {
    name: 'vi-and-en',
    rows: [
      { locale: 'vi', instructions: [' Nằm ', '', '  '], form_cues: ['Siết bụng'], common_mistakes: null },
      { locale: 'en', instructions: ['Lie down'], form_cues: [], common_mistakes: ['Flared elbows '] },
    ],
  },
  { name: 'en-blank-falls-back-to-vi', rows: [
    { locale: 'en', instructions: ['  '], form_cues: null, common_mistakes: [] },
    { locale: 'vi', instructions: ['Đẩy'], form_cues: null, common_mistakes: null },
  ] },
  { name: 'only-en', rows: [{ locale: 'en', instructions: ['Push'], form_cues: null, common_mistakes: null }] },
  { name: 'unknown-locale', rows: [{ locale: 'es', instructions: ['Empujar'], form_cues: null, common_mistakes: null }] },
].flatMap((c) => ['vi', 'en'].map((lang) => ({ ...c, lang, out: pickContent(c.rows, lang) })));

const cap = (locale, title, description) => ({ locale, title, description });
const media = [
  { name: 'none', rows: [], legacy: null },
  { name: 'legacy-gif', rows: [], legacy: ' https://x/a.GIF?v=2 ' },
  { name: 'legacy-video', rows: [], legacy: 'https://youtu.be/abc' },
  { name: 'legacy-blank', rows: null, legacy: '   ' },
  { name: 'gallery', legacy: 'https://ignored.mp4', rows: [
    { kind: 'image', uri: 'b.png', position: 2, duration_s: 9, poster_uri: 'p', alt: ' Bên ', exercise_media_content: [cap('vi', 'Bước 2', null), cap('en', 'Step 2', 'Lower')] },
    { kind: 'image', uri: ' a.png ', position: 1, duration_s: null, poster_uri: null, alt: null, exercise_media_content: [cap('en', ' ', 'x'), cap('vi', 'Bước 1', ' Hạ ')] },
    { kind: 'video', uri: 'v.mp4', position: 3, duration_s: 12, poster_uri: null, alt: null, exercise_media_content: null },
    { kind: 'gif', uri: 'z.gif', position: 0, duration_s: null, poster_uri: null, alt: null },
    { kind: 'image', uri: '  ', position: 0, duration_s: null, poster_uri: null, alt: null },
  ] },
  { name: 'single-image', legacy: null, rows: [{ kind: 'image', uri: 'one.jpg', position: null, duration_s: null, poster_uri: null, alt: 'Alt' }] },
  { name: 'video-first', legacy: null, rows: [
    { kind: 'video', uri: 'v2.mp4', position: 1, duration_s: '45.5', poster_uri: ' poster.jpg ', alt: null, exercise_media_content: [cap('vi', 'Video', 'Mô tả')] },
    { kind: 'video', uri: 'v1.mp4', position: 1, duration_s: 'abc', poster_uri: null, alt: null },
    { kind: 'image', uri: 'i.png', position: 5, duration_s: null, poster_uri: null, alt: null },
  ] },
  { name: 'tie-on-position', legacy: null, rows: [
    { kind: 'image', uri: 'b.png', position: 0, duration_s: null, poster_uri: null, alt: null },
    { kind: 'image', uri: 'a.png', position: 0, duration_s: null, poster_uri: null, alt: null },
  ] },
].flatMap((c) => ['vi', 'en'].map((lang) => ({ ...c, lang, out: resolveExerciseMedia(c.rows, c.legacy, lang) })));

const clocks = [0, 0.4, 1, 59.5, 60, 61, 125.49, 3600].map((s) => ({ seconds: s, label: clockLabel(s) }));
const equipment = [null, '', ' Barbell ', 'DB', 'dumbbells', 'Body  weight', 'Kettlebell', 'kettle  BELL', 'db row']
  .map((raw) => ({ raw, key: equipmentMatchKey(raw) }));

const library = [
  { id: '1', name: 'Bench Press', muscle_group: 'chest', equipment: 'barbell' },
  { id: '2', name: 'Incline Press', muscle_group: 'Chest/Shoulders', equipment: 'Barbell' },
  { id: '3', name: 'bench press', muscle_group: 'chest', equipment: 'barbell' },
  { id: '4', name: 'Push-up', muscle_group: 'Ngực', equipment: 'bodyweight' },
  { id: '5', name: 'Overhead Press', muscle_group: 'shoulders', equipment: 'barbell' },
  { id: '6', name: 'Lateral Raise', muscle_group: 'Vai', equipment: 'dumbbell' },
  { id: '7', name: 'Dip', muscle_group: 'Chest/Triceps', equipment: 'Body weight' },
  { id: '8', name: '  ', muscle_group: 'chest', equipment: 'barbell' },
  { id: '9', name: 'Cable Fly', muscle_group: 'chest', equipment: 'cable' },
  { id: '10', name: 'Arnold Press', muscle_group: 'shoulders/triceps', equipment: 'Dumbbells' },
  { id: '11', name: 'Kettlebell Swing', muscle_group: 'glutes', equipment: 'Kettlebell' },
  { id: '12', name: 'Goblet Squat', muscle_group: 'legs', equipment: 'kettlebell' },
  { id: '13', name: 'Front Raise', muscle_group: 'Vai', equipment: 'dumbbell' },
  // Chung HAI nhóm với Incline Press mà tên xếp cuối: phải lên đầu tab nhóm cơ.
  { id: '14', name: 'Zercher Push Press', muscle_group: 'shoulders + chest', equipment: 'barbell' },
];
const subject = (id, name, group, equip) => ({ id, name, muscleKeys: muscleArtKeysFor(group), equipmentKey: equipmentMatchKey(equip) });
const subjects = [
  subject('1', 'Bench Press', 'chest', 'barbell'),
  subject(null, 'Lateral Raise', 'shoulders', 'DB'),
  subject('11', 'Kettlebell Swing', 'glutes', 'Kettlebell'),
  subject(null, 'Mystery', null, null),
  subject('2', 'Incline Press', 'Chest/Shoulders', 'Barbell'),
];
const related = subjects.flatMap((s) => ['vi', 'en'].flatMap((lang) => [3, 8].map((limit) => ({
  subject: s, lang, limit,
  sameEquipment: sameEquipment(library, s, lang, limit),
  sameMuscle: sameMuscle(library, s, lang, limit),
}))));

process.stdout.write(JSON.stringify({ source: 'native/src/lib @ fac9ac2', content, media, clocks, equipment, library, related }, null, 1) + '\n');
