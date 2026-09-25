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

import {
  TYPES_STALE,
  TYPE_COLUMNS as columns,
  TYPE_FUNCTIONS,
  readTypeFunctions,
  rpcArgsRejection,
  rpcReturnProblems,
} from './postgrest-select.mjs';

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

/* ── RPC (#38): fixture của hàm cũng phải khớp `types.ts` ──────────────── */
const { RPC_FIXTURES } = await import(path.join(NATIVE, 'tools', 'live-rpc.mjs'));
let rpcRows = 0;
for (const [fn, fx] of Object.entries(RPC_FIXTURES)) {
  if (!TYPE_FUNCTIONS.has(fn)) {
    problems.push(`fixture RPC \`${fn}\` không có trong khối Functions của \`types.ts\` — tên gõ sai, hoặc \`types.ts\` đã cũ`);
    continue;
  }
  const bad = rpcArgsRejection(fn, fx.sample);
  if (bad) {
    problems.push(`\`sample\` của fixture RPC \`${fn}\` lệch chữ ký: thừa [${bad.extra}], thiếu [${bad.missing}]`);
    continue;
  }
  let out;
  try {
    /* Bản SAO: một fixture RPC GHI (#80) đổi thế giới nó nhận, và `FIXTURES` là
       thế giới mọi bước sau đọc. */
    out = fx.run(fx.sample, structuredClone(FIXTURES));
  } catch (e) {
    problems.push(`fixture RPC \`${fn}\` ném lỗi trên \`sample\` của nó (${e.message}) — một mẫu phải cho ra DỮ LIỆU, không thì bước này không so được gì`);
    continue;
  }
  if (Array.isArray(out)) {
    if (out.length === 0) problems.push(`fixture RPC \`${fn}\` trả [] trên \`sample\` — đúng thứ #38 sinh ra để bỏ`);
    rpcRows += out.length;
  }
  for (const p of rpcReturnProblems(fn, out)) problems.push(`fixture RPC lệch \`types.ts\`: ${p}`);
  /* Thế giới rỗng: được phép ném lỗi của HÀM (như SQL), không được ném lỗi JS. */
  try {
    fx.run(fx.sample, { profiles: FIXTURES.profiles });
  } catch (e) {
    if (!e.rpc) problems.push(`fixture RPC \`${fn}\` vỡ trên thế giới rỗng: ${e.message}`);
  }
}

/* Tự phá thử hai bộ so trên một chữ ký viết sẵn, không phải trên types.ts. */
const FAKE = readTypeFunctions(`    Functions: {
      f: {
        Args: { p_a: string; p_b?: number }
        Returns: {
          id: string
          n: number
          note: string | null
        }[]
      }
      g: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
    }
    Enums: {`);
const argCases = [
  ['f', { p_a: 'x' }, false], ['f', { p_a: 'x', p_b: 1 }, false], ['g', {}, false],
  ['f', { p_a: 'x', p_c: 1 }, true], ['f', { p_b: 1 }, true], ['g', { p_x: 1 }, true],
];
for (const [fn, args, want] of argCases) {
  if (!!rpcArgsRejection(fn, args, FAKE) !== want) {
    problems.push(`bộ so đối số RPC sai ở ${fn}(${JSON.stringify(args)}): phải ${want ? 'từ chối' : 'nhận'}`);
  }
}
const retCases = [
  ['f', [{ id: 'a', n: 1, note: null }], 0], ['g', 3, 0],
  ['f', [{ id: 'a', n: 1, note: null, x: 1 }], 1], ['f', [{ id: 'a', note: 'y' }], 1],
  ['f', [{ id: 'a', n: '1', note: null }], 1], ['f', { id: 'a' }, 1], ['g', 'ba', 1],
];
for (const [fn, v, want] of retCases) {
  const got = rpcReturnProblems(fn, v, FAKE).length;
  if ((got > 0) !== (want > 0)) problems.push(`bộ so kết quả RPC sai ở ${fn} ← ${JSON.stringify(v)}: báo ${got} lỗi`);
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
    'chưa sinh lại, và mỗi cái chỉ đúng tên tệp migration đã thêm nó. ' +
    `Và ${Object.keys(RPC_FIXTURES).length} fixture RPC (#38), chạy trên \`sample\` của từng cái, ra ${rpcRows} hàng khớp đúng ` +
    '`Returns` trong khối Functions của `types.ts` (không cột thừa, không thiếu, đúng kiểu) với đối số khớp `Args`; ' +
    `hai bộ so tự phá thử ${argCases.length + retCases.length} ca`,
);
