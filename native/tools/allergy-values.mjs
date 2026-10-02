/**
 * `profiles.allergies` chỉ chứa `.value` của `COMMON_ALLERGIES` — không bao
 * giờ chứa chuỗi hiển thị đã dịch.
 *
 * ── lỗi ──
 *
 * Xem `src/lib/food-preferences.ts`: onboarding cũ lưu chuỗi HIỂN THỊ, nên
 * tài khoản tiếng Việt giữ `"Hải sản"` trong khi tài khoản tiếng Anh giữ
 * `"Shellfish"` — cùng một dị ứng, hai token, và AI gợi ý món (prompt tiếng
 * Anh) âm thầm giỏi tránh một trong hai hơn. `canonicalAllergy` là đường
 * migrate cho các tài khoản cũ; cổng này giữ cho không ai ghi thêm bản dịch
 * mới vào cột.
 *
 * ── luật ──
 *
 * 1. Mọi `setAllergies(` thêm phần tử (`[...x, y]`, `.concat(`) phải lấy từ
 *    `.value` của `COMMON_ALLERGIES`; bất kỳ call site nào chứa `.label`
 *    là đỏ ngay — label là thứ hiển thị, không phải thứ lưu.
 * 2. Mọi payload `.update(` ghi cột `allergies` phải dùng đúng biến state
 *    `allergies` (đã qua `canonicalAllergy` khi seed), không phải literal
 *    hay biểu thức dựng từ label.
 * 3. Chạy thật `canonicalAllergy`/`allergyLabel` trên các ca biên: `"Hải sản"`
 *    → `"Shellfish"`, chuỗi lạ đi qua nguyên (không xoá dị ứng của người ta
 *    chỉ vì không nằm trong list tám món).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];

/** Bóc chú thích, giữ nguyên độ dài (#164). */
const strip = (s) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/.*$/gm, (c, p) => p + ' '.repeat(c.length - p.length));

/* ── 1. chạy thật các hàm chuẩn hoá ── */
const { COMMON_ALLERGIES, canonicalAllergy, allergyLabel } = await import(
  pathToFileURL(path.join(NATIVE, 'src/lib/food-preferences.ts')).href
);
if (!Array.isArray(COMMON_ALLERGIES) || COMMON_ALLERGIES.length === 0) {
  problems.push('src/lib/food-preferences.ts: COMMON_ALLERGIES rỗng — gate mù?');
} else {
  const values = COMMON_ALLERGIES.map((a) => a.value);
  if (new Set(values).size !== values.length) problems.push('COMMON_ALLERGIES có value trùng nhau');
  for (const a of COMMON_ALLERGIES) {
    if (!a.label?.en || !a.label?.vi) problems.push(`COMMON_ALLERGIES: ${a.value} thiếu label en/vi`);
  }
}
const cases = [
  [() => canonicalAllergy('Hải sản'), 'Shellfish', 'bản dịch cũ phải về giá trị chuẩn'],
  [() => canonicalAllergy('Shellfish'), 'Shellfish', 'giá trị chuẩn đi qua nguyên'],
  [() => canonicalAllergy('shellfish'), 'Shellfish', 'không phân biệt hoa thường'],
  [() => canonicalAllergy('Ớt hiểm'), 'Ớt hiểm', 'chuỗi lạ đi qua nguyên — không xoá dị ứng của người ta'],
  [() => allergyLabel('Shellfish', 'vi'), 'Hải sản', 'hiển thị theo ngôn ngữ người đọc'],
  [() => allergyLabel('Shellfish', 'en'), 'Shellfish', 'hiển thị theo ngôn ngữ người đọc'],
];
let behavior = 0;
for (const [fn, want, why] of cases) {
  behavior++;
  const got = fn();
  if (got !== want) problems.push(`chuẩn hoá dị ứng: được ${JSON.stringify(got)}, muốn ${JSON.stringify(want)} — ${why}`);
}

/* ── 2. quét các chỗ ghi ── */
/** Thân lời gọi `name(` từ vị trí mở ngoặc, cắt bằng đếm ngoặc. */
function callBody(code, openIdx) {
  let depth = 0;
  let quote = null;
  for (let i = openIdx; i < code.length; i++) {
    const ch = code[i];
    if (quote) {
      if (ch === quote && code[i - 1] !== '\\') quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) return code.slice(openIdx, i + 1);
    }
  }
  return null;
}

const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'src'], {
  cwd: NATIVE,
  encoding: 'utf8',
})
  .split('\n')
  .filter((f) => /\.(ts|tsx)$/.test(f));

let writeSites = 0;
for (const f of files) {
  const code = strip(readFileSync(path.join(NATIVE, f), 'utf8'));

  /* 2a. setAllergies: cấm .label; chỗ thêm phần tử phải qua .value */
  for (const m of code.matchAll(/setAllergies\s*\(/g)) {
    const body = callBody(code, m.index + m[0].length - 1);
    if (!body) continue;
    const line = code.slice(0, m.index).split('\n').length;
    if (/\.label\b/.test(body)) {
      problems.push(`${f}:${line}: setAllergies ghi từ .label — label là thứ hiển thị, thứ lưu phải là .value`);
      continue;
    }
    const adds = /\.\.\.[A-Za-z_$][\w$]*\s*,/.test(body) || /\.concat\s*\(/.test(body);
    if (adds && !/\.value\b/.test(body)) {
      problems.push(
        `${f}:${line}: setAllergies thêm phần tử mà không qua .value của COMMON_ALLERGIES — chuỗi dịch sẽ lọt vào cột allergies`,
      );
    }
  }

  /* 2b. payload .update( ghi cột allergies: phải là biến state, không literal */
  for (const m of code.matchAll(/\.update\s*\(/g)) {
    const body = callBody(code, m.index + m[0].length - 1);
    if (!body || !/\ballergies\b/.test(body)) continue;
    writeSites++;
    const line = code.slice(0, m.index).split('\n').length;
    // `allergies,` hoặc `allergies: allergies` — shorthand/identifier; cấm literal và .label
    const lit = body.match(/\ballergies\s*:\s*([^,}]+)/);
    if (lit && !/^\s*allergies\s*$/.test(lit[1])) {
      problems.push(`${f}:${line}: payload update ghi allergies từ biểu thức ${lit[1].trim()} — phải là biến state đã qua canonicalAllergy`);
    }
    if (/\.label\b/.test(body)) {
      problems.push(`${f}:${line}: payload update chứa .label gần allergies — thứ lưu phải là .value`);
    }
    if (!/canonicalAllergy/.test(code)) {
      problems.push(`${f}:${line}: file ghi cột allergies mà không seed qua canonicalAllergy — tài khoản cũ lưu bản dịch sẽ lệch chip`);
    }
  }
}
if (writeSites === 0) problems.push('tự kiểm: không thấy chỗ nào .update( ghi allergies — bộ quét đã mù?');

if (problems.length) {
  console.error(`dị ứng HỎNG\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  process.exit(1);
}
console.log(
  `dị ứng OK — ${behavior} ca chuẩn hoá xanh, ${writeSites} chỗ ghi profiles.allergies: mọi phần tử thêm mới qua .value, ` +
    `không chỗ nào ghi .label`,
);
