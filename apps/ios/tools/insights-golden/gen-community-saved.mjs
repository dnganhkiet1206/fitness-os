#!/usr/bin/env node
/**
 * Golden cho thư viện Đã lưu (#527, lát 7) @ fac9ac2 — CHÍNH
 * `lib/saved-library.ts` biên dịch (`selectSaved`, `filterSaved`,
 * `savedCursor`), trên đầu vào hỏng thật: id lưu trùng, bài lạ, bài ẩn của
 * mình / người khác, `hidden` thiếu / null, hàng thiếu id, trang thiếu.
 *
 *   node gen-community-saved.mjs > ../../Packages/ASCNDKit/Tests/ASCNDCoreTests/Fixtures/community-saved-golden.json
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { selectSaved, filterSaved, savedCursor } = require('./out/saved-library.js');

let seed = 7117;
const rnd = (n) => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return Math.floor(seed / 65536) % n;
};
const pick = (xs) => xs[rnd(xs.length)];

const IDS = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];
const AUTHORS = ['me', 'u2', 'u3'];
const KINDS = ['workout', 'recipe', 'progress'];
const HIDDEN = [false, false, false, true, null, undefined];

const select = [];
for (let i = 0; i < 240; i++) {
  const ids = Array.from({ length: rnd(9) }, () => pick(IDS));
  const rows = Array.from({ length: rnd(10) }, () => {
    const r = { id: pick(IDS), author_id: pick(AUTHORS), kind: pick(KINDS) };
    const h = pick(HIDDEN);
    if (h !== undefined) r.hidden = h;
    if (rnd(15) === 0) delete r.id;
    return r;
  });
  const out = selectSaved(ids, rows, 'me');
  select.push({ ids, rows, out: out.map((r) => r.id) });
}

const filter = [];
for (let i = 0; i < 60; i++) {
  const list = Array.from({ length: rnd(7) }, (_, k) => ({ id: `p${k}`, kind: pick(KINDS) }));
  for (const f of ['workout', 'recipe', 'all']) filter.push({ list, filter: f, out: filterSaved(list, f).map((p) => p.id) });
}

const cursor = [];
for (let i = 0; i < 40; i++) {
  const page = pick([1, 3, 30]);
  const n = pick([0, page - 1, page, page + 1].filter((x) => x >= 0));
  const saves = Array.from({ length: n }, (_, k) => ({ post_id: `p${k}`, created_at: `2026-10-${String(10 - (k % 9)).padStart(2, '0')}T00:00:00+00:00` }));
  cursor.push({ saves, page, out: savedCursor(saves, page) });
}

process.stdout.write(JSON.stringify({ select, filter, cursor }, null, 1) + '\n');
