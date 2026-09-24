/**
 * Máy chủ giả không được BỊA ra cột.
 *
 * ── lỗi đã sửa ──
 *
 * `tools/live-world.mjs` gõ `date_of_birth` cho hồ sơ. Cột thật tên `dob`
 * (migration gốc, dòng 11) và cả app đọc `profile.dob`. Không một thứ gì đỏ:
 * một hàng JSON có thừa một khoá thì PostgREST giả cứ trả về, `tsc` không đọc
 * fixture, và màn hình chỉ lặng lẽ hành xử như một người dùng KHÔNG CÓ NGÀY
 * SINH.
 *
 * Cái giá là mọi lần dựng thật đều nói dối, và nói dối theo hướng khó ngờ
 * nhất: tính năng mới trông như hỏng. Ước lượng calo buổi tập ra 0 ở mọi màn,
 * và hai giờ trôi qua trước khi hoá ra code đúng còn thế giới giả thì sai.
 *
 * ── vì sao so với `types.ts` ──
 *
 * Đó là bản sinh ra TỪ schema thật, nên nó là thứ gần schema nhất mà một bước
 * gác chạy offline với tới được. Một khoá không có trong `Row` của bảng ấy thì
 * hoặc là gõ sai, hoặc là `types.ts` đã cũ — và cả hai đều là thứ phải biết
 * trước khi một ảnh dựng được dùng làm bằng chứng.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { TYPES_STALE, TYPE_COLUMNS as columns } from './postgrest-select.mjs';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];

/* ── cột thật, đọc ra khỏi types.ts ────────────────────────────────────── */
/* Bộ đọc và `TYPES_STALE` nằm ở `postgrest-select.mjs`, nơi máy chủ giả của
   `live.mjs` cũng dùng để từ chối `select=` hỏi cột không có thật (#35): một
   nguồn cột cho cả fixture lẫn câu hỏi, để hai bên không thể lệch nhau. */
if (columns.size === 0) {
  problems.push(
    'không rút được bảng nào ra khỏi `types.ts` — bộ dò hỏng, và một bước gác không tìm thấy thứ nó gác phải ĐỎ',
  );
}

/* ── khoá trong fixture ────────────────────────────────────────────────── */
const { FIXTURES } = await import(path.join(NATIVE, 'tools', 'live-world.mjs'));
let checked = 0;
let tablesSeen = 0;

for (const [table, rows] of Object.entries(FIXTURES)) {
  if (!Array.isArray(rows)) continue;
  const real = columns.get(table);
  if (!real) {
    problems.push(
      `fixture có bảng \`${table}\` mà \`types.ts\` không có — hoặc tên bảng gõ sai, hoặc \`types.ts\` đã cũ`,
    );
    continue;
  }
  tablesSeen += 1;
  const bad = new Set();
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    for (const k of Object.keys(row)) {
      checked += 1;
      if (!real.has(k) && !(`${table}.${k}` in TYPES_STALE)) bad.add(k);
    }
  }
  for (const k of bad) {
    problems.push(
      `\`${table}.${k}\` không phải cột thật. Một hàng giả có khoá thừa thì PostgREST giả cứ trả về và ` +
        'không gì đỏ — màn hình chỉ lặng lẽ hành xử như thiếu dữ liệu, nên một ảnh dựng từ thế giới ' +
        'ấy KHÔNG dùng làm bằng chứng được',
    );
  }
}

if (checked === 0) {
  problems.push('không soi được khoá nào trong FIXTURES — bộ dò hỏng, không phải fixture sạch');
}

if (problems.length) {
  console.error('cột trong fixture CÓ LỖI:\n');
  for (const p of problems) console.error(`  • ${p}`);
  process.exit(1);
}

console.log(
  `cột trong fixture OK — ${checked} khoá trên ${tablesSeen} bảng của \`live-world.mjs\` đều là cột có ` +
    `thật, so với \`types.ts\` (${columns.size} bảng, đọc ngược ra khỏi khối \`Row\` chứ không gõ tay). ` +
    'Luật này có vì fixture từng gõ `date_of_birth` trong khi cột thật tên `dob`: PostgREST giả cứ trả ' +
    'hàng ấy về, `tsc` không đọc fixture, nên mọi lần dựng thật đều vẽ một người dùng KHÔNG CÓ NGÀY SINH ' +
    `— và tính năng mới nào cần tuổi thì trông như hỏng. Một thế giới giả sai kiểu này không báo lỗi, nó BỊA. ` +
    `${Object.keys(TYPES_STALE).length} cột được miễn vì chúng CÓ THẬT trong một migration mà \`types.ts\` ` +
    'chưa sinh lại, và mỗi cái chỉ đúng tên tệp migration đã thêm nó',
);
