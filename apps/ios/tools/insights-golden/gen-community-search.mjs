#!/usr/bin/env node
/**
 * Golden cho màn Tìm (#527, lát 8) @ fac9ac2 — chép NGUYÊN VĂN từ
 * `hooks/use-community.ts` / `app/community-search.tsx`:
 *
 * - `term`: `searchTerm`, `searching` (`searchTerm(term).length >= 2`), lời
 *   nhắc 1 ký tự, chuỗi gửi server của từng phân đoạn (`useSearchPeople`:
 *   `searchTerm(q).toLowerCase()`; `useFindRecipes` / `useSearchPosts`:
 *   `q.trim().toLowerCase()`) và `enabled` (`>= 2`).
 * - `why`: lý do của một gợi ý (`is_official` → chính thức; `recent_posts`
 *   truthy → N bài; không thì `@handle`).
 * - `order`: `ids.map(byId.get).filter(Boolean)` sau `.in()`.
 *
 *   node gen-community-search.mjs > ../../Packages/ASCNDKit/Tests/ASCNDCoreTests/Fixtures/community-search-golden.json
 */
const searchTerm = (q) => q.trim().replace(/^@+/, '');

let seed = 4343;
const rnd = (n) => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return Math.floor(seed / 65536) % n;
};
const pick = (xs) => xs[rnd(xs.length)];

const PARTS = ['@', '@@', ' ', ' ', '\t', '\n', '　', '﻿', 'a', 'B', 'Gà', 'ÁP', 'chảo', 'İ', 'ß', '😀', 'x', '1', '-'];
const term = [];
const seen = new Set();
const push = (typed, searched) => {
  const k = typed + '\u0000' + searched;
  if (seen.has(k)) return;
  seen.add(k);
  const out = { searchTerm: searchTerm(searched), searching: searchTerm(searched).length >= 2 };
  out.minHint = !out.searching && searchTerm(typed).length === 1;
  const people = searchTerm(searched).toLowerCase();
  const recipe = searched.trim().toLowerCase();
  out.people = people.length >= 2 ? people : null;
  out.recipe = recipe.length >= 2 ? recipe : null;
  out.trimmed = searched.trim();
  term.push({ typed, searched, ...out });
};
for (const s of ['', 'a', '@a', '@ab', 'ab', ' a ', '@@', '@ @a', 'a@', '😀', '@😀', 'İs', 'Gà ÁP']) push(s, s);
for (let i = 0; i < 400; i++) {
  const s = Array.from({ length: rnd(5) }, () => pick(PARTS)).join('');
  const t = rnd(3) === 0 ? Array.from({ length: rnd(3) }, () => pick(PARTS)).join('') : s;
  push(t, s);
}

const why = [];
// `is_official` là cột boolean ở server.
for (const is_official of [true, false, null, undefined]) {
  for (const recent_posts of [0, 1, 2, 14, null, undefined]) {
    const p = { handle: 'koa', is_official, recent_posts };
    const w = p.is_official ? { kind: 'official' } : p.recent_posts ? { kind: 'active', n: p.recent_posts } : { kind: 'handle', text: `@${p.handle}` };
    const row = { user_id: 'u1', handle: 'koa', display_name: 'Koa' };
    if (is_official !== undefined) row.is_official = is_official;
    if (recent_posts !== undefined) row.recent_posts = recent_posts;
    why.push({ row, out: w });
  }
}

const order = [];
for (let i = 0; i < 80; i++) {
  const ids = Array.from({ length: rnd(7) }, () => `p${rnd(8)}`);
  const rows = Array.from({ length: rnd(8) }, () => ({ id: `p${rnd(8)}` }));
  const byId = new Map(rows.map((r) => [r.id, r]));
  order.push({ ids, rows, out: ids.map((id) => byId.get(id)).filter((r) => !!r).map((r) => r.id) });
}

process.stdout.write(JSON.stringify({ term, why, order }, null, 1) + '\n');
