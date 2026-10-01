/**
 * Luật nào BÁO SỐ DÒNG thì phải bỏ chú thích mà GIỮ NGUYÊN độ dài (#164).
 *
 * ── lỗi này có hình dạng gì ──
 *
 * Phần lớn `tools/*.mjs` bỏ chú thích trước khi dò, bằng cùng một mẫu:
 *
 *     s.replace(/\/\*[\s\S]*?\*\//g, '')
 *
 * Mẫu ấy xoá luôn các dấu xuống dòng nằm trong chú thích khối. Một luật rồi
 * tính dòng bằng `code.slice(0, i).split('\n').length` trên chuỗi đã co, nên
 * dòng nó báo lệch LÊN đúng bằng số dòng chú thích phía trên chỗ lỗi — kho này
 * chú thích dày, nên lệch hàng chục dòng. Đo ở #164: `nav-guard` báo
 * `settings.tsx:222` cho một lệnh ở dòng 329. Mẫu bỏ chú thích dòng
 * `/^\s*\/\/.*$/gm → ''` cũng nuốt dòng: `\s*` vượt qua các dòng trống phía
 * trên chú thích.
 *
 * Bản đúng thay mỗi ký tự của chú thích bằng một khoảng trắng và giữ `\n`:
 * độ dài không đổi, nên vị trí và số dòng trong chuỗi đã bóc là của tệp thật.
 *
 * ── bước này đòi gì ──
 *
 * Tệp nào trong `tools/` (kể cả thư mục con) có `.split('\n').length` thì
 * không được chứa hai mẫu nuốt dòng ấy, trừ chỗ ghi `co chuỗi có chủ ý (#164)`
 * kèm lý do trên cùng dòng. Là luật TĨNH; nó không chứng minh số
 * dòng đúng, nó cấm đúng cái hình dạng đã làm sai.
 *
 * Cái giá đã trả khi đổi: hai luật đo "gần" bằng số ký tự (`logged-day`: 400
 * ký tự trước truy vấn; `tap-targets`: 400 ký tự trước style) đỏ ngay, vì
 * chú thích nay chiếm chỗ — cả hai đổi sang hỏi đúng cấu trúc (nhánh gần nhất,
 * thẻ mở gần nhất). `nav-guard` cấm lệnh điều hướng trong 200 ký tự sau
 * `signOut()` thì sẽ xanh OAN (chú thích chiếm chỗ của mã) — nó cắt cửa sổ
 * từ tệp gốc tại cùng vị trí, chú thích xoá hẳn như trước.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TOOLS = path.dirname(fileURLToPath(import.meta.url));
const SELF = path.basename(fileURLToPath(import.meta.url));

/* Hai mẫu nuốt dòng, viết đúng như chúng xuất hiện trong mã nguồn. */
const SHRINKING = [
  ["replace(/\\/\\*[\\s\\S]*?\\*\\//g, '')", 'chú thích khối xoá hẳn — mất cả dòng'],
  /* `^\s*` vượt qua dòng trống (\s khớp \n), nên mẫu này nuốt dòng thật. Mẫu
     anh em `(^|[^:])\/\/.*$` → '$1' thì KHÔNG: `[^:]` giữ lại chính ký tự
     xuống dòng nó khớp — chỉ lệch vị trí trong dòng, không lệch số dòng. */
  ["replace(/^\\s*\\/\\/.*$/gm, '')", 'chú thích dòng (kèm dòng trống phía trên) xoá hẳn — mất dòng'],
];
const COUNTS_LINES = ".split('\\n').length";

export function shrinkingIn(src) {
  if (!src.includes(COUNTS_LINES)) return [];
  const out = [];
  for (const [pat, why] of SHRINKING) {
    for (let i = src.indexOf(pat); i >= 0; i = src.indexOf(pat, i + 1)) {
      /* Miễn trừ có lý do, trên chính dòng ấy: co chuỗi CÓ CHỦ Ý trên một
         đoạn không dùng để tính dòng (cửa sổ ký tự của nav-guard). */
      const lineText = src.slice(src.lastIndexOf('\n', i) + 1, src.indexOf('\n', i) < 0 ? undefined : src.indexOf('\n', i));
      if (/co chuỗi có chủ ý \(#164\)/.test(lineText)) continue;
      out.push({ line: src.slice(0, i).split('\n').length, why });
    }
  }
  return out;
}

const problems = [];

/* ── tự kiểm ── */
{
  const LC = "const line = code.slice(0, i).split('\\n').length;";
  const cases = [
    [`const strip = (s) => s.replace(/\\/\\*[\\s\\S]*?\\*\\//g, '');\n${LC}`, 1, 'khối xoá hẳn'],
    [`const strip = (s) => s.replace(/(^|[^:])\\/\\/.*$/gm, '$1');\n${LC}`, 0, 'dòng → $1 giữ dòng'],
    [`const w = s.replace(/\\/\\*[\\s\\S]*?\\*\\//g, ''); // co chuỗi có chủ ý (#164): cửa sổ\n${LC}`, 0, 'miễn trừ có lý do'],
    [`const strip = (s) => s.replace(/^\\s*\\/\\/.*$/gm, '');\n${LC}`, 1, 'dòng xoá hẳn'],
    [`const strip = (s) => s.replace(/\\/\\*[\\s\\S]*?\\*\\//g, (c) => c.replace(/[^\\n]/g, ' '));\n${LC}`, 0, 'giữ độ dài'],
    ["const strip = (s) => s.replace(/\\/\\*[\\s\\S]*?\\*\\//g, '');\nconst n = 1;", 0, 'không tính dòng'],
  ];
  for (const [src, want, label] of cases) {
    const got = shrinkingIn(src).length;
    if (got !== want) problems.push(`tự kiểm (${label}): ra ${got}, phải ${want}`);
  }
}

/* ── trên mã thật ── */
const walk = (dir) => readdirSync(dir).flatMap((f) => {
  const p = path.join(dir, f);
  if (statSync(p).isDirectory()) return f === 'node_modules' || f.startsWith('.') ? [] : walk(p);
  return p.endsWith('.mjs') ? [p] : [];
});
let counting = 0;
for (const abs of walk(TOOLS)) {
  if (path.basename(abs) === SELF) continue;
  const src = readFileSync(abs, 'utf8');
  if (src.includes(COUNTS_LINES)) counting++;
  for (const { line, why } of shrinkingIn(src)) {
    problems.push(`tools/${path.relative(TOOLS, abs)}:${line}: ${why}, trong một tệp báo số dòng — thay bằng (c) => c.replace(/[^\\n]/g, ' ')`);
  }
}
if (counting < 20) problems.push(`tự kiểm: chỉ ${counting} tệp tính số dòng — bộ quét đã mù?`);

if (problems.length) {
  console.error(`số dòng của luật HỎNG\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  process.exit(1);
}
console.log(
  `số dòng của luật OK — ${counting} tệp trong tools/ báo số dòng, không tệp nào bỏ chú thích theo lối làm co chuỗi ` +
    '(chú thích khối xoá hẳn, hay chú thích dòng xoá hẳn kèm dòng trống phía trên — cả hai nuốt dòng), nên dòng chúng báo là dòng thật của tệp. Trước #164, 11 tệp ' +
    'như vậy báo lệch lên đúng bằng số dòng chú thích phía trên chỗ lỗi (nav-guard: 222 cho một lệnh ở dòng 329). ' +
    'Tự kiểm 6 ca',
);
