/**
 * Không bề mặt nào được ĐÓNG BĂNG ở một theme.
 *
 *     node tools/frozen-surface.mjs
 *
 * ── lỗi nó bắt được, và đã bắt được thật ──
 *
 * `constants/ascnd.ts` từng xuất một hằng `glass` — công thức bề mặt của bản
 * TỐI, đọc ở phạm vi module, tức đóng băng lúc import:
 *
 *     glass = { bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.12)', … }
 *
 * 25 tệp vẽ ô con bằng nó. Trên giấy #f7f4ef, một lớp phủ trắng 6% composite ra
 * #f7f5f0 — tương phản **1,007:1** với chính trang. Tức là 97 chỗ trong app vẽ
 * ra những cái ô KHÔNG TỒN TẠI, và viền của chúng ở 1,009:1 cũng vậy.
 *
 * Không phép kiểm nào thấy điều đó: `tsc` xanh (một chuỗi là một chuỗi),
 * `tools/palette.mjs` chỉ soi `StyleSheet.create` ở phạm vi module, và bản tối
 * — nơi mọi ảnh chụp được xem — đúng hoàn toàn.
 *
 * ── luật ──
 *
 * Hai vế, và vế thứ hai mới là vế khó bỏ qua:
 *
 *  1. `constants/ascnd.ts` không được xuất lại một công thức bề mặt nào. Nó
 *     import `darkPalette` — nên MỌI mã màu viết ở đó là một mã màu của bản
 *     tối, dù tên biến có nói gì.
 *
 *  2. Không tệp nào ngoài `constants/palette.ts` được viết một lớp phủ
 *     trắng/đen ở phạm vi module RỒI dùng nó làm nền hay viền. Đó chính là
 *     hình dạng của `glass` cũ, chỉ đổi tên.
 *
 * Vai mà `glass` từng giữ nay là `Material.inset`, đọc lúc chạy qua
 * `makeStyles((c, m) => …)`. Bản tối giữ nguyên ba giá trị cũ từng ký tự.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { codeMask } from './lib/code-mask.mjs';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(NATIVE, p), 'utf8');

/**
 * Tệp được phép giữ mã màu bề mặt ở phạm vi module.
 *
 * Chỉ một: bảng chất liệu là NƠI những giá trị ấy phải sống. Danh sách này cố
 * ý ngắn — mỗi tên thêm vào là một chỗ nữa để một theme đóng băng.
 */
const HOME = 'src/constants/palette.ts';

/** Trường của một bề mặt: thứ mà một lớp phủ được gán vào. */
const SURFACE_FIELD = /\b(backgroundColor|borderColor|stopColor|fill|shadowColor|trackColor|tintColor)\b/;

function tsFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) tsFiles(full, out);
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

const problems = [];

/* ── 1. `ascnd.ts` không được xuất một công thức bề mặt ────────────────────
   Nó import `darkPalette`, nên bất cứ hằng bề mặt nào ở đó là của bản tối. */
const ascnd = read('src/constants/ascnd.ts');
const ascndMask = codeMask(ascnd);
for (const m of ascnd.matchAll(/export const (\w+)\s*=\s*\{/g)) {
  if (!ascndMask[m.index]) continue;
  const open = ascnd.indexOf('{', m.index);
  let depth = 0;
  let end = -1;
  for (let k = open; k < ascnd.length; k++) {
    if (!ascndMask[k]) continue;
    if (ascnd[k] === '{') depth++;
    else if (ascnd[k] === '}') { depth--; if (!depth) { end = k; break; } }
  }
  const body = ascnd.slice(open, end < 0 ? ascnd.length : end);
  /*
    ── và ở ĐÂY thì KHÔNG lọc bằng `codeMask` ──

    Bản đầu của luật này viết `if (bodyMask[i])` quanh chỗ tìm `rgba(`, và cả
    hai phép thử ngược đều XANH: một mã màu sống BÊN TRONG một chuỗi
    (`'rgba(255,255,255,0.06)'`), tức đúng thứ `codeMask` đánh dấu là KHÔNG
    phải mã. Cái lọc dựng ra để bỏ qua chú thích đã bỏ qua luôn cả thứ cần bắt.

    Phần cần lọc là chỗ KHAI BÁO (`export const … = {` phải là mã thật, không
    phải một ví dụ trong chú thích) — và chỗ ấy đã được lọc ở trên. Trong thân
    thì tìm trên văn bản thô.
  */
  if (/rgba\(/.test(body)) {
    problems.push(
      `src/constants/ascnd.ts: \`${m[1]}\` giữ một lớp phủ rgba() ở phạm vi module — ` +
        'tệp này đọc `darkPalette`, nên đó là một bề mặt của bản TỐI đóng băng lúc import. ' +
        'Công thức bề mặt thuộc về `Material` trong `constants/palette.ts`',
    );
  }
}

/* ── 2. không tệp nào dựng lại hình dạng ấy dưới một cái tên khác ────────── */
for (const full of tsFiles(path.join(NATIVE, 'src'))) {
  const rel = path.relative(NATIVE, full);
  if (rel === HOME) continue;
  const src = readFileSync(full, 'utf8');
  const mask = codeMask(src);

  /* Hằng ở phạm vi module (cột 0) giữ một lớp phủ trắng/đen thuần. */
  for (const m of src.matchAll(/^const (\w+)\s*=\s*'(rgba\((?:255,\s*255,\s*255|0,\s*0,\s*0)[^']*\))';/gm)) {
    if (!mask[m.index]) continue;
    /* Chỉ là nợ khi nó THỰC SỰ sơn một bề mặt — một hằng không ai dùng làm nền
       thì không vẽ ra cái ô nào để mà biến mất. */
    const uses = [...src.matchAll(new RegExp(`\\b${m[1]}\\b`, 'g'))].filter((u) => mask[u.index]);
    const paints = uses.some((u) => SURFACE_FIELD.test(src.slice(Math.max(0, u.index - 60), u.index)));
    if (paints) {
      problems.push(
        `${rel}: \`${m[1]} = '${m[2]}'\` ở phạm vi module và được dùng làm bề mặt — ` +
          'một lớp phủ trắng/đen đóng băng đúng như hằng `glass` cũ: trên nền ngược lại ' +
          'nó không vẽ ra gì. Cho nó vào `Material` rồi đọc qua `makeStyles((c, m) => …)`',
      );
    }
  }
}

if (problems.length) {
  console.log('bề mặt đóng băng CÓ LỖI:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  'bề mặt đóng băng OK — `constants/ascnd.ts` không còn xuất công thức bề mặt nào ' +
    '(hằng `glass` đã bị bỏ, vai của nó là `Material.inset`), và không tệp nào dựng lại ' +
    'hình dạng ấy: một lớp phủ trắng/đen ở phạm vi module đem đi sơn một bề mặt',
);
