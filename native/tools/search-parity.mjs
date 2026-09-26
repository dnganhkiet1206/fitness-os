/**
 * Fixture tìm kiếm của thế giới giả và SQL thật có CÙNG một nghĩa (#130).
 *
 * `live-rpc.mjs` dịch sang JS thân của `community_find_recipes` và
 * `community_search_profiles`: gập dấu, đầu tên hoặc đầu một từ, thoát `%`/`_`,
 * bỏ `@`, trần độ dài, thứ tự. `community_*.test.sql` canh nghĩa ấy trên
 * Postgres thật. Trước #130 không gì so hai bản: fixture trôi (còn khớp chuỗi
 * con giữa chữ như phép phá F3) thì live.mjs xanh trên một hành vi server
 * không có; sửa SQL mà quên fixture thì app trên web cư xử khác app thật.
 *
 * Nay cả hai chạy CÙNG một tệp ca — `supabase/tests/community/search_cases.json`:
 * `community_search_shared.test.sql` trong `run.sh` (SQL), và bước này qua
 * `RPC_FIXTURES[…].run` trên một thế giới dựng từ chính tệp ấy.
 *
 * ── cố ý không so ──
 *
 * Ai thấy bài nào (RLS, chặn, theo dõi, bài ẩn): fixture không có RLS, chỉ SQL
 * canh — F4–F12, S2. Tệp ca chỉ nói về nghĩa của CHUỖI TÌM.
 *
 * ── đã bắt được ──
 *
 * Lượt đầu: fixture `trim()` bỏ MỌI khoảng trắng hai đầu, `btrim()` của SQL chỉ
 * bỏ dấu cách — "\tga" ra ba món trên web, không món nào trên máy thật.
 */
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const TOOLS = path.dirname(fileURLToPath(import.meta.url));
const CASES = path.resolve(TOOLS, '..', '..', 'supabase', 'tests', 'community', 'search_cases.json');
const spec = JSON.parse(readFileSync(CASES, 'utf8'));
const { UID } = await import(pathToFileURL(path.join(TOOLS, 'live-world.mjs')).href);

const AUTHOR = '00000000-0000-4000-8000-00000000a0a0';
const world = {
  community_profiles: [
    { user_id: UID, handle: 'sc_viewer', display_name: 'Người xem', is_official: false, mascot_id: null, bio: '' },
    { user_id: AUTHOR, handle: 'sc_author', display_name: 'Người nấu', is_official: false, mascot_id: null, bio: '' },
    ...spec.profiles.people.map((p, i) => ({
      user_id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
      handle: p.handle, display_name: p.display_name, is_official: !!p.official, mascot_id: null, bio: '',
    })),
  ],
  // Mới nhất trước, như SQL: bài thứ i cũ hơn bài thứ i-1 một phút.
  community_posts: spec.recipes.titles.map((t, i) => ({
    id: `00000000-0000-4000-8000-${String(100 + i).padStart(12, '0')}`,
    author_id: AUTHOR, kind: 'recipe', payload: { title: t }, visibility: 'public', hidden: false,
    created_at: new Date(Date.parse('2026-09-26T12:00:00Z') - (i + 1) * 60000).toISOString(),
  })),
  community_blocks: [],
  community_follows: [],
};

function problemsOf(fixtures) {
  const out = [];
  const titleOf = new Map(world.community_posts.map((p) => [p.id, p.payload.title]));
  for (const c of spec.recipes.cases) {
    const got = fixtures.community_find_recipes.run({ p_q: c.q }, world).map((r) => titleOf.get(r.post_id));
    if (JSON.stringify(got) !== JSON.stringify(c.expect)) out.push(`tìm công thức ${JSON.stringify(c.q)} (${c.why}): fixture trả ${JSON.stringify(got)}, tệp ca đòi ${JSON.stringify(c.expect)}`);
  }
  for (const c of spec.profiles.cases) {
    const got = fixtures.community_search_profiles.run({ p_q: c.q }, world).map((r) => r.handle);
    if (JSON.stringify(got) !== JSON.stringify(c.expect)) out.push(`tìm người ${JSON.stringify(c.q)} (${c.why}): fixture trả ${JSON.stringify(got)}, tệp ca đòi ${JSON.stringify(c.expect)}`);
  }
  return out;
}

const { RPC_FIXTURES } = await import(pathToFileURL(path.join(TOOLS, 'live-rpc.mjs')).href);
const problems = problemsOf(RPC_FIXTURES);

/* Thử ngược, trong chính bước này: chép live-rpc.mjs, đổi "đầu một từ" thành
   "chuỗi con ở đâu cũng được" (phép phá F3 của SQL), và đòi bước này đỏ. Một
   tệp ca không bắt được lần trôi ấy là một tệp ca không đo gì. */
{
  const src = readFileSync(path.join(TOOLS, 'live-rpc.mjs'), 'utf8');
  const from = 'const startsWord = (hay, q) => hay.startsWith(q) || hay.includes(` ${q}`);';
  if (!src.includes(from)) problems.push('thử ngược không áp được: live-rpc.mjs không còn dòng `startsWord` — cập nhật search-parity.mjs');
  else {
    const tmp = path.join(TOOLS, `.search-parity-mut-${process.pid}.mjs`);
    writeFileSync(tmp, src.replace(from, 'const startsWord = (hay, q) => hay.includes(q);'));
    try {
      const mut = await import(pathToFileURL(tmp).href);
      if (problemsOf(mut.RPC_FIXTURES).length === 0) problems.push('bộ kiểm đã mất răng: fixture khớp chuỗi con giữa chữ (F3) mà mọi ca vẫn xanh');
    } finally {
      unlinkSync(tmp);
    }
  }
}

if (problems.length) {
  console.error('tìm kiếm SQL ↔ fixture CÓ LỖI:\n');
  for (const p of problems) console.error(`  • ${p}`);
  process.exit(1);
}
console.log(
  `tìm kiếm SQL ↔ fixture OK — ${spec.recipes.cases.length} ca tìm công thức và ${spec.profiles.cases.length} ca tìm người của search_cases.json ` +
    'ra đúng danh sách, đúng thứ tự qua RPC_FIXTURES; cùng tệp ấy chạy trên Postgres thật trong community_search_shared.test.sql; ' +
    'và fixture bị phá thành khớp chuỗi con (F3) thì bước này đỏ',
);
