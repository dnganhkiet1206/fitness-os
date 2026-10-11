#!/usr/bin/env node
/**
 * Golden cho hộp thông báo (#527, lát 9) @ fac9ac2 — chép NGUYÊN VĂN:
 *
 * - `build`: thân `queryFn` của `useInbox` sau khi đọc (gộp lượt thích theo
 *   bài, mốc thử thách, loại lạ, dòng không còn ai) + `localizeChallenge`.
 * - `sentence` / `open` của `app/community-inbox.tsx` (loại câu + số "người
 *   khác"; đích chạm).
 *
 *   node gen-community-inbox.mjs > ../../Packages/ASCNDKit/Tests/ASCNDCoreTests/Fixtures/community-inbox-golden.json
 */
function localizeChallenge(row, lang) {
  if (lang !== 'en') return row;
  return {
    ...row,
    title: row.title_en?.trim() ? row.title_en : row.title,
    description: row.description_en?.trim() ? row.description_en : row.description,
  };
}

function build(list, profs, chs, lang) {
  if (list.length === 0) return [];
  const byId = new Map((profs ?? []).map((p) => [p.user_id, p]));
  const chById = new Map((chs ?? []).map((ch) => [ch.id, localizeChallenge(ch, lang)]));
  const out = [];
  const likeGroups = new Map();
  for (const r of list) {
    const kind = ['like', 'comment', 'follow', 'reply', 'mention', 'save', 'try', 'challenge_milestone'].find((k) => k === r.kind);
    if (!kind) continue;
    if (kind === 'challenge_milestone') {
      const ch = r.challenge_id ? chById.get(r.challenge_id) : undefined;
      if (!ch || (r.milestone !== 50 && r.milestone !== 100)) continue;
      out.push({ key: r.id, kind, actors: [], count: 1, postId: null, at: r.created_at, unread: r.read_at === null,
        challenge: { id: ch.id, title: ch.title, milestone: r.milestone } });
      continue;
    }
    const actor = r.actor_id ? byId.get(r.actor_id) : undefined;
    if (kind === 'like' && r.post_id) {
      const g = likeGroups.get(r.post_id);
      if (g) {
        g.count += 1;
        if (actor) g.actors.push(actor);
        g.unread ||= r.read_at === null;
        continue;
      }
      const item = { key: `like:${r.post_id}`, kind, actors: actor ? [actor] : [], count: 1, postId: r.post_id, at: r.created_at, unread: r.read_at === null };
      likeGroups.set(r.post_id, item);
      out.push(item);
      continue;
    }
    out.push({ key: r.id, kind, actors: actor ? [actor] : [], count: 1, postId: r.post_id, at: r.created_at, unread: r.read_at === null });
  }
  return out.filter((x) => x.actors.length > 0 || x.challenge);
}

/* `sentence` của màn, trả loại câu thay vì chữ. */
const sentence = (x) =>
  x.kind === 'follow' ? 'follow' : x.kind === 'comment' ? 'comment' : x.kind === 'reply' ? 'reply'
    : x.kind === 'mention' ? 'mention' : x.kind === 'save' ? 'save' : x.kind === 'try' ? 'try'
      : x.challenge ? (x.challenge.milestone === 100 ? 'done' : 'half')
        : x.count > 1 ? `likeMany:${x.count - 1}` : 'like';

/* `open` của màn, trả đích thay vì `nav.push`. */
const open = (x) => {
  if (x.challenge) return `challenge:${x.challenge.id}`;
  else if (x.kind === 'follow') return `user:${x.actors[0].user_id}`;
  else if (x.postId) return `post:${x.postId}`;
  return null;
};

let seed = 1313;
const rnd = (n) => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return Math.floor(seed / 65536) % n;
};
const pick = (xs) => xs[rnd(xs.length)];

const KINDS = ['like', 'like', 'like', 'comment', 'follow', 'reply', 'mention', 'save', 'try', 'challenge_milestone', 'challenge_milestone', 'weird'];
const ACTORS = ['a1', 'a2', 'a3', 'gone', null];
const POSTS = ['p1', 'p2', 'p3', '', null];
const CH = ['c1', 'c2', 'cx', null];
const PROFS = [
  { user_id: 'a1', handle: 'linh', display_name: 'Linh', mascot_id: 'koa' },
  { user_id: 'a2', handle: 'minh', display_name: 'Minh', mascot_id: null },
  { user_id: 'a3', handle: 'an', display_name: 'An', is_official: true },
];
const CHS = [
  { id: 'c1', title: 'Chạy 5 ngày', title_en: 'Run 5 days', description: '', description_en: null },
  { id: 'c2', title: 'Ngủ đủ', title_en: '  ', description: '', description_en: null },
];

const cases = [];
for (let i = 0; i < 160; i++) {
  const n = rnd(14);
  const rows = Array.from({ length: n }, (_, k) => ({
    id: `n${k}`,
    actor_id: pick(ACTORS),
    kind: pick(KINDS),
    post_id: pick(POSTS),
    challenge_id: pick(CH),
    milestone: pick([50, 100, 25, null]),
    created_at: `2026-10-${String(10 - Math.floor(k / 3)).padStart(2, '0')}T0${k % 10}:00:00+00:00`,
    read_at: rnd(2) ? null : '2026-10-10T00:00:00+00:00',
  }));
  const lang = pick(['vi', 'en', 'es']);
  const items = build(rows, PROFS, CHS, lang);
  cases.push({
    rows, lang,
    out: items.map((x) => ({
      key: x.key, kind: x.kind, actors: x.actors.map((a) => a.user_id), count: x.count, postId: x.postId ?? null,
      at: x.at, unread: x.unread, challenge: x.challenge ?? null, sentence: sentence(x), open: open(x),
    })),
  });
}

process.stdout.write(JSON.stringify({ profiles: PROFS, challenges: CHS, cases }, null, 1) + '\n');
