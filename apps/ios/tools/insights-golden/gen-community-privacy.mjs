#!/usr/bin/env node
/**
 * Golden cho Quyền riêng tư (#527, lát 10) @ fac9ac2 — chép NGUYÊN VĂN từ
 * `hooks/use-community.ts` / `app/community-privacy.tsx`:
 *
 * - `settings`: phần đọc hàng của `readCommunitySettings` + `readDiscoverKinds`.
 * - `kinds`: `DISCOVER_KINDS.filter((x) => (x === k ? v : kinds.includes(x)))`
 *   và khoá công tắc cuối (`on && kinds.length === 1`).
 * - `people`: phần dựng danh sách của `useBlockedUsers` / `useMutedUsers`.
 *
 *   node gen-community-privacy.mjs > ../../Packages/ASCNDKit/Tests/ASCNDCoreTests/Fixtures/community-privacy-golden.json
 */
const DISCOVER_KINDS = ['workout', 'progress', 'recipe'];
const NOTIFY_KEYS = ['likes', 'comments', 'mentions', 'follows', 'saves', 'tries', 'challenges'];
function readDiscoverKinds(v) {
  const ok = Array.isArray(v) ? DISCOVER_KINDS.filter((k) => v.includes(k)) : [];
  return ok.length ? ok : [...DISCOVER_KINDS];
}
const readRow = (row) => ({
  defaultVisibility: row?.default_visibility === 'followers' ? 'followers' : 'public',
  showBadges: row?.show_badges === true,
  notify: Object.fromEntries(NOTIFY_KEYS.map((k) => [k, row?.[`notify_${k}`] !== false])),
  discoverKinds: readDiscoverKinds(row?.discover_kinds),
});

let seed = 2929;
const rnd = (n) => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return Math.floor(seed / 65536) % n;
};
const pick = (xs) => xs[rnd(xs.length)];

const settings = [{ row: null, out: readRow(null) }];
for (let i = 0; i < 150; i++) {
  const row = {};
  const put = (k, xs) => { const v = pick(xs); if (v !== undefined) row[k] = v; };
  put('default_visibility', ['public', 'followers', 'Followers', null, undefined, 3]);
  put('show_badges', [true, false, null, undefined, 'true', 1]);
  put('discover_kinds', [['workout'], ['recipe', 'workout'], [], ['x'], null, undefined, 'workout', ['progress', 'progress'], ['recipe', 'progress', 'workout']]);
  for (const k of NOTIFY_KEYS) put(`notify_${k}`, [true, false, null, undefined, 0, 'false']);
  settings.push({ row, out: readRow(row) });
}

const kinds = [];
const SETS = [['workout'], ['progress'], ['recipe'], ['workout', 'progress'], ['workout', 'recipe'], ['progress', 'recipe'], ['workout', 'progress', 'recipe']];
for (const set of SETS) for (const k of DISCOVER_KINDS) for (const v of [true, false]) {
  const on = set.includes(k);
  kinds.push({ kinds: set, k, v, out: DISCOVER_KINDS.filter((x) => (x === k ? v : set.includes(x))), last: on && set.length === 1 });
}

const PROFS = [
  { user_id: 'u1', handle: 'linh', display_name: 'Linh', mascot_id: 'koa' },
  { user_id: 'u3', handle: 'an', display_name: 'An' },
];
const people = [];
for (let i = 0; i < 40; i++) {
  const rows = Array.from({ length: rnd(5) }, (_, j) => ({ blocked_id: pick(['u1', 'u2', 'u3']), created_at: `2026-10-0${j + 1}T00:00:00+00:00` }));
  const byId = new Map(PROFS.map((p) => [p.user_id, p]));
  const out = rows.map((r) => ({ user_id: r.blocked_id, since: r.created_at, profile: byId.get(r.blocked_id) ?? null }));
  people.push({ rows, out: out.map((x) => ({ user_id: x.user_id, since: x.since, profile: x.profile ? x.profile.user_id : null })) });
}

process.stdout.write(JSON.stringify({ settings, kinds, profiles: PROFS, people }, null, 1) + '\n');
