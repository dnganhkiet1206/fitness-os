#!/usr/bin/env node
/**
 * Golden cho chia sẻ buổi tập (#527, lát 11) @ fac9ac2:
 *
 * - `art`: CHÍNH `lib/community-art.ts` biên dịch — `pickArt`, `artStyles`,
 *   `workoutTags`, `styleLabel` (en / vi).
 * - `payload`: `payloadFromSession` (`hooks/use-community.ts`) chép nguyên văn.
 *
 *   node gen-community-share.mjs > ../../Packages/ASCNDKit/Tests/ASCNDCoreTests/Fixtures/community-share-golden.json
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { pickArt, artStyles, workoutTags, styleLabel } = require('./out/community-art.js');

function payloadFromSession(s, minutes) {
  const sets = Array.isArray(s.sets) ? s.sets : [];
  const order = [];
  const per = new Map();
  for (const x of sets) {
    if (x.warmup) continue;
    const name = (x.exerciseName ?? '').trim() || '?';
    const k = x.exerciseId || `name:${name}`;
    const w = Number(x.weight) || 0;
    const r = Math.round(Number(x.reps) || 0);
    const cur = per.get(k);
    if (!cur) {
      order.push(k);
      per.set(k, { exerciseId: x.exerciseId ?? null, exerciseName: name, library: false, sets: 1, weight: w, reps: r });
    } else {
      cur.sets += 1;
      if (w > cur.weight || (w === cur.weight && r > cur.reps)) {
        cur.weight = w;
        cur.reps = r;
      }
    }
  }
  const exercises = order.map((k) => per.get(k));
  return {
    title: s.template_name?.trim() || null,
    performedAt: s.date_time,
    volumeKg: Math.round((Number(s.volume_load) || 0) * 10) / 10,
    pr: !!s.pr_detected,
    minutes: minutes && minutes >= 1 && minutes <= 600 ? minutes : null,
    exerciseCount: exercises.length,
    exercises,
  };
}

let seed = 6161;
const rnd = (n) => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return Math.floor(seed / 65536) % n;
};
const pick = (xs) => xs[rnd(xs.length)];

const KINDS = ['workout', 'recipe', 'progress'];
const STYLES = ['mono', 'neon', 'paper', 'photo', 'line', 'retro_wave'];
const TAGS = ['legs', 'push', 'pull', 'cardio', 'full', 'bowl'];
const art = [];
for (let i = 0; i < 160; i++) {
  const library = Array.from({ length: rnd(9) }, (_, j) => ({
    id: `a${rnd(12)}`, kind: pick(KINDS), style: pick(STYLES),
    tags: Array.from({ length: rnd(3) }, () => pick(TAGS)), path: `p/${j}.webp`, alt_en: '', alt_vi: '',
    active: rnd(5) > 0, sort: pick([0, 1, 2, 5, 10]),
  }));
  const kind = pick(KINDS);
  const tags = Array.from({ length: rnd(3) }, () => pick(TAGS));
  const style = pick([null, null, ...STYLES]);
  const got = pickArt(library, kind, { tags, style });
  art.push({ library, kind, tags, style, pick: got ? `${got.id}|${got.path}` : null, styles: artStyles(library, kind) });
}

const NAMES = ['Back Squat', 'Leg Press', 'Bench Press', 'Pull-up', 'Chin up', 'Lat Pulldown', 'Running', 'Đạp xe', 'Đẩy ngực', 'Kéo xà', 'Gánh đùi', 'Plank', 'Face Pull', 'Bicep Curl', 'Treadmill', 'Rowing machine', 'Dumbbell Row', 'Calf raise', 'Mông cầu', 'CHÂN SAU', 'flat', 'Lat raise'];
const tags = [];
for (let i = 0; i < 120; i++) {
  const names = Array.from({ length: rnd(5) }, () => pick(NAMES));
  tags.push({ names, out: workoutTags(names) });
}
const labels = ['mono', 'neon', 'paper', 'photo', 'line', 'retro_wave', 'a__b', '_', 'x'].flatMap((s) =>
  ['en', 'vi'].map((lang) => ({ style: s, lang, out: styleLabel(s, lang) })),
);

const EX = [
  { exerciseId: 'e1', exerciseName: 'Squat' }, { exerciseId: 'e2', exerciseName: ' Bench ' }, { exerciseId: '', exerciseName: 'Row' },
  { exerciseName: 'Row' }, { exerciseName: '  ' }, { exerciseId: 'e1', exerciseName: 'Squat (alt name)' }, {},
];
const payload = [];
for (let i = 0; i < 160; i++) {
  const sets = rnd(10) === 0 ? pick([null, 'x', {}]) : Array.from({ length: rnd(9) }, () => ({
    ...pick(EX),
    weight: pick([0, 20, 60, 60, 82.5, '40', null, undefined, 'abc', -5]),
    reps: pick([0, 5, 8, 8, 12, 2.5, '10', null, undefined, 7.5]),
    warmup: pick([false, false, false, true, undefined, 1]),
  }));
  const s = {
    template_name: pick(['Push A', '  Leg day ', '', null, undefined]),
    date_time: '2026-10-10T07:00:00+00:00',
    volume_load: pick([0, 1234.56, 999.95, '500', null, 12.34]),
    pr_detected: pick([true, false, null]),
    sets,
  };
  const minutes = pick([null, 0, 1, 45, 600, 601]);
  payload.push({ session: s, minutes, out: payloadFromSession(s, minutes) });
}

process.stdout.write(JSON.stringify({ art, tags, labels, payload }, null, 1) + '\n');
