/**
 * Mọi `confirmWrite(...)` hỏi lại một cột CÓ THẬT trong bảng nó ghi.
 *
 * ── lỗi này sinh ra luật ──
 *
 * `confirmWrite` thêm `.select(key)` vào một lệnh UPDATE/DELETE để biết lệnh ấy
 * có chạm dòng nào không. PostgREST biến `select=id` thành `RETURNING id`, và
 * PostgreSQL từ chối nó bằng 42703 trên một bảng không có cột `id`. Bốn bảng cộng
 * đồng có khoá là một CẶP cột và không có `id` nào: `community_likes`,
 * `community_saves`, `community_follows`, `community_challenge_members`. Nên Bỏ
 * thích, Bỏ lưu, Bỏ theo dõi và Rời thử thách chưa từng chạy được trên một server
 * thật — kiểm trên Postgres 16 dựng từ chính các migration: bốn câu `DELETE …
 * RETURNING id` đều `column "id" does not exist`.
 *
 * Không gì khác bắt được nó: `tsc` thấy một chuỗi, bộ chạy web trả hàng mà không
 * kiểm cột, và test SQL gọi thẳng `DELETE` chứ không qua `confirmWrite`.
 *
 * ── cách đọc ──
 *
 * Mỗi lời gọi: tên bảng lấy từ `.from('x')` trong đối số đầu. Khi tên bảng là
 * một BIẾN (`.from(table)` trong `useToggle`), luật tra các giá trị có thể có
 * của biến ấy từ kiểu hợp của tham số cùng tên trong tệp — bỏ qua thì đúng chỗ
 * đã hỏng sẽ lọt. Cột là đối số thứ ba, hoặc `id` khi không có. Cột ấy phải nằm
 * trong `Row` của bảng trong `types.ts`.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(NATIVE, 'src');

const types = readFileSync(path.join(SRC, 'integrations/supabase/types.ts'), 'utf8');
const tablesBlock = types.slice(types.indexOf('Tables: {'), types.indexOf('Views: {'));
function rowCols(t) {
  const i = tablesBlock.indexOf(`\n      ${t}: {`);
  if (i < 0) return null;
  const r = tablesBlock.indexOf('Row: {', i);
  const e = tablesBlock.indexOf('}', r);
  return [...tablesBlock.slice(r, e).matchAll(/^\s+(\w+)\??:/gm)].map((m) => m[1]);
}

const walk = (d) =>
  readdirSync(d, { withFileTypes: true }).flatMap((x) =>
    x.isDirectory() ? walk(path.join(d, x.name)) : /\.tsx?$/.test(x.name) ? [path.join(d, x.name)] : [],
  );

/* Đối số của một lời gọi, tách ở dấu phẩy CẤP NGOÀI CÙNG. */
function callArgs(src, open) {
  const args = [];
  let depth = 0;
  let cur = '';
  let q = null;
  for (let i = open + 1; i < src.length; i++) {
    const ch = src[i];
    if (q) {
      cur += ch;
      if (ch === q && src[i - 1] !== '\\') q = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      q = ch;
      cur += ch;
      continue;
    }
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    if (ch === ')' || ch === ']' || ch === '}') {
      if (depth === 0) {
        args.push(cur.trim());
        return args;
      }
      depth--;
    }
    if (ch === ',' && depth === 0) {
      args.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  return args;
}

export function scan(files) {
  const problems = [];
  let calls = 0;
  for (const [file, src] of files) {
    if (file.endsWith(path.join('lib', 'write-result.ts'))) continue;
    for (const m of src.matchAll(/\bconfirmWrite\(/g)) {
      calls++;
      const args = callArgs(src, m.index + m[0].length - 1);
      const where = `${path.relative(SRC, file)}:${src.slice(0, m.index).split('\n').length}`;
      const from = args[0]?.match(/\.from\(\s*(?:(['"])(\w+)\1|(\w+))\s*\)/);
      if (!from) {
        problems.push(`${where}: không đọc được tên bảng từ đối số đầu`);
        continue;
      }
      let tables;
      if (from[2]) tables = [from[2]];
      else {
        const v = from[3];
        const decl = src.match(new RegExp(`\\b${v}\\s*:\\s*((?:'\\w+'\\s*\\|\\s*)*'\\w+')`));
        if (!decl) {
          problems.push(`${where}: bảng là biến \`${v}\` mà không tìm được kiểu hợp của nó — luật không kiểm được, viết tên bảng thẳng ra`);
          continue;
        }
        tables = [...decl[1].matchAll(/'(\w+)'/g)].map((x) => x[1]);
      }
      const keyArg = args[2];
      const key = keyArg ? keyArg.match(/^['"](\w+)['"]$/)?.[1] : 'id';
      if (!key) {
        problems.push(`${where}: cột hỏi lại phải là một chuỗi viết thẳng, không phải \`${keyArg}\``);
        continue;
      }
      for (const t of tables) {
        const cols = rowCols(t);
        if (!cols) problems.push(`${where}: bảng '${t}' không có trong types.ts`);
        else if (!cols.includes(key)) {
          problems.push(
            `${where}: confirmWrite trên '${t}' hỏi lại cột '${key}', mà bảng ấy không có cột đó ` +
              `(có: ${cols.join(', ')}). PostgREST biến nó thành RETURNING ${key} và PostgreSQL trả 42703 — ` +
              'lệnh ghi hỏng MỌI lần trên server thật. Truyền cột có thật làm đối số thứ ba',
          );
        }
      }
    }
  }
  return { problems, calls };
}

const files = walk(SRC).map((f) => [f, readFileSync(f, 'utf8')]);
const { problems, calls } = scan(files);

/* ── thử ngược, trên bản sao trong bộ nhớ: bỏ cột ở một lời gọi đã sửa ── */
const probe = files.map(([f, s]) => [f, f.endsWith(path.join('hooks', 'use-community.ts')) ? s.replace(/,\s*'followee_id',\s*\)/, ')') : s]);
if (scan(probe).problems.length === 0) {
  problems.push('thử ngược hỏng: bỏ cột `followee_id` khỏi lời gọi bỏ theo dõi mà luật vẫn xanh — bộ quét không còn đọc đúng');
}
if (calls < 30) problems.push(`chỉ thấy ${calls} lời gọi confirmWrite — bộ quét hỏng, đừng tin kết quả`);

if (problems.length) {
  console.log('confirmWrite hỏi lại cột không có thật:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}
console.log(
  `cột của confirmWrite OK — ${calls} lời gọi, mỗi cái hỏi lại một cột có thật trong bảng của nó ` +
    '(kể cả khi tên bảng là một biến: luật tra kiểu hợp của nó). Bốn bảng cộng đồng khoá bằng một CẶP ' +
    'cột và không có `id`; bản đã ship hỏi `id` ở cả bốn, nên Bỏ thích / Bỏ lưu / Bỏ theo dõi / Rời thử ' +
    'thách hỏng mọi lần trên server thật (RETURNING id → 42703). Thử ngược trên bản sao: bỏ cột ở lời ' +
    'gọi bỏ theo dõi thì luật đỏ',
);
