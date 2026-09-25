/**
 * Chữ tiếng Việt app hiện ra dùng MỘT kiểu bỏ dấu: kiểu cũ — "hoá", "Huỷ",
 * "khoẻ" (#105).
 *
 * ── vì sao ──
 *
 * Tiếng Việt có hai kiểu đặt dấu thanh cho vần oa/oe/uy mở: "hoá"/"hóa",
 * "Huỷ"/"Hủy". Cả hai đều đúng, nhưng một app dùng lẫn hai kiểu thì hai hộp
 * thoại cạnh nhau hiện nút Huỷ bằng hai cách viết. Đo khi viết, trong `src/`
 * (cả chú thích): oá 549 / óa 10, uỷ 38 / ủy 2, uỳ 37 / ùy 3 — kiểu cũ áp đảo.
 * Mà 16 chỗ lệch đều là CHỮ HIỆN RA: `i18n.ts` có `cancel: 'Hủy'`,
 * `delete: 'Xóa'`, trong khi `native-strings.ts` có `nCancel: 'Huỷ'` và mọi
 * hộp hỏi lại viết thẳng `'Huỷ'`. Hệ quả phụ: `DESTRUCTIVE` của `live.mjs`
 * (#91) phải liệt kê cả "Xoá" lẫn "Xóa".
 *
 * ── luật ──
 *
 * Trong `src/`, mọi chuỗi, mảnh template và chữ JSX — đọc bằng trình phân tích
 * cú pháp, nên chú thích không bị xét — không được có dấu thanh đặt trên chữ
 * ĐẦU của vần oa/oe/uy khi vần ấy đứng cuối âm tiết. Sau `q` không xét: "quý",
 * "quỳ" viết như nhau ở cả hai kiểu. Vần có âm cuối ("hoàn", "huỳnh") cũng như
 * nhau ở cả hai kiểu, nên không khớp.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { parse } = createRequire(pathToFileURL(path.join(NATIVE, 'package.json')))('@babel/parser');

/* Kiểu mới: dấu trên o/u, chữ sau (a, e, y) không dấu, và không chữ nào theo sau. */
const NEW_STYLE = /(?<![qQ])(?:[óòỏõọÓÒỎÕỌ][aeAE]|[úùủũụÚÙỦŨỤ][yY])(?!\p{L})/u;

function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(f) && !f.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

/** `{ out: ["tệp:dòng: …"], n: số mảnh chữ đã xét }` cho các tệp `[[tên, mã]]`. */
export function problemsOf(files) {
  const out = [];
  let n = 0;
  for (const [rel, src] of files) {
    const ast = parse(src, { sourceType: 'module', plugins: ['typescript', 'jsx'] });
    const visit = (node) => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) return node.forEach(visit);
      if (typeof node.type !== 'string') return;
      const text =
        node.type === 'StringLiteral' ? node.value : node.type === 'TemplateElement' ? node.value.cooked : node.type === 'JSXText' ? node.value : null;
      if (text) {
        n++;
        const m = NEW_STYLE.exec(text);
        if (m) {
          const word = text.slice(0, m.index + 2).match(/\p{L}*$/u)[0];
          out.push(`${rel}:${node.loc.start.line}: "${word}" đặt dấu kiểu mới — app viết kiểu cũ ("hoá", "Huỷ", "khoẻ")`);
        }
      }
      for (const k in node) if (k !== 'loc' && k !== 'leadingComments' && k !== 'trailingComments' && k !== 'innerComments') visit(node[k]);
    };
    visit(ast.program);
  }
  return { out, n };
}

const files = walk(path.join(NATIVE, 'src')).map((p) => [path.relative(NATIVE, p), readFileSync(p, 'utf8')]);
const { out: problems, n } = problemsOf(files);
if (n < 3000) problems.push(`chỉ xét được ${n} mảnh chữ — bộ đọc hỏng, đừng tin kết quả`);

/* ── thử ngược ── */
{
  const base = problems.length;
  const one = (label, src, wantRed) => {
    const got = problemsOf([['thử.tsx', src]]).out.length > 0;
    if (got !== wantRed) problems.push(`thử ngược hỏng: ${label} — luật ${got ? 'đỏ' : 'xanh'}, phải ${wantRed ? 'đỏ' : 'xanh'}`);
  };
  one('chuỗi "Hủy"', "const a = { cancel: 'Hủy' };", true);
  one('template "Đã xóa ${n} mục"', 'const b = (n: number) => `Đã xóa ${n} mục`;', true);
  one('chữ JSX "Sức khỏe"', 'const c = <Text>Sức khỏe</Text>;', true);
  one('"quý", "quỳ" (giống nhau ở hai kiểu)', "const d = ['Quý khách', 'quỳ gối'];", false);
  one('"hoàn", "huỳnh" (vần có âm cuối)', "const e = 'Hoàn thành · Huỳnh';", false);
  one('kiểu cũ "Huỷ", "hoá", "khoẻ"', "const f = 'Huỷ · cá nhân hoá · khoẻ';", false);
  one('chú thích "Hủy"', "// nút Hủy\nconst g = 1;", false);
  /* Trên chính cây thật: đưa lại 'Hủy' vào i18n.ts thì đỏ. */
  const i = files.findIndex(([f]) => f === 'src/lib/i18n.ts');
  if (i < 0 || !files[i][1].includes("cancel: 'Huỷ'")) problems.push('thử ngược hỏng: không thấy cancel: \'Huỷ\' trong i18n.ts');
  else {
    const copy = files.slice();
    copy[i] = [files[i][0], files[i][1].replace("cancel: 'Huỷ'", "cancel: 'Hủy'")];
    if (problemsOf(copy).out.length <= base) problems.push("thử ngược hỏng: đưa lại cancel: 'Hủy' vào i18n.ts mà luật vẫn xanh");
  }
}

if (problems.length) {
  console.log('chữ tiếng Việt lẫn hai kiểu bỏ dấu:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}
console.log(
  `kiểu bỏ dấu OK — ${n} mảnh chữ (chuỗi, template, chữ JSX) trong ${files.length} tệp src/ đều đặt dấu kiểu cũ ("hoá", "Huỷ", "khoẻ"), ` +
    'nên hai hộp thoại cạnh nhau không còn hiện "Huỷ" và "Hủy". Thử ngược: "Hủy" trong chuỗi, template, chữ JSX, và đưa lại ' +
    "cancel: 'Hủy' vào i18n.ts thì đỏ; \"quý\", \"hoàn\", kiểu cũ và chú thích thì xanh",
);
