/**
 * Không hook nào được gọi trong một hàm KHÔNG PHẢI component.
 *
 *     node tools/hook-scope.mjs
 *
 * ── lỗi nó bắt được, và đã bắt được thật ──
 *
 * `markdown-lite.tsx` có `renderInline(text)`: một hàm thuần ở phạm vi module,
 * được gọi MỘT LẦN CHO MỖI DÒNG bên trong `blocks.map(…)`, từ bốn nhánh khác
 * nhau của cùng vòng lặp. Đợt chuyển sang bảng màu đọc lúc chạy đã chèn
 * `usePalette()` vào đó — lần chạy đầu của `theme-migrate.mjs` nhận mọi hàm ở
 * phạm vi module là component.
 *
 * Hậu quả: số lần gọi hook trong một lần vẽ thay đổi theo SỐ DÒNG của văn bản.
 * Màn hình duy nhất dùng component này là trợ lý, nơi văn bản là câu trả lời
 * của mô hình — nên độ dài đổi ở mỗi tin nhắn, và React ném "Rendered more
 * hooks than during the previous render".
 *
 * ── vì sao phải là một công cụ ──
 *
 * `npx tsc` cho chuyện này màu XANH: `usePalette()` là một lời gọi hàm hợp lệ ở
 * mọi chỗ. Quy tắc hook là quy tắc lúc CHẠY, và cái giá của nó không phải một
 * dòng đỏ mà là một màn hình trắng ở đúng lúc người dùng đang đọc một câu trả
 * lời. Không có phép kiểm nào khác trong repo này nhìn thấy nó.
 *
 * ── nó nhận diện component thế nào ──
 *
 * Bằng quy ước tên của React: viết hoa chữ đầu, hoặc `useXxx` (một hook, được
 * phép gọi hook khác). Đó cũng chính là quy ước mà `theme-migrate.mjs` dùng để
 * quyết định chèn hay không, nên hai công cụ không thể bất đồng về cùng một hàm.
 *
 * Chỉ xét hàm ở PHẠM VI MODULE. Một hàm lồng bên trong một component đã nằm
 * trong phạm vi hook của component ấy; nếu nó là một callback thì lỗi nằm ở
 * chỗ gọi, không ở đây, và đó là câu hỏi khác.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { codeMask } from './lib/code-mask.mjs';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Hook nào bị soi.
 *
 * Cố ý KHÔNG phải `/use[A-Z]\w*\(/` chung chung: một hàm tên `useFoo` do repo
 * tự đặt mà không phải hook sẽ thành báo giả, và báo giả là cách một phép kiểm
 * bị tắt đi. Danh sách này là những hook mà đợt chuyển bảng màu SINH RA — cùng
 * với ba hook React hay bị kéo theo nhất.
 */
const HOOKS = [
  'usePalette',
  'useMaterial',
  'useThemeName',
  'useState',
  'useEffect',
  'useMemo',
];

function tsFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) tsFiles(full, out);
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

/** Ngoặc mở tại `start` khớp với ngoặc đóng nào — bỏ qua chú thích và chuỗi. */
function matchPair(src, mask, start, open, close) {
  let depth = 0;
  for (let k = start; k < src.length; k++) {
    if (!mask[k]) continue;
    if (src[k] === open) depth++;
    else if (src[k] === close) { depth--; if (depth === 0) return k; }
  }
  return -1;
}

/* Cùng ba hình dạng khai báo mà `theme-migrate.mjs` nhận. */
const HEAD =
  /^(?:export\s+default\s+function|export\s+function|function)\s+(\w+)\s*(?:<[^>]*>)?\s*\(|^(?:export\s+)?const\s+(\w+)\s*=\s*(?:<[^>]*>)?\s*\(|^(?:export\s+)?const\s+(\w+)\s*=\s*(?:React\.)?memo\(\s*function\s+\w*\s*(?:<[^>]*>)?\s*\(/gm;

const problems = [];
for (const full of tsFiles(path.join(NATIVE, 'src'))) {
  const src = readFileSync(full, 'utf8');
  const mask = codeMask(src);
  HEAD.lastIndex = 0;
  for (let m; (m = HEAD.exec(src)); ) {
    if (!mask[m.index]) continue;
    const name = m[1] ?? m[2] ?? m[3];
    if (/^[A-Z]/.test(name) || /^use[A-Z]/.test(name)) continue;

    const closeParen = matchPair(src, mask, src.lastIndexOf('(', HEAD.lastIndex), '(', ')');
    if (closeParen < 0) continue;
    let open = -1;
    for (let k = closeParen + 1; k < src.length; k++) {
      if (!mask[k]) continue;
      if (src[k] === '{') { open = k; break; }
      /* Bất cứ gì không phải khoảng trắng, `=>`, `:` hay một tên kiểu thì đây
         không phải một khai báo hàm có thân — bỏ qua, đừng đoán. */
      if (!/[\s=>:\w$.<>[\]|&,]/.test(src[k])) break;
    }
    if (open < 0) continue;
    const close = matchPair(src, mask, open, '{', '}');
    if (close < 0) continue;

    const body = src.slice(open, close);
    const line = src.slice(0, m.index).split('\n').length;
    for (const hook of HOOKS) {
      /* Trong MÃ, không trong chú thích: tệp nào cũng có thể KỂ LẠI một lỗi
         hook cũ, và `markdown-lite.tsx` bây giờ kể lại đúng lỗi này. */
      const bodyMask = codeMask(body);
      let hit = -1;
      for (let i = body.indexOf(`${hook}(`); i >= 0; i = body.indexOf(`${hook}(`, i + 1)) {
        if (bodyMask[i] && !/[\w$.]/.test(body[i - 1] ?? ' ')) { hit = i; break; }
      }
      if (hit < 0) continue;
      problems.push(
        `${path.relative(NATIVE, full)}:${line} — \`${name}()\` gọi \`${hook}()\` nhưng không phải component. ` +
          'Quy tắc hook là quy tắc lúc CHẠY và `tsc` không thấy nó: một hàm thường ' +
          'được gọi trong vòng lặp hoặc trong một nhánh thì số lần gọi hook đổi ' +
          'giữa hai lần vẽ, và React ném. Cho bảng màu (hoặc `styles`) vào bằng THAM SỐ.',
      );
    }
  }
}

if (problems.length) {
  console.log('phạm vi hook CÓ LỖI:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  'phạm vi hook OK — không hàm nào ở phạm vi module gọi hook trừ component ' +
    '(tên viết hoa) và hook (`useXxx`); những hàm còn lại nhận bảng màu qua tham số',
);
