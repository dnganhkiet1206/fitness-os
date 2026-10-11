#!/usr/bin/env node
/**
 * Golden cho thử thách cộng đồng (#527, lát 14) @ fac9ac2:
 *
 * - `pending`: CHÍNH `pendingClaims` (`lib/challenge-reminders.ts` biên dịch,
 *   trên `dayGap` / `shiftLocalDate` của `lib/local-date.ts`).
 * - `groups`: ba nhóm đầu của `app/community-challenges.tsx`, chép nguyên văn.
 * - `featured`: `featuredChallenge` (`challenge-hero.tsx`) chép nguyên văn,
 *   `localDateStr()` thay bằng `today` của ca.
 * - `localize`: `localizeChallenge`.
 *
 *   TZ=Asia/Ho_Chi_Minh node gen-community-challenges.mjs > ../../Packages/ASCNDKit/Tests/ASCNDCoreTests/Fixtures/community-challenges-golden.json
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { pendingClaims } = require('./out/challenge-reminders.js');
const { dayGap } = require('./out/local-date.js');

function groups(all, today) {
  const reached = (x) => x.progress >= x.target;
  const joined = all
    .filter((x) => x.joined && !x.claimed)
    .sort((a, b) => Number(reached(b)) - Number(reached(a)) || (a.ends_on < b.ends_on ? -1 : 1));
  const open = all
    .filter((x) => !x.joined && dayGap(today, x.starts_on) <= 0 && dayGap(today, x.ends_on) >= 0)
    .sort((a, b) => b.participants - a.participants);
  const soon = all
    .filter((x) => !x.joined && dayGap(today, x.starts_on) > 0)
    .sort((a, b) => (a.starts_on < b.starts_on ? -1 : 1));
  return { joined: joined.map((x) => x.id), open: open.map((x) => x.id), soon: soon.map((x) => x.id) };
}

function featuredChallenge(items, today) {
  const open = items.filter((x) => dayGap(today, x.ends_on) >= 0);
  return open.find((x) => x.joined && !x.claimed) ?? [...open].sort((a, b) => b.participants - a.participants)[0];
}

function localizeChallenge(row, lang) {
  if (lang !== 'en') return row;
  return { ...row, title: row.title_en?.trim() ? row.title_en : row.title, description: row.description_en?.trim() ? row.description_en : row.description };
}

let seed = 2323;
const rnd = (n) => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return Math.floor(seed / 65536) % n;
};
const pick = (xs) => xs[rnd(xs.length)];
const DAYS = ['2026-09-20', '2026-09-28', '2026-10-01', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-10', '2026-10-11', '2026-10-12', '2026-10-20', '2026-11-01', 'bad'];
const TODAY = ['2026-10-11', '2026-10-05', '2026-10-12', '2026-03-29'];

const cases = [];
for (let i = 0; i < 220; i++) {
  const today = pick(TODAY);
  const items = Array.from({ length: rnd(8) }, (_, k) => {
    let s = pick(DAYS), e = pick(DAYS);
    if (s !== 'bad' && e !== 'bad' && s > e) [s, e] = [e, s];
    const target = pick([5, 10, 30]);
    return {
      id: `c${k}`, title: `T${k}`, ends_on: e, starts_on: s, target,
      progress: pick([0, 3, target, target + 2, 29]), reward_coins: pick([0, 1, 100]),
      participants: pick([0, 3, 3, 12, 250]), joined: rnd(2) === 0, claimed: rnd(4) === 0,
    };
  });
  const f = featuredChallenge(items, today);
  cases.push({
    today, items,
    groups: groups(items, today),
    featured: f ? f.id : null,
    pending: pendingClaims(items, today).map((x) => ({ id: x.id, daysLeft: x.daysLeft })),
  });
}

const localize = [];
for (const lang of ['vi', 'en', 'es']) {
  for (const title_en of [undefined, null, '', '  ', 'Run 5 days']) {
    const row = { title: 'Chạy 5 ngày', description: 'Mô tả' };
    if (title_en !== undefined) { row.title_en = title_en; row.description_en = title_en; }
    const out = localizeChallenge(row, lang);
    localize.push({ lang, row, title: out.title, description: out.description });
  }
}

process.stdout.write(JSON.stringify({ cases, localize }, null, 1) + '\n');
