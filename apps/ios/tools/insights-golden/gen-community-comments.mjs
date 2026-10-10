#!/usr/bin/env node
/**
 * Golden cho bình luận Cộng đồng (#527, lát 3) — CHÍNH `lib/comment-thread.ts`
 * @ fac9ac2 biên dịch (`build.sh`): `mentionParts`, `threadComments`,
 * `replyPrefix`, `missingRoots`, `mergeCommentPages`.
 *
 *   node gen-community-comments.mjs > ../../Packages/ASCNDKit/Tests/ASCNDCoreTests/Fixtures/community-comments-golden.json
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { mentionParts, threadComments, replyPrefix, missingRoots, mergeCommentPages } = require('./out/comment-thread.js');

let seed = 2718;
const rnd = (n) => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return Math.floor(seed / 65536) % n;
};
const pick = (xs) => xs[rnd(xs.length)];

const HANDLES = ['kiet', 'a.b_c', 'ann', 'k2', 'x_y', 'dev.team'];
const TOKENS = [
  '@kiet', '@Kiet', '@KIET.', '@a.b_c', '@a.b_c.', '@ann,', '@k2!', '@x_y', '@dev.team.', '@dev', '@', '@.',
  '@@kiet', 'email@kiet.com', 'chào', ' ', '  ', '\n', '😀', 'Kiệt', '@kiệt', 'tốt lắm', '@ann@k2', '#tag', '.',
];
const mentions = [];
for (let i = 0; i < 160; i++) {
  const body = Array.from({ length: 1 + rnd(7) }, () => pick(TOKENS)).join(pick(['', ' ', ' ']));
  const known = HANDLES.filter(() => rnd(2)).map((h) => [h, `u-${h}`]);
  mentions.push({ body, known, out: mentionParts(body, new Map(known)) });
}

const TIMES = ['2026-10-09T10:00:00+00:00', '2026-10-09T10:00:00.5+00:00', '2026-10-09T11:00:00+00:00', '2026-10-10T09:00:00+00:00'];
const threads = [];
for (let i = 0; i < 120; i++) {
  const n = rnd(9);
  const list = [];
  for (let k = 0; k < n; k++) {
    const r = rnd(4);
    const parent = r === 0 && list.length ? list[rnd(list.length)].id : r === 1 ? `gone-${rnd(3)}` : null;
    list.push({ id: `c${i}-${k}`, parent_id: parent, created_at: pick(TIMES) });
  }
  threads.push({ list, out: threadComments(list).map((t) => ({ root: t.root.id, replies: t.replies.map((x) => x.id) })) });
}

const missing = [];
for (let i = 0; i < 60; i++) {
  const rows = Array.from({ length: rnd(7) }, (_, k) => ({
    id: `r${i}-${k}`,
    parent_id: pick([null, null, `r${i}-${rnd(6)}`, `old-${rnd(3)}`]),
  }));
  missing.push({ rows, out: missingRoots(rows) });
}

const merges = [];
for (let i = 0; i < 60; i++) {
  let tag = 0;
  const mk = () => ({ id: `m${rnd(8)}`, created_at: pick(TIMES), tag: tag++ });
  const pages = Array.from({ length: 1 + rnd(3) }, () => ({
    rows: Array.from({ length: rnd(5) }, mk),
    roots: Array.from({ length: rnd(3) }, mk),
  }));
  merges.push({ pages, out: mergeCommentPages(pages).map((c) => c.tag) });
}

const prefix = [null, undefined, '', 'kiet', 'a.b_c'].map((h) => ({ handle: h ?? null, out: replyPrefix(h) }));

process.stdout.write(JSON.stringify({ mentions, threads, missing, merges, prefix }, null, 1) + '\n');
