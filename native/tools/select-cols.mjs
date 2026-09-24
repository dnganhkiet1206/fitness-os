/**
 * Mọi `.from('x')…select('a, b')` viết tay chỉ hỏi cột CÓ THẬT trong bảng x (#36).
 *
 * ── vì sao ──
 *
 * `c227cfe`: bốn lệnh xoá của cộng đồng hỏi `select=id` trên bảng không có cột
 * `id`, PostgREST biến nó thành `RETURNING id`, và PostgreSQL trả 42703 — hỏng
 * MỌI lần trên server thật. `confirm-write-cols.mjs` canh riêng `confirmWrite`.
 * Luật này canh mọi `.select('…')` còn lại: đọc, `.insert(…).select('id')`,
 * `.update(…).select(…)`. Một cột sai ở bất kỳ đâu là cùng lỗi ấy, và bộ chạy
 * web không thấy vì máy chủ giả trả hàng mà không kiểm cột (#35).
 *
 * ── cách đọc ──
 *
 * Với mỗi `.select(`, bảng là `.from(…)` GẦN NHẤT phía trước trong cùng câu lệnh.
 * Danh sách cột là chuỗi viết thẳng, hoặc một hằng số `const TÊN = '…'` (tìm
 * trong tệp, rồi trong mọi tệp của src/ — `POST_COLS` được import sang tệp khác).
 * Mỗi cột: bỏ bí danh `a:b`, ép kiểu `::t`, đường dẫn JSON `->`/`->>`; bỏ qua `*`
 * và phép nhúng `bảng(cột)` (PostgREST tự kiểm quan hệ, và nhúng không nằm trong
 * phạm vi lỗi này). Bảng tra trong `Tables` VÀ `Views` của `types.ts`.
 *
 * Chỗ nào không đọc được tĩnh (không có `.from` trong câu lệnh, bảng là biến
 * không có kiểu hợp, cột ghép chuỗi) KHÔNG làm cổng đỏ nhưng được ĐẾM và in ra,
 * để "không đọc được" không lặng lẽ thành "đã kiểm".
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(NATIVE, 'src');

const types = readFileSync(path.join(SRC, 'integrations/supabase/types.ts'), 'utf8');
const block = types.slice(types.indexOf('Tables: {'), types.indexOf('Functions: {'));
function rowCols(t) {
  const i = block.indexOf(`\n      ${t}: {`);
  if (i < 0) return null;
  const r = block.indexOf('Row: {', i);
  const e = block.indexOf('}', r);
  return [...block.slice(r, e).matchAll(/^\s+(\w+)\??:/gm)].map((m) => m[1]);
}

const walk = (d) =>
  readdirSync(d, { withFileTypes: true }).flatMap((x) =>
    x.isDirectory() ? walk(path.join(d, x.name)) : /\.tsx?$/.test(x.name) ? [path.join(d, x.name)] : [],
  );

/* Tách ở dấu phẩy cấp ngoài cùng — phép nhúng mang dấu phẩy trong ngoặc. */
function splitTop(s) {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

/* Tên cột gốc của một mục trong `select`, hoặc null nếu mục ấy nằm ngoài phạm vi. */
function baseColumn(item) {
  if (item === '*' || item.includes('(')) return null; // tất cả, hoặc phép nhúng / hàm gộp
  let s = item;
  if (s.includes(':') && !s.includes('::')) s = s.split(':').pop();
  else if (/^\w+:[^:]/.test(s)) s = s.slice(s.indexOf(':') + 1);
  s = s.split('::')[0].split('->')[0].trim();
  return /^\w+$/.test(s) ? s : null;
}

/* Xoá chú thích nhưng giữ nguyên số dòng (và mọi ký tự khác), để một câu chú
   thích nhắc tới `.select('id')` không bị đọc thành một lời gọi. */
function stripComments(src) {
  let out = '';
  let i = 0;
  let q = null;
  while (i < src.length) {
    const ch = src[i];
    if (q) {
      out += ch;
      if (ch === '\\') { out += src[i + 1] ?? ''; i += 2; continue; }
      if (ch === q) q = null;
      i++;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { q = ch; out += ch; i++; continue; }
    if (ch === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') { out += ' '; i++; } continue; }
    if (ch === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end < 0 ? src.length : end + 2;
      for (; i < stop; i++) out += src[i] === '\n' ? '\n' : ' ';
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

export function scan(rawFiles) {
  const files = rawFiles.map(([f, s]) => [f, stripComments(s)]);
  const consts = new Map();
  for (const [, src] of files) {
    for (const m of src.matchAll(/(?:export\s+)?const\s+([A-Z][A-Z0-9_]*)\s*=\s*\n?\s*(['"])([^'"]*)\2/g)) {
      if (!consts.has(m[1])) consts.set(m[1], m[3]);
    }
  }
  const problems = [];
  const unread = [];
  let checked = 0;
  for (const [file, src] of files) {
    const rel = path.relative(SRC, file);
    if (rel === path.join('lib', 'write-result.ts')) continue; // `.select(key)` của confirmWrite: luật riêng
    const localConsts = new Map(
      [...src.matchAll(/(?:export\s+)?const\s+([A-Z][A-Z0-9_]*)\s*=\s*\n?\s*(['"])([^'"]*)\2/g)].map((m) => [m[1], m[3]]),
    );
    for (const m of src.matchAll(/\.select\(\s*(?:(['"])([^'"]*)\1|([A-Z][A-Z0-9_]*))/g)) {
      const where = `${rel}:${src.slice(0, m.index).split('\n').length}`;
      const cols = m[2] ?? localConsts.get(m[3]) ?? consts.get(m[3]);
      if (cols === undefined) {
        unread.push(`${where} (hằng số ${m[3]} không tìm thấy)`);
        continue;
      }
      /* Chỉ gồm `*` hay phép nhúng thì không có cột nào để tra — khỏi cần bảng. */
      if (splitTop(cols).every((it) => baseColumn(it) === null)) continue;
      // `.from` gần nhất phía trước, trong cùng câu lệnh (không vượt dấu `;`).
      const before = src.slice(Math.max(0, m.index - 4000), m.index);
      const stmt = before.slice(before.lastIndexOf(';') + 1);
      const froms = [...stmt.matchAll(/\.from\(\s*(?:(['"])(\w+)\1|(\w+))\s*\)/g)];
      const from = froms.at(-1);
      if (!from) {
        unread.push(`${where} (không có .from trong câu lệnh)`);
        continue;
      }
      let tables;
      if (from[2]) tables = [from[2]];
      else {
        const decl = src.match(new RegExp(`\\b${from[3]}\\s*:\\s*((?:'\\w+'\\s*\\|\\s*)*'\\w+')`));
        if (!decl) {
          unread.push(`${where} (bảng là biến \`${from[3]}\`)`);
          continue;
        }
        tables = [...decl[1].matchAll(/'(\w+)'/g)].map((x) => x[1]);
      }
      for (const t of tables) {
        const have = rowCols(t);
        if (!have) {
          problems.push(`${where}: bảng '${t}' không có trong types.ts`);
          continue;
        }
        checked++;
        for (const item of splitTop(cols)) {
          const c = baseColumn(item);
          if (c && !have.includes(c)) {
            problems.push(
              `${where}: select trên '${t}' hỏi cột '${c}', mà bảng ấy không có (có: ${have.join(', ')}). ` +
                'PostgREST trả lỗi cho MỌI lần gọi trên server thật; bộ chạy web không thấy vì máy chủ giả không kiểm cột',
            );
          }
        }
      }
    }
  }
  return { problems, unread, checked };
}

const files = walk(SRC).map((f) => [f, readFileSync(f, 'utf8')]);
const { problems, unread, checked } = scan(files);

/* ── thử ngược trên bản sao trong bộ nhớ: một cột không có thật trong một hằng số dùng chung ── */
const probe = files.map(([f, s]) => [f, f.endsWith(path.join('hooks', 'use-community.ts')) ? s.replace("const PROFILE_COLS = 'user_id,", "const PROFILE_COLS = 'id, user_id,") : s]);
if (scan(probe).problems.length === 0) {
  problems.push('thử ngược hỏng: thêm cột `id` (không có thật) vào PROFILE_COLS mà luật vẫn xanh — bộ quét không còn đọc đúng');
}
if (checked < 100) problems.push(`chỉ kiểm được ${checked} lời gọi select — bộ quét hỏng, đừng tin kết quả`);

if (problems.length) {
  console.log('select hỏi cột không có thật:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}
console.log(
  `cột của select OK — ${checked} lời gọi .select('…') trên bảng/view xác định được, mọi cột đều có thật ` +
    "(hằng số dùng chung như PROFILE_COLS/POST_COLS được tra cả khi import sang tệp khác; bỏ qua * và phép nhúng). " +
    `${unread.length} chỗ không đọc được tĩnh, liệt kê chứ không coi là đã kiểm: ` +
    (unread.length ? unread.join('; ') : 'không có') +
    '. Thử ngược trên bản sao: thêm một cột không có thật vào PROFILE_COLS thì luật đỏ',
);
