#!/usr/bin/env node
/**
 * Golden cho feed Cộng đồng (#527) — mã RN @ fac9ac2 biên dịch (`build.sh`):
 * `lib/feed-page.ts` (con trỏ khoá, bộ lọc PostgREST), `lib/recipe-post.ts`
 * (`readRecipePayload`), `lib/time-ago.ts`, và các hàm đọc thuần của
 * `hooks/use-community.ts` trích nguyên văn (`extract-community.mjs`):
 * `readWorkoutPayload`, `readProgressPayload`, `readDiscoverKinds`.
 *
 *   node gen-community-feed.mjs > ../../Packages/ASCNDKit/Tests/ASCNDCoreTests/Fixtures/community-feed-golden.json
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { nextCursor, prevCursor, olderThan, newerThan } = require('./out/feed-page.js');
const { readRecipePayload } = require('./out/recipe-post.js');
const { timeAgo } = require('./out/time-ago.js');
const { readWorkoutPayload, readProgressPayload, readDiscoverKinds } = require('./out/community-readers.js');

let seed = 3141;
const rnd = (n) => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return Math.floor(seed / 65536) % n;
};
const pick = (xs) => xs[rnd(xs.length)];
/* Payload đến qua JSON: `undefined` mất khoá, NaN thành null. Chạy mã RN trên
   đúng giá trị native đọc được. */
const wire = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));

const NUMS = [undefined, null, 0, 12, 12.5, -3, '40', '', 'abc', NaN, 600, 601, 1e9];
const STRS = [undefined, null, '', '  ', 'Push day', 42, 'Chân & mông'];

const workouts = [];
for (let i = 0; i < 120; i++) {
  const raw =
    rnd(12) === 0
      ? pick([null, 'x', 7, []])
      : {
          title: pick(STRS),
          performedAt: pick([undefined, '2026-10-01T07:00:00Z', 3]),
          volumeKg: pick(NUMS),
          pr: pick([true, false, 'true', undefined]),
          minutes: pick(NUMS),
          exerciseCount: rnd(3) === 0 ? undefined : pick(NUMS),
          exercises:
            rnd(8) === 0
              ? pick([null, 'x', {}])
              : Array.from({ length: rnd(5) }, () =>
                  rnd(10) === 0
                    ? pick([null, 3, 'x'])
                    : {
                        exerciseId: pick([undefined, '', 'ex-1', 9]),
                        exerciseName: pick([undefined, 'Squat', 7, '']),
                        library: pick([true, false, 1, undefined]),
                        sets: pick(NUMS),
                        weight: pick(NUMS),
                        reps: pick(NUMS),
                      },
                ),
        };
  workouts.push({ raw: wire(raw), out: readWorkoutPayload(wire(raw)) });
}

const metric = () =>
  rnd(4) === 0
    ? pick([null, 'x', {}, { start: 'a', end: 1 }])
    : { start: pick(NUMS), end: pick(NUMS), series: rnd(4) === 0 ? 'x' : Array.from({ length: rnd(5) }, () => pick(NUMS)) };
const progress = [];
for (let i = 0; i < 100; i++) {
  const lift = metric();
  if (lift && typeof lift === 'object' && rnd(2)) lift.name = pick(['Bench', '', 3]);
  const raw = rnd(15) === 0 ? null : { weeks: pick(NUMS), weight: metric(), waist: metric(), lift };
  progress.push({ raw: wire(raw), out: readProgressPayload(wire(raw)) });
}

const recipes = [];
for (let i = 0; i < 100; i++) {
  const raw =
    rnd(12) === 0
      ? pick([null, [], 'x'])
      : {
          title: pick(STRS),
          mealType: pick([undefined, '', 'lunch', 4]),
          kcal: 9999,
          ingredients:
            rnd(8) === 0
              ? 'x'
              : Array.from({ length: rnd(5) }, () =>
                  rnd(10) === 0
                    ? pick([null, [], 'x'])
                    : {
                        name: pick(STRS),
                        grams: pick(NUMS),
                        kcal: pick(NUMS),
                        protein: pick(NUMS),
                        carbs: pick(NUMS),
                        fat: pick(NUMS),
                      },
                ),
        };
  recipes.push({ raw: wire(raw), out: readRecipePayload(wire(raw)) });
}

const discover = [undefined, null, [], ['recipe'], ['x', 'progress', 'workout'], 'workout', ['recipe', 'recipe'], [1]].map(
  (v) => ({ raw: wire(v), out: readDiscoverKinds(wire(v)) }),
);

const AT = ['2026-10-09T10:00:00.123456+00:00', '2026-10-09T10:00:00+00:00', '2026-01-01T00:00:00Z'];
const cursors = [];
for (let i = 0; i < 40; i++) {
  const n = rnd(5);
  const size = [2, 3, 30][rnd(3)];
  const page = Array.from({ length: n }, (_, k) => ({ created_at: pick(AT), id: `p${i}-${k}` }));
  const param = [null, { at: AT[0], id: 'q' }, { at: AT[1], id: 'r', newer: true }][rnd(3)];
  cursors.push({ page, size, param, next: nextCursor(page, size) ?? null, prev: prevCursor(page, param, size) ?? null });
}
const filters = AT.map((at) => ({ at, id: 'id-1', older: olderThan({ at, id: 'id-1' }), newer: newerThan({ at, id: 'id-1' }) }));

const S = { nCmJustNow: 'now', nCmMinAgo: '{n}m', nCmHourAgo: '{n}h', nCmDayAgo: '{n}d' };
const NOW = Date.parse('2026-10-10T12:00:00Z');
const ago = [];
for (const s of [-30, 0, 59, 60, 119, 3599, 3600, 7199, 86399, 86400, 7 * 86400, 7 * 86400 + 86399, 8 * 86400, 40 * 86400]) {
  const iso = new Date(NOW - s * 1000).toISOString();
  ago.push({ iso, seconds: s, out: timeAgo(iso, S, 'en', NOW) });
}
ago.push({ iso: 'not a date', seconds: null, out: timeAgo('not a date', S, 'en', NOW) });

process.stdout.write(
  JSON.stringify({ now: NOW, workouts, progress, recipes, discover, cursors, filters, ago }, (k, v) =>
    typeof v === 'number' && !Number.isFinite(v) ? { nonFinite: String(v) } : v === undefined ? null : v,
  1) + '\n',
);
