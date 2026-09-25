/**
 * Máy chủ giả phải trả lời ĐÚNG CÂU HỎI app gửi đi.
 *
 * ── lỗi nó sinh ra để sửa ──
 *
 * `live.mjs` dựng app thật trên một máy chủ giả trả `FIXTURES[table]` nguyên
 * bảng, theo đúng thứ tự tôi gõ trong `live-world.mjs`. `.order()` bị bỏ qua.
 *
 * Đo được: trong 27 chỗ app gọi `.order()`, **sáu bảng** đang nằm ở thứ tự app
 * không bao giờ hỏi. Nó vừa gây hậu quả thật — biểu đồ bảy đêm của
 * `sleep-insights` vẽ đêm MỚI NHẤT ở bên trái trong ảnh chụp, ngược mọi quy
 * ước chuỗi thời gian — và app thì đúng: `useSleepHistory` gọi
 * `.order('waketime', { ascending: true })`.
 *
 * Đó là hạng lỗi tệ nhất một bộ chạy có thể mắc: nó không đỏ, nó BỊA. Người
 * đọc ảnh chụp sẽ đi sửa một lỗi không tồn tại, hoặc tệ hơn, sẽ quen mắt với
 * một thứ tự sai và không nhận ra khi app sắp sai thật.
 *
 * ── vì sao không sắp lại fixture bằng tay ──
 *
 * Vì không có thứ tự nào đúng được cho cả hai phía. `sleep_logs` bị hỏi
 * `waketime.asc` bởi `useSleepHistory` và `waketime.desc` bởi `useTodaySleep`;
 * `meal_entries` cũng thế với `date_time`. Một mảng chỉ có một thứ tự, nên thứ
 * phải biết sắp xếp là MÁY CHỦ.
 *
 * ── ba vế, và vế thứ ba là vế hay hỏng nhất ──
 *
 *   1. `applyQuery` sắp đúng: một cột, nhiều cột, chiều, NULL, `limit`.
 *   2. Mọi cột app gọi `.order()` đều CÓ THẬT trong hàng fixture của bảng ấy.
 *      Thiếu cột thì việc sắp là một phép rỗng — im lặng, xanh, và vô nghĩa.
 *      Bắt được ngay lần đầu: `meal_entry_items` thiếu `created_at`.
 *   3. `live.mjs` thật sự GỌI `applyQuery`. Một hàm đúng mà không ai gọi là
 *      thứ kho này đã tìm thấy bốn lần: `Screen.aura` không caller,
 *      `PageAura` không caller, hai bộ đo sáng trùng nhau, và một `AmbientBackground`
 *      tôi tự dựng lên cạnh một cái đã có sẵn.
 *
 * Từ #17 vế 1 kiểm cả bộ lọc `eq`/`neq`/`in`/`is`. KHÔNG lọc `gte`/`lt`: máy
 * chủ giả không lọc theo ngày, đó là giới hạn đã được ghi trong `live.mjs` ở
 * kịch bản "nhật ký ngày khác", và nó vẫn còn nguyên — một ca dưới đây đòi
 * chúng được GIỮ NGUYÊN.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { FIXTURES, UID as UID_, applyQuery } from './live-world.mjs';
import { requestRejection, selectRejection, unknownSelectColumns } from './postgrest-select.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const problems = [];

/* ── vế 1: applyQuery có sắp thật không ─────────────────────────────────── */

const url = (q) => new URL(`https://x.supabase.co/rest/v1/t?${q}`);
const ids = (rows) => rows.map((r) => r.id).join(',');

const CASES = [
  {
    name: 'một cột, tăng dần',
    rows: [{ id: 'c' }, { id: 'a' }, { id: 'b' }].map((r) => ({ ...r, k: r.id })),
    q: 'order=k.asc',
    want: 'a,b,c',
  },
  {
    name: 'một cột, giảm dần',
    rows: [{ id: 'a', k: 'a' }, { id: 'c', k: 'c' }, { id: 'b', k: 'b' }],
    q: 'order=k.desc',
    want: 'c,b,a',
  },
  {
    /* supabase-js nối nhiều lần gọi `.order()` vào cùng một tham số, phân
       cách bằng dấu phẩy — `use-library.ts` gọi hai lần trên `meal_plan_items`. */
    name: 'hai cột, cột hai phân định thế hoà',
    rows: [
      { id: 'b2', a: 1, b: 2 },
      { id: 'a9', a: 0, b: 9 },
      { id: 'b1', a: 1, b: 1 },
    ],
    q: 'order=a.asc,b.asc',
    want: 'a9,b1,b2',
  },
  {
    /* Mặc định của Postgres, không của JS: ASC đặt NULL sau cùng. Gõ ngược thì
       một hàng thiếu dữ liệu nhảy lên đầu ảnh chụp và trông như lỗi của app. */
    name: 'NULL xuống cuối khi tăng dần',
    rows: [{ id: 'n', k: null }, { id: 'a', k: 1 }, { id: 'b', k: 2 }],
    q: 'order=k.asc',
    want: 'a,b,n',
  },
  {
    name: 'NULL lên đầu khi giảm dần',
    rows: [{ id: 'a', k: 1 }, { id: 'n', k: null }, { id: 'b', k: 2 }],
    q: 'order=k.desc',
    want: 'n,b,a',
  },
  {
    name: 'nullslast ghi đè chiều giảm',
    rows: [{ id: 'a', k: 1 }, { id: 'n', k: null }, { id: 'b', k: 2 }],
    q: 'order=k.desc.nullslast',
    want: 'b,a,n',
  },
  {
    /* `nutrition.tsx` gọi `.order('is_favorite', { ascending: false })`: `true`
       phải lên đầu, mà `true > false` chỉ đúng sau khi ép sang số. */
    name: 'boolean giảm dần đưa true lên đầu',
    rows: [{ id: 'f', k: false }, { id: 't', k: true }, { id: 'f2', k: false }],
    q: 'order=k.desc',
    want: 't,f,f2',
  },
  {
    name: 'limit cắt sau khi sắp, không phải trước',
    rows: [{ id: 'c', k: 3 }, { id: 'a', k: 1 }, { id: 'b', k: 2 }],
    q: 'order=k.desc&limit=2',
    want: 'c,b',
  },
  {
    name: 'không có order thì giữ nguyên thứ tự',
    rows: [{ id: 'c', k: 3 }, { id: 'a', k: 1 }],
    q: 'select=*',
    want: 'c,a',
  },
  /* ── bộ lọc (#17) ──
     Thiếu `eq` thì `.maybeSingle()` nhận nhiều dòng và ném PGRST116: hồ sơ
     cộng đồng của UID chưa từng đọc được trong phép đo web nào. */
  {
    name: 'eq lọc đúng một dòng (maybeSingle)',
    rows: [{ id: 'x', u: 'me' }, { id: 'y', u: 'other' }, { id: 'z', u: 'third' }],
    q: 'select=*&u=eq.me',
    want: 'x',
  },
  {
    name: 'eq so theo chữ với số và boolean',
    rows: [{ id: 'a', n: 2, b: true }, { id: 'b', n: 3, b: true }, { id: 'c', n: 2, b: false }],
    q: 'n=eq.2&b=eq.true',
    want: 'a',
  },
  {
    name: 'in với ngoặc kép giữ dấu phẩy',
    rows: [{ id: 'a', k: 'x' }, { id: 'b', k: 'y,z' }, { id: 'c', k: 'w' }],
    q: 'k=in.(x,"y,z")',
    want: 'a,b',
  },
  {
    name: 'is.null và not.is.null',
    rows: [{ id: 'a', r: null }, { id: 'b', r: '2026-01-01' }, { id: 'c' }],
    q: 'r=is.null',
    want: 'a,c',
  },
  {
    name: 'not.is.null',
    rows: [{ id: 'a', r: null }, { id: 'b', r: '2026-01-01' }],
    q: 'r=not.is.null',
    want: 'b',
  },
  {
    name: 'neq bỏ cả NULL (như Postgres)',
    rows: [{ id: 'a', k: 'x' }, { id: 'b', k: 'y' }, { id: 'n', k: null }],
    q: 'k=neq.x',
    want: 'b',
  },
  {
    /* Toán tử lạ, khoảng ngày, cột lồng và `or=` được GIỮ NGUYÊN: lọc sai là
       giấu hàng khỏi ảnh chụp. `gte` còn có kịch bản "nhật ký ngày khác" dựa
       vào việc nó không được lọc. */
    name: 'gte, like, or và cột lồng giữ nguyên',
    rows: [{ id: 'a', d: '2020-01-01', t: 'x' }, { id: 'b', d: '2030-01-01', t: 'y' }],
    q: 'd=gte.2025-01-01&t=like.*z*&or=(t.eq.q)&p.k=eq.1',
    want: 'a,b',
  },
  {
    name: 'lọc rồi mới sắp và cắt',
    rows: [{ id: 'a', u: 1, k: 1 }, { id: 'b', u: 2, k: 2 }, { id: 'c', u: 1, k: 3 }, { id: 'd', u: 1, k: 2 }],
    q: 'u=eq.1&order=k.desc&limit=2',
    want: 'c,d',
  },
];

for (const t of CASES) {
  const before = ids(t.rows);
  const got = ids(applyQuery(t.rows, url(t.q)));
  if (got !== t.want) {
    problems.push(`applyQuery sai ở "${t.name}": \`?${t.q}\` trên [${before}] ra [${got}], phải ra [${t.want}]`);
  }
  /* Sắp tại chỗ thì lần gọi sau của CÙNG một request khác sẽ nhận bảng đã bị
     đổi — fixture là module dùng chung, một lượt chạy ghi đè lượt sau. */
  if (ids(t.rows) !== before) {
    problems.push(`applyQuery sắp TẠI CHỖ ở "${t.name}": mảng fixture gốc bị đổi từ [${before}] thành [${ids(t.rows)}]`);
  }
}

/* ── vế 2: mọi cột app sắp theo đều có thật trong fixture ────────────────── */

const files = [];
(function walk(d) {
  for (const e of readdirSync(d)) {
    const p = path.join(d, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.tsx?$/.test(p)) files.push(p);
  }
})(SRC);

/* `.from('t')` rồi bất cứ `.order(...)` nào trước khi chuỗi kết thúc. Cắt ở
   `.from(` kế tiếp hoặc ở một dòng mở câu lệnh mới, nên hai truy vấn cạnh nhau
   không lẫn cột của nhau. */
const FROM_CHAIN = /\.from\(\s*['"]([a-z_]+)['"]\s*\)([\s\S]{0,900}?)(?=\n\s*(?:const|let|return|\}|\/\*)|\.from\()/g;
const ORDER = /\.order\(\s*['"]([a-z_0-9]+)['"]/g;

let orderCalls = 0;
let checkedTables = 0;
const seen = new Map();

for (const f of files) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(FROM_CHAIN)) {
    const [, table, chain] = m;
    for (const o of chain.matchAll(ORDER)) {
      orderCalls++;
      const col = o[1];
      const rows = FIXTURES[table];
      if (!rows || rows.length === 0) continue;
      const k = `${table}.${col}`;
      if (seen.has(k)) continue;
      seen.set(k, path.relative(ROOT, f));
      checkedTables++;
      /* Một hàng thiếu cột là đủ hỏng: `undefined` xếp như NULL, nên hàng ấy
         rơi xuống cuối và trông như dữ liệu cũ nhất dù nó không phải. */
      const missing = rows.filter((r) => !(col in r)).length;
      if (missing === rows.length) {
        problems.push(
          `fixture \`${table}\` KHÔNG có cột \`${col}\`, mà ${path.relative(ROOT, f)} sắp theo đúng cột ấy — ` +
            'máy chủ giả sắp một cột không tồn tại, tức không sắp gì cả, và màn hiện ra theo thứ tự tôi gõ trong live-world.mjs',
        );
      } else if (missing > 0) {
        problems.push(
          `fixture \`${table}\`: ${missing}/${rows.length} hàng thiếu cột \`${col}\` mà ` +
            `${path.relative(ROOT, f)} sắp theo — những hàng ấy bị xếp như NULL, tức xuống cuối danh sách`,
        );
      }
    }
  }
}

if (orderCalls === 0) {
  problems.push('không tìm thấy lượt `.order()` nào trong src/ — regex của luật này đã mục, nó đang canh một kho trống');
}

/* ── vế 3: live.mjs có thật sự gọi không ─────────────────────────────────── */

const liveSrc = readFileSync(path.join(ROOT, 'tools', 'live.mjs'), 'utf8');
/* Từ #39 ruột của route giả nằm ở `live-server.mjs` (`fakeSupabase`), dùng chung
   cho `live.mjs` và bốn đầu dò hiệu năng. Các phép kiểm "có thật sự gọi không"
   dưới đây đọc tệp ấy; vế 7b đòi mọi route giả trong `tools/` đi qua nó. */
const serverSrc = readFileSync(path.join(ROOT, 'tools', 'live-server.mjs'), 'utf8');
if (!/applyQuery/.test(serverSrc)) {
  problems.push('tools/live-server.mjs không gọi `applyQuery` — máy chủ giả vẫn trả nguyên bảng, và hai vế trên chỉ đang kiểm một hàm không ai dùng');
} else if (!/const rows = applyQuery\(/.test(serverSrc)) {
  problems.push('tools/live-server.mjs có nhắc `applyQuery` nhưng không dùng nó để dựng `rows` của route giả — kiểm lại chỗ nối');
}
if (!/page\.route\('\*\*\/\*\.supabase\.co\/\*\*', fakeSupabase\(\{\s*world,\s*mode,/.test(liveSrc)) {
  problems.push('tools/live.mjs không dựng route giả bằng `fakeSupabase({ world, mode, … })` — mọi phép kiểm ruột route dưới đây đang kiểm một tệp live.mjs không dùng');
}

/* ── vế 4 (#35): `select=` hỏi cột không có thật thì 400 ─────────────────── */

/* [bảng, select, cột phải bị báo]. `[]` = hợp lệ, không được báo gì. */
const SELECT_CASES = [
  ['community_likes', 'id', ['id']],                                   // đúng lỗi c227cfe sửa
  ['community_follows', 'x:id', ['id']],                               // bí danh không che được cột
  ['community_saves', 'id::text', ['id']],                             // ép kiểu cũng vậy
  ['community_likes', 'post_id,idd', ['idd']],
  ['community_posts', 'id,nope->>x', ['nope']],                        // đường JSON trên cột không có
  ['community_posts', 'id,author:community_profiles!fk(handle,nope)', ['community_profiles.nope']],
  ['community_likes', 'post_id', []],
  ['community_likes', '*', []],
  ['community_posts', 'id,kind,payload->>title,x:author_id::text', []],
  ['community_posts', 'id,author:posts_user_fk(anything)', []],        // tên quan hệ không phải bảng: không đoán
  ['community_likes', null, []],                                        // không có select= thì không có gì để hỏi
  ['rpc', 'id', []],                                                    // rpc/… không phải bảng
];
for (const [table, sel, want] of SELECT_CASES) {
  const got = unknownSelectColumns(table, sel);
  if (got.join(',') !== want.join(',')) {
    problems.push(`bộ đọc select= sai ở \`${table}?select=${sel}\`: báo [${got}], phải báo [${want}]`);
  }
}
/* #40: [đường dẫn + truy vấn, phương thức, thân, mã phải trả hoặc null] */
const REQUEST_CASES = [
  ['community_likes?post_id=eq.p&user_idd=eq.u', 'GET', null, '42703'],            // bộ lọc gõ nhầm
  ['community_likes?post_id=not.eq.p&nope=not.is.null', 'GET', null, '42703'],      // bộ lọc phủ định
  ['community_posts?order=created_att.desc', 'GET', null, '42703'],                 // order= gõ nhầm
  ['community_posts?or=(kind.eq.a,and(nope.eq.1,id.eq.2))', 'GET', null, '42703'],  // lồng trong or/and
  ['community_likes?on_conflict=post_id,usr', 'POST', '{"post_id":"p"}', '42703'],
  ['community_likes', 'POST', '[{"post_id":"p","usr":"u"}]', 'PGRST204'],          // thân có cột lạ
  ['community_settings?user_id=eq.u', 'PATCH', '{"default_vis":"public"}', 'PGRST204'],
  ['community_likes?post_id=eq.p&user_id=eq.u&select=post_id', 'DELETE', null, null],
  ['community_posts?order=created_at.desc,id.asc&kind=in.(workout,recipe)&limit=30', 'GET', null, null],
  ['community_posts?or=(kind.eq.a,and(hidden.is.false,id.eq.2))', 'GET', null, null],
  ['community_likes?on_conflict=post_id,user_id', 'POST', '{"post_id":"p","user_id":"u"}', null],
  ['community_posts?author.handle=eq.x&order=author(handle)', 'GET', null, null],   // quan hệ nhúng: không đoán
];
for (const [q, method, body, want] of REQUEST_CASES) {
  const got = requestRejection(new URL(`https://x.supabase.co/rest/v1/${q}`), method, body);
  if ((got?.body.code ?? null) !== want) {
    problems.push(`bộ soát yêu cầu (#40) sai ở ${method} \`${q}\`${body ? ` thân ${body}` : ''}: ra ${got?.body.code ?? 'hợp lệ'}, phải ra ${want ?? 'hợp lệ'}`);
  }
}
const rej = selectRejection(new URL('https://x.supabase.co/rest/v1/community_likes?select=id&post_id=eq.p'));
if (!rej || rej.status !== 400 || rej.body.code !== '42703' || !/community_likes\.id/.test(rej.body.message)) {
  problems.push(`selectRejection không trả 400 / 42703 kèm tên cột như PostgREST: ${JSON.stringify(rej)}`);
}
if (!/const rejected = requestRejection\(u, r\.request\(\)\.method\(\), r\.request\(\)\.postData\(\)\)/.test(serverSrc) || !/if \(rejected\)[\s\S]{0,400}status: rejected\.status/.test(serverSrc)) {
  problems.push('tools/live-server.mjs không dùng `requestRejection` (select=, bộ lọc, order=, thân POST/PATCH) để trả 400 trong route giả — vế 4 chỉ đang kiểm một hàm không ai dùng');
}

/* ── vế 5 (#38): `/rest/v1/rpc/<tên>` là hàm, không phải bảng `rpc` ──────── */
if (!/if \(table === 'rpc'\) \{[\s\S]{0,1600}rpcArgsRejection\(fn, args\)[\s\S]{0,1200}RPC_FIXTURES\[fn\][\s\S]{0,800}fx\.run\(args, world\)/.test(serverSrc)) {
  problems.push(
    'tools/live-server.mjs không rẽ `/rest/v1/rpc/<tên>` sang nhánh hàm (soát đối số bằng `rpcArgsRejection`, rồi `RPC_FIXTURES[fn].run`) — ' +
      'mọi RPC lại rơi vào nhánh bảng và nhận `[]`, đúng lỗi #38 sửa',
  );
}

/* ── vế 6 (#52): thế giới giả nhớ lệnh ghi — và biết khi nào KHÔNG được nhớ ── */
{
  const { applyWrite } = await import('./live-writes.mjs');
  const U = (q) => new URL(`https://x.supabase.co/rest/v1/${q}`);
  const W = () => structuredClone(FIXTURES);
  const like0 = FIXTURES.community_likes[0];
  const WRITE_CASES = [
    ['INSERT trùng khoá ghép → 409 / 23505', (w) => {
      const r = applyWrite(w, 'community_likes', 'POST', U('community_likes'), JSON.stringify({ post_id: like0.post_id, user_id: like0.user_id }));
      return r.status === 409 && JSON.parse(r.body).code === '23505' && w.community_likes.length === FIXTURES.community_likes.length;
    }],
    ['upsert (merge-duplicates) gộp, không nhân đôi', (w) => {
      applyWrite(w, 'community_likes', 'POST', U('community_likes'), JSON.stringify({ post_id: like0.post_id, user_id: like0.user_id }), { prefer: 'resolution=merge-duplicates' });
      return w.community_likes.length === FIXTURES.community_likes.length;
    }],
    ['INSERT mới điền DEFAULT (joined_at now(), user_id auth.uid())', (w) => {
      const r = applyWrite(w, 'community_challenge_members', 'POST', U('community_challenge_members?select=challenge_id'), JSON.stringify({ challenge_id: 'ch000000-0000-4000-8000-000000000002' }));
      const row = w.community_challenge_members.at(-1);
      return r.status === 201 && row.user_id === UID_ && typeof row.joined_at === 'string' && JSON.parse(r.body).length === 1;
    }],
    ['DELETE theo eq bỏ đúng hàng', (w) => {
      applyWrite(w, 'community_likes', 'DELETE', U(`community_likes?post_id=eq.${like0.post_id}&user_id=eq.${like0.user_id}`), '');
      return w.community_likes.length === FIXTURES.community_likes.length - 1;
    }],
    ['DELETE theo gte (bộ lọc không hiểu) KHÔNG được áp', (w) => {
      const r = applyWrite(w, 'weight_logs', 'DELETE', U('weight_logs?date=gte.2000-01-01'), '');
      return r.applied === false && w.weight_logs.length === FIXTURES.weight_logs.length;
    }],
    ['POST lô [mới, trùng] → 409 và KHÔNG hàng nào vào (nguyên tử, #80)', (w) => {
      const r = applyWrite(w, 'community_likes', 'POST', U('community_likes'), JSON.stringify([
        { post_id: like0.post_id, user_id: 'f0f0f0f0-0000-4000-8000-000000000001' },
        { post_id: like0.post_id, user_id: like0.user_id },
      ]));
      return r.status === 409 && w.community_likes.length === FIXTURES.community_likes.length;
    }],
    ['POST lô trùng CHÍNH NÓ → 409, không vào (#80)', (w) => {
      const x = { post_id: like0.post_id, user_id: 'f0f0f0f0-0000-4000-8000-000000000002' };
      const r = applyWrite(w, 'community_likes', 'POST', U('community_likes'), JSON.stringify([x, x]));
      return r.status === 409 && w.community_likes.length === FIXTURES.community_likes.length;
    }],
    ['upsert theo on_conflict: trùng một UNIQUE KHÁC → 409, không gộp nhầm (#80)', (w) => {
      const other = FIXTURES.community_profiles[0];
      const r = applyWrite(w, 'community_profiles', 'POST', U('community_profiles?on_conflict=user_id'),
        JSON.stringify({ user_id: 'f0f0f0f0-0000-4000-8000-000000000003', handle: other.handle, display_name: 'X' }), { prefer: 'resolution=merge-duplicates' });
      return r.status === 409 && w.community_profiles.find((p) => p.user_id === other.user_id).display_name === other.display_name;
    }],
    /* #93: NOT NULL như Postgres — 400 / 23502, và không gì được áp. */
    ...(() => {
      const code = (r) => { try { return JSON.parse(r.body).code; } catch { return null; } };
      const WL = FIXTURES.weight_logs[0];
      const CM = FIXTURES.community_comments[0];
      return [
        ['POST thiếu cột NOT NULL không DEFAULT (weight_kg) → 400 23502, không hàng nào vào (#93)', (w) => {
          const r = applyWrite(w, 'weight_logs', 'POST', U('weight_logs'), JSON.stringify({ user_id: WL.user_id, date: '2026-09-20' }));
          return r.status === 400 && code(r) === '23502' && w.weight_logs.length === FIXTURES.weight_logs.length;
        }],
        ['POST lô [đủ, thiếu] → 23502, CẢ lô không vào (#93, nguyên tử như #80)', (w) => {
          const r = applyWrite(w, 'weight_logs', 'POST', U('weight_logs'), JSON.stringify([
            { user_id: WL.user_id, date: '2026-09-20', weight_kg: 70 },
            { user_id: WL.user_id, date: '2026-09-21' },
          ]));
          return r.status === 400 && code(r) === '23502' && w.weight_logs.length === FIXTURES.weight_logs.length;
        }],
        ['upsert TRÚNG hàng có sẵn mà thiếu cột NOT NULL → vẫn 23502 (ExecConstraints đứng trước ON CONFLICT, #93)', (w) => {
          const r = applyWrite(w, 'weight_logs', 'POST', U('weight_logs'), JSON.stringify({ id: WL.id, user_id: WL.user_id, date: WL.date }), { prefer: 'resolution=merge-duplicates' });
          return r.status === 400 && code(r) === '23502' && w.weight_logs[0].weight_kg === WL.weight_kg;
        }],
        ['cột NOT NULL CÓ DEFAULT mà vắng → được điền, 201 (đối chứng của #93)', (w) => {
          const r = applyWrite(w, 'community_comments', 'POST', U('community_comments'), JSON.stringify({ post_id: CM.post_id, body: 'x' }));
          const row = w.community_comments.at(-1);
          return r.status === 201 && row.body === 'x' && row.hidden === false && row.author_id != null;
        }],
        ['cột NOT NULL CÓ DEFAULT mà gửi null TƯỜNG MINH → 23502 (DEFAULT chỉ cho cột vắng, #93)', (w) => {
          const r = applyWrite(w, 'community_comments', 'POST', U('community_comments'), JSON.stringify({ post_id: CM.post_id, body: 'x', hidden: null }));
          return r.status === 400 && code(r) === '23502' && w.community_comments.length === FIXTURES.community_comments.length;
        }],
        ['PATCH đặt cột NOT NULL thành null → 23502, không hàng nào đổi (#93)', (w) => {
          const r = applyWrite(w, 'community_comments', 'PATCH', U(`community_comments?id=eq.${CM.id}`), JSON.stringify({ body: null }));
          return r.status === 400 && code(r) === '23502' && w.community_comments[0].body === CM.body;
        }],
      ];
    })(),
    ['PATCH gộp thân vào hàng khớp', (w) => {
      const p = FIXTURES.community_settings[0];
      applyWrite(w, 'community_settings', 'PATCH', U(`community_settings?user_id=eq.${p.user_id}`), JSON.stringify({ default_visibility: 'public' }));
      return w.community_settings[0].default_visibility === 'public' && FIXTURES.community_settings[0].default_visibility === p.default_visibility;
    }],
  ];
  for (const [label, run] of WRITE_CASES) {
    let ok = false;
    try { ok = run(W()); } catch (e) { ok = false; }
    if (!ok) problems.push(`thế giới giả ghi sai (#52): ${label}`);
  }
  if (!/applyWrite\(world, table, req\.method\(\), u, req\.postData\(\), req\.headers\(\)\)/.test(serverSrc)) {
    problems.push('tools/live-server.mjs không áp lệnh ghi vào thế giới của trang (`applyWrite`) — vế 6 chỉ đang kiểm một hàm không ai dùng');
  }
  if (!/const world = mode === 'empty' \? \{ profiles: structuredClone\(FIXTURES\.profiles\) \} : structuredClone\(FIXTURES\);/.test(liveSrc)) {
    problems.push('tools/live.mjs không dựng một BẢN SAO thế giới cho mỗi trang — lệnh ghi của trang này sẽ rò sang trang sau');
  }
  globalThis.__writeCases = WRITE_CASES.length;
}

/* ── vế 6b (#80): RPC GHI đổi thế giới của trang, và ném đúng lỗi của SQL ── */
{
  const { RPC_FIXTURES } = await import('./live-rpc.mjs');
  const claim = RPC_FIXTURES.claim_community_challenge;
  const markRead = RPC_FIXTURES.community_mark_notifications_read;
  const W = () => structuredClone(FIXTURES);
  const DONE = 'c4a11e00-0000-4000-8000-000000000004'; // #60: đã đạt, chưa nhận
  const code = (f) => { try { f(); return 'ok'; } catch (e) { return e.rpc?.code ?? `js:${e.message}`; } };
  const RPC_WRITE_CASES = [
    ['nhận thưởng: đặt claimed_at, vào sổ ĐÚNG một dòng cc:<id>, trả số xu', () => {
      const w = W();
      const n = claim.run({ p_challenge: DONE, p_offset_min: 0 }, w);
      const c = w.community_challenges.find((x) => x.id === DONE);
      const m = w.community_challenge_members.find((x) => x.challenge_id === DONE && x.user_id === UID_);
      const tx = w.mascot_transactions.filter((t) => t.ref_key === `cc:${DONE}`);
      return n === c.reward_coins && m.claimed_at != null && tx.length === 1 && tx[0].amount === c.reward_coins;
    }],
    ['nhận lần hai → 23505 "already claimed" (đứng TRƯỚC "chưa đạt", như SQL)', () => {
      const w = W();
      claim.run({ p_challenge: DONE, p_offset_min: 0 }, w);
      return code(() => claim.run({ p_challenge: DONE, p_offset_min: 0 }, w)) === '23505';
    }],
    ['thử thách chưa đạt → 22023, thế giới không đổi', () => {
      const w = W();
      const before = JSON.stringify(w.community_challenge_members);
      return code(() => claim.run({ p_challenge: 'ch000000-0000-4000-8000-000000000001', p_offset_min: 0 }, w)) === '22023'
        && JSON.stringify(w.community_challenge_members) === before;
    }],
    ['không tham gia → P0001; không có thử thách → P0002', () => {
      const w = W();
      return code(() => claim.run({ p_challenge: 'ch000000-0000-4000-8000-000000000002', p_offset_min: 0 }, w)) === 'P0001'
        && code(() => claim.run({ p_challenge: 'ffffffff-0000-4000-8000-000000000000', p_offset_min: 0 }, w)) === 'P0002';
    }],
    ['đánh dấu đã đọc: trả số dòng CHƯA đọc của mình, lần hai trả 0', () => {
      const w = W();
      const unread = w.community_notifications.filter((r) => r.user_id === UID_ && r.read_at == null).length;
      return unread > 0 && markRead.run({}, w) === unread && markRead.run({}, w) === 0;
    }],
  ];
  for (const [label, run] of RPC_WRITE_CASES) {
    let ok = false;
    try { ok = run(); } catch { ok = false; }
    if (!ok) problems.push(`RPC ghi sai (#80): ${label}`);
  }
  if (!/const status = \{ 23505: 409, 42501: 403, P0002: 404 \}\[e\.rpc\.code\] \?\? 400;/.test(serverSrc)) {
    problems.push('tools/live-server.mjs không trả mã HTTP theo SQLSTATE cho lỗi của hàm (#80) — "đã nhận rồi" (23505) phải là 409 như PostgREST');
  }
  globalThis.__rpcWriteCases = RPC_WRITE_CASES.length;
}

/* ── vế 7 (#68): trạng thái mạng chỉ đổi qua goOnline/goOffline ─────────────
   `setOffline(false)` của Playwright không bắn `navigator.connection` 'change',
   mà NetInfo bản web chỉ nghe nó; từ lần mất mạng thứ hai `setOffline(true)`
   cũng thôi bắn (#62). Một kịch bản gọi thẳng nó thì app không bao giờ thấy
   mạng đổi, và vế "có mạng lại thì…" xanh mà không đo gì — vế Thích (#45) và
   ngôi sao (#49) từng như thế. Đọc bằng trình phân tích cú pháp, không bằng
   regex: `live.mjs` có `'**' + '/*.supabase.co/**'` trong một chuỗi, và mọi
   cách bỏ chú thích bằng regex sẽ nuốt code sau nó. */
{
  const { createRequire } = await import('node:module');
  const { pathToFileURL } = await import('node:url');
  const { parse } = createRequire(pathToFileURL(path.join(ROOT, 'package.json')))('@babel/parser');
  const HELPERS = new Set(['goOnline', 'goOffline']);
  const propName = (m) =>
    m && (m.type === 'MemberExpression' || m.type === 'OptionalMemberExpression')
      ? !m.computed && m.property.type === 'Identifier'
        ? m.property.name
        : m.property.type === 'StringLiteral'
          ? m.property.value
          : null
      : null;
  const fnName = (node, parent) =>
    node.id?.name ?? (parent?.type === 'VariableDeclarator' && parent.id.type === 'Identifier' ? parent.id.name : null);
  /** Mọi chỗ đổi trạng thái mạng NGOÀI hai hàm hỗ trợ, và thân của hai hàm ấy. */
  const networkToggles = (src) => {
    const ast = parse(src, { sourceType: 'module', allowAwaitOutsideFunction: true });
    const bare = [];
    const helpers = new Map();
    const walk = (node, parent, owner) => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) {
        for (const c of node) walk(c, parent, owner);
        return;
      }
      if (typeof node.type !== 'string') return;
      let own = owner;
      if (/Function/.test(node.type)) {
        const n = fnName(node, parent);
        if (n) own = n;
        if (n && HELPERS.has(n) && node.type === 'FunctionDeclaration') helpers.set(n, { toggles: 0, change: 0 });
      }
      const h = helpers.get(own);
      /* `a?.b()` là OptionalCallExpression: `navigator.connection?.dispatchEvent(…)` của
         chính goOnline viết như thế, và `ctx?.setOffline(…)` không được lọt. */
      if (node.type === 'CallExpression' || node.type === 'OptionalCallExpression') {
        const p = propName(node.callee);
        if (p === 'setOffline' || p === 'emulateNetworkConditions') {
          if (HELPERS.has(own) && h) h.toggles++;
          else bare.push(`dòng ${node.loc.start.line}: \`${p}(…)\`${own ? ` trong \`${own}\`` : ''}`);
        }
        if (p === 'dispatchEvent' && HELPERS.has(own) && h) {
          const a = node.arguments[0];
          if (a?.type === 'NewExpression' && a.callee.name === 'Event' && a.arguments[0]?.value === 'change') h.change++;
        }
        if (p === 'newContext' || p === 'launchPersistentContext') {
          for (const arg of node.arguments) {
            for (const pr of arg?.type === 'ObjectExpression' ? arg.properties : []) {
              const k = pr.key?.name ?? pr.key?.value;
              if (k === 'offline') bare.push(`dòng ${pr.loc.start.line}: \`${p}({ offline })\` — mở trang đã mất mạng mà NetInfo không được báo`);
            }
          }
        }
      }
      for (const k of Object.keys(node)) {
        if (k === 'loc' || k === 'leadingComments' || k === 'trailingComments' || k === 'innerComments') continue;
        walk(node[k], node, own);
      }
    };
    walk(ast.program, null, null);
    return { bare, helpers };
  };

  /* Ca tự kiểm: luật phải đỏ đúng những chỗ này và im ở những chỗ kia. */
  const HELPER_SRC =
    "async function goOnline(page) { await page.context().setOffline(false); await page.evaluate(() => navigator.connection?.dispatchEvent(new Event('change'))); }\n" +
    "async function goOffline(page) { await page.context().setOffline(true); await page.evaluate(() => navigator.connection?.dispatchEvent(new Event('change'))); }\n";
  const NET_CASES = [
    ['setOffline(false) trần trong một kịch bản', HELPER_SRC + 'const S = [{ async run(page) { await page.context().setOffline(false); } }];', 1],
    ['setOffline qua chỉ số chuỗi', HELPER_SRC + "async function f(ctx) { await ctx['setOffline'](true); }", 1],
    ['newContext({ offline: true })', HELPER_SRC + 'async function f(b) { await b.newContext({ offline: true }); }', 1],
    ['CDP emulateNetworkConditions', HELPER_SRC + 'async function f(c) { await c.net.emulateNetworkConditions({}); }', 1],
    ['ctx?.setOffline (optional chaining)', HELPER_SRC + 'async function f(ctx) { await ctx?.setOffline(false); }', 1],
    ['chỉ trong goOnline/goOffline', HELPER_SRC, 0],
    ['trong chú thích và trong chuỗi', HELPER_SRC + "// page.context().setOffline(false)\n/* ctx.setOffline(true) */\nconst s = 'page.context().setOffline(false)';\nconst r = '**/*.supabase.co/**';", 0],
  ];
  for (const [label, src, want] of NET_CASES) {
    let got = -1;
    try { got = networkToggles(src).bare.length; } catch { got = -1; }
    if (got !== want) problems.push(`luật mạng (#68) tự kiểm sai: "${label}" ra ${got} chỗ, phải là ${want}`);
  }
  {
    const broken = networkToggles(
      'async function goOnline(page) { await page.context().setOffline(false); }\n' +
        "async function goOffline(page) { await page.context().setOffline(true); await page.evaluate(() => navigator.connection?.dispatchEvent(new Event('change'))); }",
    );
    if (broken.helpers.get('goOnline')?.change !== 0 || broken.helpers.get('goOffline')?.change !== 1) {
      problems.push('luật mạng (#68) tự kiểm sai: không phân biệt được goOnline thiếu lệnh bắn "change" với goOffline đủ');
    }
  }

  let files = 0;
  for (const f of readdirSync(path.join(ROOT, 'tools')).filter((n) => /^live.*\.mjs$/.test(n)).sort()) {
    files++;
    const src = readFileSync(path.join(ROOT, 'tools', f), 'utf8');
    let r;
    try {
      r = networkToggles(src);
    } catch (e) {
      problems.push(`tools/${f}: không phân tích được để soát trạng thái mạng (#68): ${e.message}`);
      continue;
    }
    for (const b of r.bare) {
      problems.push(
        `tools/${f} ${b} — đổi trạng thái mạng ngoài goOnline/goOffline: NetInfo bản web không được báo, app không bao giờ thấy mạng đổi, ` +
          'và vế "có mạng lại thì…" xanh mà không đo gì (#62, #68). Dùng goOnline(page) / goOffline(page)',
      );
    }
    if (f === 'live.mjs') {
      for (const name of HELPERS) {
        const s = r.helpers.get(name);
        if (!s) problems.push(`tools/live.mjs không còn \`async function ${name}(page)\` — luật #68 không có gì để dẫn kịch bản tới`);
        else if (!s.toggles || !s.change) {
          problems.push(
            `tools/live.mjs: \`${name}\` phải vừa gọi setOffline vừa bắn \`navigator.connection\` 'change' — thiếu ` +
              `${!s.toggles ? 'setOffline' : "dispatchEvent(new Event('change'))"}, nên NetInfo bản web không thấy mạng đổi (#62)`,
          );
        }
      }
    }
  }
  globalThis.__netCases = NET_CASES.length;
  globalThis.__netFiles = files;
}

/* ── vế 8 (#70): số đếm đi trong `Content-Range`, và `offset` có thật ────────
   supabase-js đọc `count` từ header, không từ thân; trước #70 máy chủ giả không
   đặt nó, nên mọi số đếm của app trong bộ chạy là `null` — thường hiện thành 0,
   và mọi nhánh "có số" (người theo dõi, thành tích, thống kê) chưa từng được
   quét. */
{
  const { contentRange } = await import('./live-world.mjs');
  const T = [1, 2, 3, 4, 5].map((i) => ({ id: `r${i}`, user_id: i <= 3 ? 'a' : 'b' }));
  const Q = (q) => new URL(`https://x.supabase.co/rest/v1/t?${q}`);
  const RANGE_CASES = [
    ['HEAD + count=exact theo eq', () => contentRange(T, Q('select=id&user_id=eq.a'), applyQuery(T, Q('select=id&user_id=eq.a')).length, 'count=exact'), '0-2/3'],
    ['GET + count + range (offset=1, limit=2): tổng đếm TRƯỚC limit/offset', () => contentRange(T, Q('select=id&offset=1&limit=2'), 2, 'return=representation,count=exact'), '1-2/5'],
    ['count mà không có hàng nào → */0', () => contentRange(T, Q('select=id&user_id=eq.zzz'), 0, 'count=exact'), '*/0'],
    ['không xin count → tổng là *', () => contentRange(T, Q('select=id'), 5, ''), '0-4/*'],
    ['count=planned đếm như exact', () => contentRange(T, Q('select=id&user_id=eq.b'), 2, 'count=planned'), '0-1/2'],
    ['offset được áp trong applyQuery', () => ids(applyQuery(T, Q('select=id&offset=3'))), 'r4,r5'],
    ['offset trước limit', () => ids(applyQuery(T, Q('select=id&offset=1&limit=2'))), 'r2,r3'],
  ];
  for (const [label, run, want] of RANGE_CASES) {
    let got;
    try { got = run(); } catch (e) { got = `ném lỗi: ${e.message}`; }
    if (got !== want) problems.push(`Content-Range / offset sai (#70): ${label} — ra "${got}", phải là "${want}"`);
  }
  if (!/'content-range': contentRange\(world\[table\] \?\? \[\], u, rows\.length, req\.headers\(\)\['prefer'\] \?\? ''\)/.test(serverSrc)) {
    problems.push('tools/live-server.mjs không đặt `Content-Range` từ `contentRange(…)` cho lượt đọc bảng — mọi số đếm của app lại thành null (#70)');
  }
  if (!/'access-control-expose-headers': 'Content-Range'/.test(serverSrc)) {
    problems.push('tools/live-server.mjs không khai `Access-Control-Expose-Headers: Content-Range` — trang khác nguồn không đọc được header ấy, và `count` vẫn là null (#70)');
  }
  if (!/body: req\.method\(\) === 'HEAD' \? '' :/.test(serverSrc)) {
    problems.push('tools/live-server.mjs trả thân cho HEAD — `head: true` là một phép đếm, không có thân (#70)');
  }
  globalThis.__rangeCases = RANGE_CASES.length;
}

/* ── vế 7b (#39): mọi route giả trong tools/ đi qua `fakeSupabase` ──────────
   Bốn đầu dò hiệu năng từng tự dựng route trả `FIXTURES[bảng]` nguyên bảng —
   không lọc, không sắp, không RPC, không 400 — nên đo khung hình trên những màn
   đang ở trạng thái lỗi. Một route giả viết tay nữa là một thế giới thứ hai. */
{
  const { readdirSync: ls } = await import('node:fs');
  const ROUTE = /page\.route\('\*\*\/\*\.supabase\.co\/\*\*',\s*([^\n]{0,30})/g;
  const handRolled = (src) => [...src.matchAll(ROUTE)].filter((m) => !m[1].startsWith('fakeSupabase(')).length;
  let routed = 0;
  for (const f of ls(path.join(ROOT, 'tools')).filter((x) => x.endsWith('.mjs'))) {
    const src = readFileSync(path.join(ROOT, 'tools', f), 'utf8');
    const all = [...src.matchAll(ROUTE)].length;
    if (!all) continue;
    routed++;
    if (handRolled(src)) problems.push(`tools/${f}: route giả của Supabase tự viết handler — phải là fakeSupabase({ world, … }) của live-server.mjs (#39)`);
  }
  if (routed < 5) problems.push(`chỉ ${routed} tệp trong tools/ dựng route giả — live.mjs và bốn đầu dò hiệu năng phải có mặt; regex của vế 7b đã mục?`);
  /* Ghép hai mảnh: nguyên văn thì chính dòng này khớp ROUTE, và tệp luật tự báo mình. */
  if (handRolled("await page.route('**" + "/*.supabase.co/**', async (r) => {") !== 1) problems.push('vế 7b tự kiểm hỏng: một handler viết tay mà không bị nhận ra');
  globalThis.__routed = routed;
}

if (problems.length) {
  console.error('máy chủ giả trả lời sai câu hỏi:');
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(
  `máy chủ giả OK — ${CASES.length} ca sắp xếp và lọc (một cột, nhiều cột, NULL hai chiều, nullslast, boolean, limit, eq/in/is/neq, toán tử lạ giữ nguyên, ` +
    `không-order) đều đúng và không ca nào sắp tại chỗ; ${orderCalls} lượt \`.order()\` trong src/, ` +
    `${checkedTables} cặp bảng·cột có fixture để đối chiếu và mọi cột đều tồn tại trong MỌI hàng; ` +
    'và route giả (`live-server.mjs`, #39) thật sự gọi `applyQuery` để dựng hàng trả về, chứ không chỉ import nó. ' +
    'Không kiểm `gte`/`lt` — máy chủ giả không lọc theo ngày, giới hạn ấy ghi trong live.mjs. ' +
    `Và ${SELECT_CASES.length} ca \`select=\` (#35): cột không có thật — kể cả sau bí danh, ép kiểu, đường JSON, trong phần nhúng — ` +
    'được trả 400 / 42703 như PostgREST, câu hợp lệ thì không, và `live.mjs` dùng đúng bộ ấy trong route giả. ' +
    `Và ${REQUEST_CASES.length} ca #40: bộ lọc, not., or=/and= lồng nhau, order=, on_conflict= (42703) và thân POST/PATCH (PGRST204) nhắc cột lạ đều bị từ chối, câu hợp lệ thì không. ` +
    `Và ${globalThis.__writeCases} ca lệnh ghi (#52): trùng khoá → 409, upsert gộp, DEFAULT được điền, DELETE/PATCH theo eq áp đúng hàng, bộ lọc không hiểu thì KHÔNG áp; mỗi trang một bản sao thế giới. ` +
    'Và `/rest/v1/rpc/<tên>` được rẽ sang nhánh hàm (#38): đối số soát theo `types.ts`, kết quả từ `live-rpc.mjs`. ' +
    `Và ${globalThis.__rpcWriteCases} ca RPC ghi (#80): nhận thưởng đặt claimed_at và vào sổ đúng một dòng, lần hai 23505, chưa đạt 22023 mà thế giới không đổi, P0001/P0002; đánh dấu đã đọc trả đúng số dòng rồi 0; lỗi của hàm ra mã HTTP theo SQLSTATE. ` +
    `Và trạng thái mạng (#68): ${globalThis.__netFiles} tệp tools/live*.mjs, đọc bằng trình phân tích cú pháp, không đổi mạng ở đâu ngoài goOnline/goOffline, ` +
    `và cả hai hàm ấy đều bắn \`navigator.connection\` 'change' (${globalThis.__netCases} ca tự kiểm: trần, chỉ số chuỗi, newContext offline, CDP; chú thích và chuỗi thì im). ` +
    `Và ${globalThis.__rangeCases} ca #70: \`Content-Range\` mang tổng đếm TRƯỚC limit/offset khi \`Prefer\` xin count, \`*/0\` khi rỗng, \`*\` khi không xin; HEAD thân rỗng; \`offset\` được áp trước \`limit\`` +
    `Và ${globalThis.__routed} tệp trong tools/ dựng route giả, tất cả qua fakeSupabase của live-server.mjs (#39) — không thế giới thứ hai nào`,
);
