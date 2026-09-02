/**
 * Chữ không được cùng màu với nền nó nằm trên.
 *
 * ── lỗi nó bắt ──
 *
 * `nutrition.tsx` có nút "Thêm thực phẩm":
 *
 *     addFoodBtn:  { …, backgroundColor: colors.primary }
 *     addFoodText: { …, color: colors.primary }
 *
 * Bạc trên bạc. Nút hiện ra một tấm trống rỗng — không chữ, không icon.
 *
 * Nó xảy ra vì tôi đổi màu CHỮ sang `colors.primary` để biến nút đặc thành một
 * hành động chữ, rồi quên bỏ `backgroundColor`. Cùng họ với `alignItems:
 * 'baseline'` ở thẻ cân nặng, `minWidth` ở ô nhập, và `tierTitle` thiếu
 * `color`: đổi một vế của một cặp rồi quên vế kia.
 *
 * ── vì sao không cửa nào bắt được ──
 *
 * `tsc` xanh: hai màu trùng nhau là style hoàn toàn hợp lệ.
 * Guard xanh: không luật nào cấm chữ cùng màu nền.
 * `text-color.mjs` xanh: chữ CÓ màu, chỉ là màu ấy vô dụng ở đó.
 *
 * Chỉ ảnh chụp bắt được, và đó là lần thứ ba trong một phiên.
 *
 * ── cách nó tìm ──
 *
 * So CHUỖI biểu thức, không so giá trị màu đã tính. `colors.primary` khớp
 * `colors.primary`; `'#a8afbd'` khớp `'#a8afbd'`. Cố tính ra màu thật thì phải
 * dựng lại cả bảng palette và mọi phép trộn alpha — nhiều việc hơn, và nó
 * KHÔNG bắt thêm được gì cho lỗi thật sự xảy ra, vốn luôn là cùng một token
 * viết ở hai chỗ.
 *
 * Với mỗi `<Text style={styles.B}>`, tìm ngược lên để lấy khối chứa nó gần
 * nhất có `backgroundColor`. Giới hạn cửa sổ tìm ngược, vì một `Text` gần như
 * luôn nằm ngay trong cái nút của nó; tìm xa hơn thì bắt đầu vơ phải những
 * khối không phải cha nó.
 */
import { globSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* Bao xa thì còn tin được là cha con. Một nút với chữ bên trong hiếm khi dài
   hơn chừng này; xa hơn nữa thì khối tìm được nhiều khả năng là anh em, không
   phải cha. */
const WINDOW = 500;

/** `name: { … }` một cấp trong StyleSheet.create. */
function readStyles(src) {
  const at = src.indexOf('StyleSheet.create');
  if (at === -1) return {};
  const out = {};
  for (const m of src.slice(at).matchAll(/(\w+):\s*\{([^{}]*)\}/g)) {
    const [, name, body] = m;
    const color = body.match(/(?:^|[\s,])color:\s*([^,\n]+)/);
    const bg = body.match(/backgroundColor:\s*([^,\n]+)/);
    out[name] = {
      color: color ? color[1].trim().replace(/,$/, '') : null,
      bg: bg ? bg[1].trim().replace(/,$/, '') : null,
    };
  }
  return out;
}

const files = globSync('src/**/*.tsx', { cwd: NATIVE }).map((f) => path.join(NATIVE, f));
const bad = [];

for (const file of files) {
  const src = readFileSync(file, 'utf8');
  const styles = readStyles(src);
  if (!Object.keys(styles).length) continue;

  for (const t of src.matchAll(/<Text[^>]*?style=\{(?:\[)?styles\.(\w+)/g)) {
    const textStyle = styles[t[1]];
    if (!textStyle?.color) continue;

    /* Khối chứa gần nhất CÓ nền, trong cửa sổ tìm ngược. */
    const from = Math.max(0, t.index - WINDOW);
    const before = src.slice(from, t.index);
    let holder = null;
    for (const c of before.matchAll(/style=\{(?:\[)?styles\.(\w+)/g)) {
      if (styles[c[1]]?.bg) holder = c[1];
    }
    if (!holder) continue;

    if (styles[holder].bg === textStyle.color) {
      const line = src.slice(0, t.index).split('\n').length;
      bad.push(
        `${path.relative(NATIVE, file)}:${line}  ${t[1]}.color === ${holder}.backgroundColor  (${textStyle.color})`,
      );
    }
  }
}

if (bad.length) {
  console.error('chữ cùng màu với nền nó nằm trên:\n');
  for (const b of bad) console.error('  • ' + b);
  console.error('\nHai màu trùng nhau là style hợp lệ, nên tsc không thấy. Trên màn hình');
  console.error('thì chữ biến mất và nút ra một tấm trống rỗng.');
  process.exit(1);
}
console.log('màu chữ/nền OK — không chỗ nào chữ trùng màu với nền chứa nó');
