/**
 * Preset nước uống: mỗi đơn vị một bộ số tròn được CHỌN, không phải quy đổi.
 *
 * ── vì sao ──
 *
 * Xem `src/lib/water-presets.ts`: 250ml là 8.45oz — không ai bấm "8.45".
 * Nên `ml: [250, 500, 750]` và `oz: [8, 12, 16]` là hai danh sách độc lập,
 * không phải một danh sách nhân với 0.0338. Ai "gọn hoá" bằng cách suy ra
 * một vế từ vế kia sẽ cho người dùng bấm số lẻ.
 *
 * Ba con số này hiện ở HAI chỗ (màn /water và thẻ Nước uống trên dashboard):
 * chép tay sang chỗ thứ hai là mở cửa cho hai nơi lệch nhau mà không ai hay.
 *
 * ── luật ──
 *
 * 1. Mọi preset là số tròn (integer) — số lẻ ở đây là số không ai bấm.
 * 2. Không vế nào là bản quy đổi của vế kia: đổi một giá trị ml sang oz (và
 *    ngược lại) không bao giờ ra số tròn — đó chính là lý do hai list tồn
 *    tại. Định nghĩa trong source phải là hai array literal, không phải một
 *    `.map` chia cho 29.57.
 * 3. Không hardcode ở call-site: chuỗi literal của bộ preset không được xuất
 *    hiện ở file nào khác; mọi chỗ dùng đi qua `waterQuickAmounts`.
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

const ML_PER_FLOZ = 29.5735296; // US fluid ounce — cùng hằng số với lib/units.ts

/* ── 1+2. giá trị thật ── */
const { waterQuickAmounts } = await import(
  pathToFileURL(path.join(NATIVE, 'src/lib/water-presets.ts')).href
);
if (typeof waterQuickAmounts !== 'function') {
  console.error('preset nước HỎNG\n  - src/lib/water-presets.ts: thiếu export waterQuickAmounts — gate mù?');
  process.exit(1);
}
const ml = [...waterQuickAmounts('ml')];
const oz = [...waterQuickAmounts('oz')];
if (ml.length === 0 || oz.length === 0) problems.push('một trong hai bộ preset rỗng');
for (const v of [...ml, ...oz]) {
  if (!Number.isInteger(v) || v <= 0) problems.push(`preset ${v} không phải số tròn dương — không ai bấm số lẻ`);
}
/* Không vế nào quy đổi ra vế kia: đổi đơn vị mà ra số tròn thì list kia thừa */
for (const v of ml) {
  if (Number.isInteger(v / ML_PER_FLOZ)) {
    problems.push(`${v}ml = ${v / ML_PER_FLOZ}oz tròn — bộ oz đang là bản quy đổi, không phải bộ được chọn`);
  }
}
for (const v of oz) {
  if (Number.isInteger(v * ML_PER_FLOZ)) {
    problems.push(`${v}oz = ${v * ML_PER_FLOZ}ml tròn — bộ ml đang là bản quy đổi, không phải bộ được chọn`);
  }
}
/* Định nghĩa phải là literal, không phải .map suy ra */
const def = strip(readFileSync(path.join(NATIVE, 'src/lib/water-presets.ts'), 'utf8'));
if (!/ml:\s*\[[\d,\s]+\]/.test(def) || !/oz:\s*\[[\d,\s]+\]/.test(def)) {
  problems.push('src/lib/water-presets.ts: hai bộ preset phải là array literal — cấm suy một vế từ vế kia bằng .map/quy đổi');
}

/* ── 3. không hardcode ở call-site ── */
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'src'], {
  cwd: NATIVE,
  encoding: 'utf8',
})
  .split('\n')
  .filter((f) => /\.(ts|tsx)$/.test(f));
const seq = (xs) => xs.join(',').replace(/,/g, ',\\s*');
let users = 0;
for (const f of files) {
  if (f === 'src/lib/water-presets.ts') continue;
  const code = strip(readFileSync(path.join(NATIVE, f), 'utf8'));
  for (const [name, xs] of [['ml', ml], ['oz', oz]]) {
    if (new RegExp(`\\[\\s*${seq(xs)}\\s*\\]`).test(code)) {
      problems.push(`${f}: hardcode bộ preset ${name} [${xs.join(', ')}] — dùng waterQuickAmounts (src/lib/water-presets.ts)`);
    }
  }
  if (/waterQuickAmounts\s*\(/.test(code)) users++;
}
if (users < 2) problems.push(`tự kiểm: chỉ ${users} chỗ dùng waterQuickAmounts (muốn ≥2: màn /water + thẻ dashboard) — bộ quét đã mù?`);

if (problems.length) {
  console.error(`preset nước HỎNG\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  process.exit(1);
}
console.log(
  `preset nước OK — ml [${ml.join(', ')}] / oz [${oz.join(', ')}]: số tròn, không vế nào là bản quy đổi của vế kia, ` +
    `${users} chỗ dùng qua waterQuickAmounts, không hardcode ở call-site`,
);
