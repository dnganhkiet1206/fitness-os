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
 * KHÔNG kiểm `gte`/`lt`: máy chủ giả không lọc theo ngày, đó là giới hạn đã
 * được ghi trong `live.mjs` ở kịch bản "nhật ký ngày khác", và nó vẫn còn
 * nguyên. Luật này chỉ nói về thứ tự và số lượng.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { FIXTURES, applyQuery } from './live-world.mjs';

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

if (problems.length) {
  console.error('máy chủ giả trả lời sai câu hỏi:');
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(
  `máy chủ giả OK — ${CASES.length} ca sắp xếp (một cột, nhiều cột, NULL hai chiều, nullslast, boolean, limit, ` +
    `không-order) đều đúng và không ca nào sắp tại chỗ; ${orderCalls} lượt \`.order()\` trong src/, ` +
    `${checkedTables} cặp bảng·cột có fixture để đối chiếu và mọi cột đều tồn tại trong MỌI hàng; ` +
    'và `live.mjs` thật sự gọi `applyQuery` để dựng hàng trả về, chứ không chỉ import nó. ' +
    'Không kiểm `gte`/`lt` — máy chủ giả không lọc theo ngày, giới hạn ấy ghi trong live.mjs',
);
