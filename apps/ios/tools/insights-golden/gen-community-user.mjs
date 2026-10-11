#!/usr/bin/env node
/**
 * Golden cho trang người dùng Cộng đồng (#527, lát 5) @ fac9ac2:
 *
 * - `journey`: CHÍNH `lib/progress-journey.ts` biên dịch (`buildJourney`) +
 *   phần đổi đơn vị / chênh lệch của `components/ascnd/progress-journey.tsx`
 *   (`displayWeight` của `lib/units.ts` biên dịch; eo theo cm).
 * - `kinds`: `useCommunityUserKinds` (`KIND_ORDER.filter(have.has)`) và các
 *   biểu thức của `app/community-user.tsx`: loại đang lọc, hàng lọc (≥ 2),
 *   thẻ Hành trình — chép nguyên văn.
 * - `stats`: `useUserStats` (hàng đầu RPC, `?? 0`).
 *
 *   node gen-community-user.mjs > ../../Packages/ASCNDKit/Tests/ASCNDCoreTests/Fixtures/community-user-golden.json
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { buildJourney } = require('./out/progress-journey.js');
const { displayWeight } = require('./out/units.js');

let seed = 8086;
const rnd = (n) => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return Math.floor(seed / 65536) % n;
};
const pick = (xs) => xs[rnd(xs.length)];

const TIMES = ['2026-01-05T08:00:00+00:00', '2026-03-01T09:30:00+00:00', '2026-03-01T09:30:00+00:00', '2026-06-12T18:00:00+00:00', '2026-09-30T07:15:00+00:00', '2025-11-20T12:00:00+00:00'];
const NUMS = [70, 72.5, 68.3, 81.25, 90, '74.4', '', null, undefined, 'x', true, [71], 0, -3.5];
const metricV = () => (rnd(5) === 0 ? pick([null, 'nope', 5, []]) : { start: pick(NUMS), end: pick(NUMS) });
const LIFTS = ['Squat', 'Squat', '  Squat ', 'Bench press', 'Bench press', 'Deadlift', '', null, 7];

const journey = [];
for (let i = 0; i < 220; i++) {
  const posts = Array.from({ length: rnd(11) }, (_, k) => {
    const payload = rnd(10) === 0 ? pick([null, 'str', 3]) : {};
    if (payload && typeof payload === 'object') {
      if (rnd(3)) payload.weight = metricV();
      if (rnd(3) === 0) payload.waist = metricV();
      if (rnd(2)) payload.lift = { ...(metricV() ?? {}), name: pick(LIFTS) };
    }
    return { id: `p${rnd(5)}${k}`, created_at: pick(TIMES), payload };
  });
  const j = buildJourney(posts.map((p) => ({ id: p.id, createdAt: p.created_at, payload: p.payload })));
  const unit = pick(['kg', 'lbs']);
  // progress-journey.tsx — nguyên văn phần số (eo: cm như ô eo của thẻ bài).
  const rows = j.lines.map((l) => {
    const isLen = l.key === 'waist';
    const fmt = (v) => (isLen ? Math.round(v * 10) / 10 : displayWeight(v, unit));
    const a = fmt(l.start);
    const b = fmt(l.end);
    const d = Math.round((b - a) * 10) / 10;
    return { key: l.key, name: l.name ?? null, start: a, end: b, delta: d, updates: l.updates, firstAt: l.firstAt, lastAt: l.lastAt };
  });
  journey.push({ rows: posts, unit, out: { posts: j.posts, firstAt: j.firstAt, lastAt: j.lastAt, lines: rows } });
}

const KIND_ORDER = ['workout', 'progress', 'recipe'];
const kinds = [];
for (let i = 0; i < 120; i++) {
  const raw = Array.from({ length: rnd(6) }, () => pick(['workout', 'progress', 'recipe', 'other']));
  const have = new Set(raw);
  const list = KIND_ORDER.filter((k) => have.has(k));
  const kindPick = pick(['all', 'workout', 'progress', 'recipe']);
  // community-user.tsx — nguyên văn.
  const kind = kindPick !== 'all' && !list.includes(kindPick) ? 'all' : kindPick;
  const row = list.length >= 2;
  const journeyShown = kind === 'progress' || list.join() === 'progress';
  kinds.push({ raw, pick: kindPick, out: { kinds: list, kind, row, journey: journeyShown } });
}

const stats = [];
for (const data of [[], [{ posts: 3, likes: 10, tries: 1 }], [{ posts: 0, likes: 0, tries: 0 }], [{ posts: 1 }], [{ posts: 2, likes: null, tries: 5 }], null, {}]) {
  const r = Array.isArray(data) ? data[0] : null;
  stats.push({ data, out: r ? { posts: r.posts ?? 0, likes: r.likes ?? 0, tries: r.tries ?? 0 } : null });
}

process.stdout.write(JSON.stringify({ journey, kinds, stats }, null, 1) + '\n');
