/**
 * Một KHOÁ bảng màu không bao giờ được dùng ở chỗ cần một MÀU.
 *
 *     node tools/palette-key.mjs
 *
 * ── lỗi nó bắt được, và đã bắt được thật ──
 *
 * Đợt sửa hạ tầng Giai đoạn 1 chuyển bảy bảng tint từ mã màu sang khoá bảng
 * màu, để mỗi theme tự trả lời. `iconTint()` do đó trả về `'readinessRed'` chứ
 * không còn `'#ff3b5c'`. Nhưng `(tabs)/index.tsx` vẫn cất thứ nó trả về rồi
 * đưa thẳng vào `alpha(tint, 0.12)`.
 *
 * `npx tsc` XANH: một khoá cũng là một `string`, và `alpha()` nhận `string`.
 * Không một luật nào trong repo thấy được. Thứ bắt được nó là `tools/live.mjs`
 * — nó khởi động app thật trong trình duyệt và màn Hôm nay ra TRẮNG TRƠN, vì
 * `alpha()` NÉM thay vì đoán:
 *
 *     alpha() cần #rgb hoặc #rrggbb, nhận "readinessRed"
 *
 * Một lần khởi động app là một cái lưới đắt và chậm. Đây là cái lưới rẻ.
 *
 * ── luật ──
 *
 * Tham số đầu của `alpha()` phải là một MÀU, và chỉ có bốn hình dạng là màu:
 *
 *   `c.foreground`      một token đọc thẳng
 *   `c[KEY]`            một token tra bằng khoá — tức khoá ĐÃ được giải
 *   `m.ink`, `m.aura.…` một trường của chất liệu
 *   `'#rrggbb'`         một mã màu viết thẳng
 *
 * Cộng với một biến cục bộ được gán từ một trong bốn thứ trên. Mọi thứ khác là
 * một câu hỏi mở, và một câu hỏi mở ở đây có giá là một màn hình trắng.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { codeMask } from './lib/code-mask.mjs';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Năm hình dạng là một màu thật.
 *
 * `c[…]` phải cho phép ngoặc LỒNG: `c[EFFORT_TINT[effort]]` là một khoá đã
 * giải, và một lớp `[^\]]+` từ chối đúng nó — bản đầu của luật này báo đỏ ba
 * chỗ hoàn toàn đúng vì thế.
 *
 * `graphicOf(c, KHOÁ)` là hình dạng thứ NĂM, thêm ở GĐ2C.3. Nó GIẢI khoá —
 * thân nó là `c[GRAPHIC_ROLE[k] ?? k]`, tức đúng hình dạng thứ hai ở trên — nên
 * thứ nó trả về là một mã màu, không phải một khoá. Luật này báo đỏ nó ở lần
 * chạy đầu tiên sau khi hàm ấy ra đời, và đó là một BÁO THỪA: đúng câu hỏi,
 * sai câu trả lời, vì danh sách này liệt kê hình dạng chứ không đọc kiểu.
 *
 * Nó được thêm vào đây chứ không được cho qua bằng một ngoại lệ theo tên tệp:
 * điều làm nó an toàn là thân hàm, và thân hàm ấy đứng cạnh `alpha()` trong
 * cùng một tệp — nếu ai đó đổi nó thành trả về khoá, `tools/yellow-role.mjs`
 * đỏ vì `GRAPHIC_ROLE` không còn nối đúng, và bảng màu sẽ ném ngay ở chỗ vẽ.
 */
const IS_COLOUR =
  /^(?:c\.\w+|c\[.+\]|graphicOf\(c,\s*.+\)|m(?:\.\w+)+|'#[0-9a-fA-F]{3,8}'|`#[^`]*`)$/;

function tsFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) tsFiles(full, out);
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

/** Đọc tham số đầu của một lời gọi bắt đầu tại `open` (chỉ số của `(`). */
function firstArg(src, mask, open) {
  let depth = 0;
  for (let k = open; k < src.length; k++) {
    if (!mask[k]) continue;
    const ch = src[k];
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') { depth--; if (!depth) return src.slice(open + 1, k).trim(); }
    else if (ch === ',' && depth === 1) return src.slice(open + 1, k).trim();
  }
  return null;
}

const problems = [];
for (const full of tsFiles(path.join(NATIVE, 'src'))) {
  const rel = path.relative(NATIVE, full);
  if (rel === 'src/constants/palette.ts') continue; // nơi `alpha` được định nghĩa
  const src = readFileSync(full, 'utf8');
  const mask = codeMask(src);

  for (let i = src.indexOf('alpha('); i >= 0; i = src.indexOf('alpha(', i + 1)) {
    if (!mask[i]) continue;
    if (/[\w$.]/.test(src[i - 1] ?? ' ')) continue; // `…Alpha(`, không phải `alpha(`
    const arg = firstArg(src, mask, i + 5);
    if (arg == null || IS_COLOUR.test(arg)) continue;

    /* Một tên cục bộ: truy ngược đúng một bước tới chỗ gán nó. Không phải một
       trình phân tích luồng dữ liệu — một bước là đủ cho hình dạng thật ở đây,
       và cái gì không truy được thì BỊ BÁO chứ không được cho qua. */
    if (/^[A-Za-z_$][\w$]*$/.test(arg)) {
      /* Chỗ gán GẦN NHẤT TRƯỚC lời gọi, không phải chỗ gán đầu tiên trong tệp.
         `(tabs)/index.tsx` dài 2600 dòng và có nhiều `const tint =`; lấy cái đầu
         tiên là đọc một biến khác cùng tên ở một component khác. */
      const re = new RegExp(`\\b(?:const|let)\\s+${arg}\\s*(?::[^=]+)?=\\s*([^;\\n]+)`, 'g');
      let rhs = '';
      for (let a; (a = re.exec(src)) && a.index < i; ) rhs = a[1].trim();
      /*
        Một biểu thức ba ngôi được chấp nhận khi MỌI NHÁNH của nó là màu.

        Điều kiện KHÔNG phải một nhánh: `meta.color ? c[meta.color] : c.mutedForeground`
        có điều kiện `meta.color`, thứ không phải màu và không cần phải là màu.
        Bản đầu của luật này gộp nó vào danh sách nhánh và báo đỏ một dòng đúng.

        Cắt theo NGOẶC, không theo ký tự: dấu `:` trong `c[meta.color]` không
        phải dấu ngăn nhánh.
      */
      const colourBranches = (expr) => {
        const parts = [];
        let depth = 0;
        let start = 0;
        let seenQ = false;
        for (let k = 0; k < expr.length; k++) {
          const ch = expr[k];
          if ('([{'.includes(ch)) { depth++; continue; }
          if (')]}'.includes(ch)) { depth--; continue; }
          if (depth) continue;
          /*
            `??` KHÔNG phải `?:` — và nhầm hai thứ này làm luật mù đúng lỗi đã ném.

            `meta.color ?? c.mutedForeground` là chính dòng đã làm trắng màn Hôm
            nay: vế TRÁI là cái khoá. Bản đầu của bộ cắt này thấy ký tự `?`, coi
            nó là mở một ba ngôi, rồi VỨT vế trái đi như thể nó là điều kiện —
            nên nó chấm bài trên đúng một nửa không có lỗi và báo xanh.

            Với `??` thì CẢ HAI vế đều là giá trị trả về, nên cả hai phải là màu.
          */
          if (ch === '?' && expr[k + 1] === '?') { parts.push(expr.slice(start, k)); start = k + 2; k++; continue; }
          if (ch === '?') { seenQ = true; parts.push('COND'); start = k + 1; continue; }
          if (ch === ':' && seenQ) { parts.push(expr.slice(start, k)); start = k + 1; }
        }
        parts.push(expr.slice(start));
        /* `COND` là chỗ giữ của điều kiện ba ngôi — nó không phải một nhánh và
           không cần là màu. */
        return parts.map((x) => x.trim()).filter((x) => x && x !== 'COND');
      };
      const branches = colourBranches(rhs);
      if (branches.length && branches.every((b) => IS_COLOUR.test(b))) continue;
    }

    const line = src.slice(0, i).split('\n').length;
    problems.push(
      `${rel}:${line} — \`alpha(${arg.slice(0, 40)}, …)\` không nhận một MÀU. ` +
        'Một khoá bảng màu cũng là một `string`, nên `tsc` cho qua và `alpha()` ném lúc chạy — ' +
        'màn hình trắng trơn. Giải khoá trước: `alpha(c[KHOÁ], …)`',
    );
  }
}

if (problems.length) {
  console.log('khoá bảng màu CÓ LỖI:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  'khoá bảng màu OK — mọi lời gọi `alpha()` nhận một màu thật (`c.x`, `c[khoá]`, ' +
    '`graphicOf(c, khoá)`, một trường chất liệu, hay một mã hex), không nhận một khoá chưa giải',
);
