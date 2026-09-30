/**
 * Phân trang feed Cộng đồng (#20) — con trỏ keyset và phần nối của nó.
 *
 * CHẠY THẬT `nextCursor`, `olderThan`, `nearEnd`, `flatPages`, `mapPosts` đọc
 * từ `src/lib/feed-page.ts`, qua các ca có đáp án cụ thể. Ca quan trọng nhất
 * chạy con trỏ trên MÁY CHỦ GIẢ (`applyQuery` của `live-world.mjs`) qua một bảng
 * 67 bài có NHIỀU bài cùng mốc `created_at`, gồm cả bài cùng mốc nằm vắt qua
 * ranh giới trang: đi hết mọi trang phải ra đúng bảng ấy theo thứ tự, không
 * trùng, không hở. Con trỏ chỉ theo mốc (`lt`) làm hở, theo `lte` làm trùng —
 * cả hai là bản hỏng ở dưới và phải bị bắt.
 *
 * Rồi phần nối: hai hook đọc theo trang với thứ tự toàn phần `(created_at, id)`
 * và con trỏ, khoá mang `'pages'` (xem chú thích ở `useCommunityFeed`),
 * `patchPost` đi qua `mapPosts`, và hai màn feed có đuôi feed + tải khi gần đáy.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { applyQuery } from './live-world.mjs';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];
const fatal = (m) => {
  console.error(`phép tự kiểm hỏng — ${m}, đừng tin kết quả`);
  process.exit(1);
};

/* 67 bài; mốc lặp theo cụm 3·1·4·2·5 bài, nên có cụm cùng mốc vắt qua ranh
   giới trang (ca đầu kiểm điều ấy, để bảng không lặng lẽ mất tính chất này). */
const TABLE = [];
for (let i = 0, t = 0; i < 67; t++) {
  for (let k = 0; k < [3, 1, 4, 2, 5][t % 5] && i < 67; k++, i++) {
    const mm = String(59 - t).padStart(2, '0');
    TABLE.push({ id: `p${String((i * 37) % 67).padStart(3, '0')}`, created_at: `2026-09-28T10:${mm}:00.123456+00:00` });
  }
}
const ORDERED = [...TABLE].sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : a.id < b.id ? 1 : -1));

function walk(m, size) {
  const seen = [];
  let cur = null;
  for (let n = 0; n < 50; n++) {
    const q = new URLSearchParams({ order: 'created_at.desc,id.desc', limit: String(size) });
    if (cur) q.set('or', `(${m.olderThan(cur)})`);
    const page = applyQuery(TABLE, new URL(`http://x/rest/v1/t?${q}`));
    seen.push(...page.map((r) => r.id));
    cur = m.nextCursor(page, size);
    if (!cur) return seen;
  }
  return null;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const CASES = [
  ['bảng tự kiểm có bài cùng mốc vắt qua ranh giới trang 10', () => {
    const at = (i) => ORDERED[i].created_at;
    return [9, 19, 29, 39].some((i) => at(i) === at(i + 1));
  }],
  ['đi hết mọi trang cỡ 10: đúng bảng, đúng thứ tự, không trùng, không hở', (m) => same(walk(m, 10), ORDERED.map((r) => r.id))],
  ['cỡ trang 7 và 30 cũng thế', (m) => same(walk(m, 7), ORDERED.map((r) => r.id)) && same(walk(m, 30), ORDERED.map((r) => r.id))],
  ['trang đầy thì có con trỏ, là bài CUỐI trang', (m) => same(m.nextCursor([{ id: 'a', created_at: '1' }, { id: 'b', created_at: '0' }], 2), { at: '0', id: 'b' })],
  ['trang thiếu là hết feed', (m) => m.nextCursor([{ id: 'a', created_at: '1' }], 2) === undefined && m.nextCursor([], 2) === undefined],
  ['giá trị con trỏ nằm trong ngoặc kép', (m) => m.olderThan({ at: '2026-09-01T00:00:00.5+00:00', id: 'x' }) === 'created_at.lt."2026-09-01T00:00:00.5+00:00",and(created_at.eq."2026-09-01T00:00:00.5+00:00",id.lt."x")'],
  ['gần đáy: 800 điểm trước đáy là tải; xa hơn thì chưa; nội dung 0 thì không', (m) =>
    m.nearEnd(1200, 800, 2800) && !m.nearEnd(1100, 800, 2800) && !m.nearEnd(0, 800, 0)],
  ['nối trang giữ thứ tự trang', (m) => same(m.flatPages([['a', 'b'], ['c']]), ['a', 'b', 'c'])],
  ['mapPosts: mảng, trang, và thứ không phải danh sách bài đều không ném', (m) => {
    const f = (p) => (p && p.id === 'x' ? { ...p, v: 1 } : p);
    const arr = m.mapPosts([{ id: 'x' }, { id: 'y' }], f);
    const inf = m.mapPosts({ pages: [[{ id: 'y' }], [{ id: 'x' }]], pageParams: [null, 'c'] }, f);
    return same(arr, [{ id: 'x', v: 1 }, { id: 'y' }]) &&
      same(inf, { pages: [[{ id: 'y' }], [{ id: 'x', v: 1 }]], pageParams: [null, 'c'] }) &&
      same(m.mapPosts(['workout', 'recipe'], f), ['workout', 'recipe']) &&
      m.mapPosts(undefined, f) === undefined && m.mapPosts(null, f) === null;
  }],
];

const out = mkdtempSync(path.join(tmpdir(), 'feed-page-'));
const MUTANTS = [
  ['con trỏ chỉ theo mốc (lt) — bỏ bài cùng mốc, hở', /created_at\.lt\.\\?"\$\{c\.at\}\\?",and\(created_at\.eq\.\\?"\$\{c\.at\}\\?",id\.lt\.\\?"\$\{c\.id\}\\?"\)/, 'created_at.lt."${c.at}"'],
  ['con trỏ lte — lặp bài cùng mốc, trùng', /created_at\.lt\.\\?"\$\{c\.at\}\\?",and\(created_at\.eq\.\\?"\$\{c\.at\}\\?",id\.lt\.\\?"\$\{c\.id\}\\?"\)/, 'created_at.lte."${c.at}"'],
  ['con trỏ lấy bài ĐẦU trang', /const last = page\[page\.length - 1\];/, 'const last = page[0];'],
  ['trang đầy cũng coi là hết', /if \(page\.length < size\)\s*return undefined;/, 'if (page.length <= size) return undefined;'],
  ['mapPosts không hiểu dạng trang', /if \(old && typeof old === 'object' && Array\.isArray\(old\.pages\)\) \{/, 'if (false) {'],
  ['gần đáy không có khoảng đệm', /y \+ viewport >= content - exports\.NEAR_END/, 'y + viewport >= content'],
];
try {
  execFileSync('npx', ['tsc', 'src/lib/feed-page.ts', '--ignoreConfig', '--outDir', out,
    '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
  { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] });
  const compiled = readFileSync(path.join(out, 'feed-page.js'), 'utf8');
  let n = 0;
  const load = (src) => {
    const f = path.join(out, `v${n++}.js`);
    writeFileSync(f, src);
    return createRequire(import.meta.url)(f);
  };
  const runAll = (m) => CASES.filter(([, fn]) => {
    try {
      return !fn(m);
    } catch {
      return true;
    }
  }).map(([name]) => name);
  problems.push(...runAll(load(compiled)));

  for (const [name, re, to] of MUTANTS) {
    if (!re.test(compiled)) fatal(`bản hỏng "${name}": không tìm thấy chỗ để sửa (${re})`);
    if (!runAll(load(compiled.replace(re, to))).length) fatal(`bản hỏng "${name}" vẫn qua hết các ca`);
  }
} finally {
  rmSync(out, { recursive: true, force: true });
}

const hook = readFileSync(path.join(NATIVE, 'src/hooks/use-community.ts'), 'utf8');
const body = (name) => {
  const i = hook.indexOf(`export function ${name}(`);
  if (i < 0) return '';
  const j = hook.indexOf('\nexport ', i + 1);
  return hook.slice(i, j < 0 ? undefined : j);
};
const tab = readFileSync(path.join(NATIVE, 'src/app/(tabs)/community.tsx'), 'utf8');
const user = readFileSync(path.join(NATIVE, 'src/app/community-user.tsx'), 'utf8');
const WIRING = [];
for (const [name, key] of [['useCommunityFeed', "['community_feed', user?.id, tab, 'pages']"], ['useCommunityUserPosts', "['community_user_posts', user?.id, userId, kind, 'pages']"]]) {
  const b = body(name);
  WIRING.push(
    [b, /useInfiniteQuery\(/, `${name} không đọc theo trang — bài thứ ${31} trở đi không bao giờ hiện`],
    [b, new RegExp(key.replace(/[[\]?.()]/g, '\\$&')), `${name}: khoá phải là ${key} — khoá cũ trên đĩa mang hình dạng mảng, hydrate vào truy vấn theo trang là ném`],
    [b, /\.order\('created_at', \{ ascending: false \}\)\s*\.order\('id', \{ ascending: false \}\)/, `${name} không sắp theo thứ tự toàn phần (created_at, id) — con trỏ keyset hở/trùng ở bài cùng mốc`],
    [b, /if \(pageParam\) q = q\.or\(olderThan\(pageParam\)\)/, `${name} không áp con trỏ — trang hai là trang đầu`],
    [b, /getNextPageParam: \(last: FeedPost\[\]\) => nextCursor\(last, PAGE\)/, `${name} không lấy con trỏ từ trang vừa về`],
    [b, /select: \(d\) => flatPages\(d\.pages\)/, `${name} không trả một mảng bài — màn feed và useFeedHold đọc mảng`],
  );
}
const patch = hook.slice(hook.indexOf('function patchPost('), hook.indexOf('function useToggle('));
WIRING.push(
  [patch, /\['community_feed'\] \}, \(old: unknown\) => mapPosts\(old, each\)/, 'patchPost không đi qua mapPosts ở community_feed — thả tim trên feed theo trang ném `old.map is not a function`'],
  [patch, /\['community_user_posts'\] \}, \(old: unknown\) => mapPosts\(old, each\)/, 'patchPost không đi qua mapPosts ở community_user_posts'],
);
for (const [src, file] of [[tab, 'community.tsx'], [user, 'community-user.tsx']]) {
  WIRING.push(
    [src, /useLoadMore\((feed|posts)\)/, `${file} không tải trang kế khi gần đáy`],
    [src, /<FeedMore q=\{(feed|posts)\} \/>/, `${file} không có đuôi feed (đang tải · hỏng · đã hết)`],
    [src, /isError && !(feed|posts)\.isFetchNextPageError/, `${file}: trang kế hỏng thì thẻ lỗi thay CẢ feed đã tải`],
  );
}
WIRING.push([tab, /hold\.onScroll\(e\);\s*more\(e\);/, 'community.tsx: onScroll phải gọi cả viên bài mới lẫn tải thêm']);

/* #170: bình luận theo trang, MỚI NHẤT trước. Trước đây `created_at asc` rồi cắt
   200 — ở bài hơn 200 bình luận, câu mới nhất (kể cả câu vừa gửi) không hiện. */
const cm = body('useComments');
const post = readFileSync(path.join(NATIVE, 'src/app/community-post.tsx'), 'utf8');
WIRING.push(
  [cm, /useInfiniteQuery\(/, 'useComments không đọc theo trang (#170)'],
  [cm, /queryKey: \['community_comments', user\?\.id, postId, 'pages'\]/, "useComments: khoá phải mang 'pages' — cache cũ dạng mảng"],
  [cm, /\.order\('created_at', \{ ascending: false \}\)\s*\.order\('id', \{ ascending: false \}\)\s*\.limit\(COMMENT_PAGE\)/, 'useComments không đọc MỚI NHẤT trước theo (created_at, id) — câu mới nhất bị cắt'],
  [cm, /if \(pageParam\) q = q\.or\(olderThan\(pageParam\)\)/, 'useComments không áp con trỏ — trang cũ hơn là trang đầu'],
  [hook, /getQueryData<InfiniteData<CommunityComment\[\]>>\(\['community_comments', user\?\.id, postId, 'pages'\]\)/, 'useDeleteComment đọc cache bình luận theo khoá/hình dạng cũ — số trên thẻ trừ sai'],
  [post, /<OlderComments q=\{comments\} \/>/, 'community-post.tsx không có "Xem bình luận cũ hơn"'],
  [post, /comments\.isError && !comments\.isFetchNextPageError/, 'community-post.tsx: trang cũ hỏng thì thẻ lỗi thay cả luồng'],
);
for (const [src, re, msg] of WIRING) if (!re.test(src)) problems.push(msg);

if (problems.length) {
  console.error('phân trang feed CÓ LỖI:\n');
  for (const p of problems) console.error(`  • ${p}`);
  process.exit(1);
}
console.log(
  `phân trang feed OK — ${CASES.length} ca CHẠY THẬT lib/feed-page.ts, gồm đi hết một bảng ${TABLE.length} bài có bài cùng mốc vắt ` +
    `qua ranh giới trang trên máy chủ giả (cỡ 7/10/30): đúng thứ tự, không trùng, không hở. ${MUTANTS.length} bản hỏng (con trỏ lt, ` +
    `lte, bài đầu trang, trang đầy coi là hết, mapPosts mù trang, gần đáy không đệm) đều bị bắt. ${WIRING.length} điểm nối đúng, ` +
    'gồm bình luận theo trang mới nhất trước (#170)',
);
