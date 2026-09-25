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

import { FIXTURES, applyQuery } from './live-world.mjs';
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
if (!/applyQuery/.test(liveSrc)) {
  problems.push('tools/live.mjs không gọi `applyQuery` — máy chủ giả vẫn trả nguyên bảng, và hai vế trên chỉ đang kiểm một hàm không ai dùng');
} else if (!/const rows = applyQuery\(/.test(liveSrc)) {
  problems.push('tools/live.mjs có nhắc `applyQuery` nhưng không dùng nó để dựng `rows` của route giả — kiểm lại chỗ nối');
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
if (!/const rejected = requestRejection\(u, r\.request\(\)\.method\(\), r\.request\(\)\.postData\(\)\)/.test(liveSrc) || !/if \(rejected\)[\s\S]{0,400}status: rejected\.status/.test(liveSrc)) {
  problems.push('tools/live.mjs không dùng `requestRejection` (select=, bộ lọc, order=, thân POST/PATCH) để trả 400 trong route giả — vế 4 chỉ đang kiểm một hàm không ai dùng');
}

/* ── vế 5 (#38): `/rest/v1/rpc/<tên>` là hàm, không phải bảng `rpc` ──────── */
if (!/if \(table === 'rpc'\) \{[\s\S]{0,1600}rpcArgsRejection\(fn, args\)[\s\S]{0,1200}RPC_FIXTURES\[fn\][\s\S]{0,800}fx\.run\(args, world\)/.test(liveSrc)) {
  problems.push(
    'tools/live.mjs không rẽ `/rest/v1/rpc/<tên>` sang nhánh hàm (soát đối số bằng `rpcArgsRejection`, rồi `RPC_FIXTURES[fn].run`) — ' +
      'mọi RPC lại rơi vào nhánh bảng và nhận `[]`, đúng lỗi #38 sửa',
  );
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
    'và `live.mjs` thật sự gọi `applyQuery` để dựng hàng trả về, chứ không chỉ import nó. ' +
    'Không kiểm `gte`/`lt` — máy chủ giả không lọc theo ngày, giới hạn ấy ghi trong live.mjs. ' +
    `Và ${SELECT_CASES.length} ca \`select=\` (#35): cột không có thật — kể cả sau bí danh, ép kiểu, đường JSON, trong phần nhúng — ` +
    'được trả 400 / 42703 như PostgREST, câu hợp lệ thì không, và `live.mjs` dùng đúng bộ ấy trong route giả. ' +
    `Và ${REQUEST_CASES.length} ca #40: bộ lọc, not., or=/and= lồng nhau, order=, on_conflict= (42703) và thân POST/PATCH (PGRST204) nhắc cột lạ đều bị từ chối, câu hợp lệ thì không. ` +
    'Và `/rest/v1/rpc/<tên>` được rẽ sang nhánh hàm (#38): đối số soát theo `types.ts`, kết quả từ `live-rpc.mjs`',
);
