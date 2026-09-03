/**
 * Chuyển một tệp từ bảng màu ĐÓNG BĂNG sang bảng màu đọc lúc chạy.
 *
 *     node tools/theme-migrate.mjs src/app/settings.tsx [--dry]
 *
 * ── vì sao là một công cụ chứ không phải sửa tay ──
 *
 * 111 tệp gọi `StyleSheet.create` ở phạm vi module với `colors.X` bên trong,
 * tức giá trị bị đóng băng lúc import. Phép sửa cho từng tệp là như nhau đến
 * mức nhàm: bỏ `colors` khỏi import, đổi vỏ stylesheet, đổi `colors.` thành
 * `c.`, và cho mỗi component đọc bảng màu.
 *
 * Làm tay 111 lần là 111 cơ hội để lệch một bước — và bước dễ quên nhất
 * (`const styles = stylesFor(c)`) lại là bước mà TypeScript BẮT ĐƯỢC, nên cái
 * đáng sợ không phải nó. Cái đáng sợ là những chỗ công cụ này KHÔNG chạm tới,
 * và đó là lý do nó in ra danh sách ấy thay vì im lặng.
 *
 * ── nó cố ý KHÔNG làm gì ──
 *
 * Không đụng vào mã màu viết thẳng (`'#0e0e11'`, `rgba(24,24,27,0.2)`). Có 596
 * chỗ như thế trong 89 tệp, và mỗi chỗ là một quyết định: mã ấy là một màu bề
 * mặt cần token, hay một lớp phủ trong suốt đúng ở cả hai theme, hay một màu
 * của thương hiệu bên thứ ba. Một công cụ đoán hộ những chuyện đó sẽ sai êm ru.
 * Nó ĐẾM và in ra để người sửa biết còn nợ gì.
 *
 * Không đụng vào `glass.*` — bề mặt kính là CHẤT LIỆU, không phải màu, và nó
 * cần `makeMaterialStyles` cùng một quyết định thiết kế riêng cho từng chỗ
 * (xem `Material` trong `constants/theme.ts`).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { codeMask } from './lib/code-mask.mjs';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Thay `colors.` bằng `c.` — chỉ ở những ký tự mà `codeMask` gọi là mã. */
function replaceInCode(src, from, to) {
  const mask = codeMask(src);
  let out = '';
  let i = 0;
  let n = 0;
  while (i < src.length) {
    if (mask[i] && src.startsWith(from, i)) { out += to; i += from.length; n++; continue; }
    out += src[i];
    i++;
  }
  return { out, n };
}

/** Bỏ `colors` khỏi import của `constants/ascnd`, thêm import của theme. */
function fixImports(src) {
  const re = /import \{([^}]*)\} from '@\/constants\/ascnd';/;
  const m = re.exec(src);
  if (!m) return { src, ok: false, why: "không có import từ '@/constants/ascnd'" };
  const kept = m[1]
    .split(',')
    .map((x) => x.trim())
    .filter((x) => x && x !== 'colors');
  const line = kept.length ? `import { ${kept.join(', ')} } from '@/constants/ascnd';\n` : '';
  return {
    src: src.replace(
      re,
      `${line}import { makeStyles } from '@/constants/theme';\nimport { usePalette } from '@/hooks/use-palette';`,
    ),
    ok: true,
  };
}

/** `const styles = StyleSheet.create({ … });` → `const stylesFor = makeStyles((c) => ({ … }));` */
function fixSheet(src) {
  const open = 'const styles = StyleSheet.create({';
  const i = src.indexOf(open);
  if (i < 0) return { src, ok: false, why: 'không tìm thấy `const styles = StyleSheet.create({`' };

  /* Tìm dấu đóng bằng cách ĐẾM NGOẶC từ chỗ mở, không bằng regex bám cuối tệp:
     nhiều tệp còn mã sau stylesheet, và một regex neo ở `$` sẽ ăn cả phần ấy. */
  let depth = 0;
  let end = -1;
  for (let k = i + open.length - 1; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') {
      depth--;
      if (depth === 0) { end = k; break; }
    }
  }
  if (end < 0) return { src, ok: false, why: 'không khớp được ngoặc của stylesheet' };
  const tail = src.slice(end);
  if (!tail.startsWith('});')) return { src, ok: false, why: 'stylesheet không kết thúc bằng `});`' };

  return {
    src:
      src.slice(0, i) +
      'const stylesFor = makeStyles((c) => ({' +
      src.slice(i + open.length, end) +
      '}));' +
      tail.slice(3),
    ok: true,
  };
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

/**
 * Từ sau `)` của danh sách tham số, tìm `{` MỞ THÂN HÀM — hoặc −1 nếu không có.
 *
 * ── kiểu trả về không được nuốt mất dấu ngoặc thân hàm ──
 *
 * Bản đầu dùng regex `(?::\s*[^{]+)?` cho phần kiểu trả về, và nó khớp với
 *
 *     function weightDiffTone(bmi, diff): {
 *       color: string; bg: string } {
 *
 * — dấu `{` MỞ KIỂU bị đọc là dấu mở thân hàm, nên hai dòng đọc bảng màu bị
 * chèn vào GIỮA một annotation. Lần ấy `tsc` bắt được; nhưng một lần chèn nhầm
 * rơi vào chỗ vẫn phân tích được thì sẽ không ai thấy.
 *
 * Nên `{` ngay sau dấu `:` bị TỪ CHỐI: đó là kiểu đối tượng viết thẳng, và hàm
 * ấy để người sửa tay. Với arrow function, phải thấy `=>` trước đã — `{` trước
 * `=>` cũng chỉ có thể là một kiểu.
 */
function bodyBrace(src, mask, afterParen, isArrow) {
  let needArrow = isArrow;
  let prev = null;
  for (let k = afterParen + 1; k < src.length; k++) {
    if (!mask[k]) continue;
    const ch = src[k];
    if (/\s/.test(ch)) continue;
    if (needArrow && src.startsWith('=>', k)) { needArrow = false; k++; prev = null; continue; }
    if (ch === '{') return needArrow || prev === ':' ? -1 : k;
    if (ch === ':') { prev = ':'; continue; }
    if (/[A-Za-z0-9_$.<>[\]|&,]/.test(ch)) { prev = 'n'; continue; }
    return -1;
  }
  return -1;
}

/**
 * Chèn hai dòng đọc bảng màu vào mỗi COMPONENT có dùng `styles.` hoặc `c.`.
 *
 * Chỉ nhận diện hàm ở PHẠM VI MODULE (không thụt lề), vì một hàm lồng trong hàm
 * khác đã có `c` của hàm ngoài và chèn thêm sẽ là khai báo trùng.
 *
 * ── và chỉ COMPONENT, chứ không phải mọi hàm ──
 *
 * `usePalette()` là một hook: gọi nó trong một hàm thường là một lỗi mà
 * TypeScript không thấy. `weightDiffTone(bmi, diff)` trong `today-widgets.tsx`
 * đúng là dùng màu, và nó được gọi bên trong một `.map()` — chèn hook vào đó sẽ
 * biên dịch được và hỏng lúc chạy.
 *
 * Nên: tên viết hoa (quy ước component của React) hoặc `useXxx`. Những hàm còn
 * lại được LIỆT KÊ ra để người sửa tay — thường là nhận bảng màu qua tham số.
 */
function fixComponents(src) {
  const mask = codeMask(src);
  /*
    Ba hình dạng khai báo, và cái thứ ba là một chỗ mù đã có thật.

    `weight-goal-ruler.tsx` viết `export const Ruler = memo(function Ruler({…`.
    Hai nhánh đầu không khớp nó: nhánh `function` đòi `function` ở ĐẦU DÒNG,
    nhánh `const` đòi `(` ngay sau `=`. Nên component ấy trượt qua công cụ mà
    không có một dòng nào nói rằng nó đã trượt — `tsc` mới là chỗ nó lộ ra.

    `export` cũng được nới cho nhánh `const`: hôm nay repo không có
    `export const Foo = (…) => {}`, nhưng "hôm nay không có" không phải một lý do
    để công cụ mù với nó.
  */
  const heads =
    /^(?:export\s+default\s+function|export\s+function|function)\s+(\w+)\s*(?:<[^>]*>)?\s*\(|^(?:export\s+)?const\s+(\w+)\s*=\s*(?:<[^>]*>)?\s*\(|^(?:export\s+)?const\s+(\w+)\s*=\s*(?:React\.)?memo\(\s*function\s+\w*\s*(?:<[^>]*>)?\s*\(/gm;

  const edits = [];
  const touched = [];
  const manual = [];
  const shadowed = [];
  for (let m; (m = heads.exec(src)); ) {
    if (!mask[m.index]) continue;
    const name = m[1] ?? m[2] ?? m[3];
    /* Chỉ nhánh thứ hai là arrow function; nhánh `memo(function …)` là hàm
       thường, và đòi `=>` ở đó sẽ làm `bodyBrace` trả về −1. */
    const isArrow = m[2] != null;
    const openParen = src.lastIndexOf('(', heads.lastIndex);
    const closeParen = matchPair(src, mask, openParen, '(', ')');
    if (closeParen < 0) continue;
    const open = bodyBrace(src, mask, closeParen, isArrow);
    if (open < 0) continue;
    const close = matchPair(src, mask, open, '{', '}');
    if (close < 0) continue;

    /*
      Chỉ đếm những lần dùng nằm trong MÃ: `c.` trong một chuỗi ngược không
      phải là một lần dùng mà công cụ này thấy được.

      Và `c[…]` cũng là một lần dùng. Bản đầu chỉ tìm `c.`, nên nó bỏ qua `Bar`
      trong `water-chart.tsx` — nơi màu được tra bằng KHOÁ (`c[BAR_BOTTOM]`),
      đúng hình dạng mà mọi bảng màu ở phạm vi module vừa được chuyển sang. Tức
      là nó mù với chính cách sửa mà đợt này tạo ra.
    */
    let usesStyles = false;
    let usesPalette = false;
    for (let k = open; k < close; k++) {
      if (!mask[k]) continue;
      if (src.startsWith('styles.', k)) usesStyles = true;
      else if (src[k] === 'c' && /[.[]/.test(src[k + 1] ?? '') && !/[\w$.]/.test(src[k - 1] ?? ' ')) {
        if (src[k + 1] === '[' || /[a-zA-Z]/.test(src[k + 2] ?? '')) usesPalette = true;
      }
    }
    if (!usesStyles && !usesPalette) continue;

    const body = src.slice(open, close);
    if (/const styles = stylesFor\(/.test(body) || /usePalette\(\)/.test(body)) continue;
    if (!/^[A-Z]/.test(name) && !/^use[A-Z]/.test(name)) { manual.push(name); continue; }

    /*
      `c` có thể ĐÃ CÓ CHỦ trong chính component này.

      `Macros({ p, c, f })` trong `food-cards.tsx` — `c` là carbs. `CollectionRow({ c })`
      trong `shop-grid.tsx` — `c` là một Collection. Chèn `const c = usePalette()`
      vào đó tạo ra một khai báo trùng, và trước đó bước `colors.` → `c.` đã
      lặng lẽ trỏ những chỗ dùng màu vào biến của người ta.

      Bản trước của công cụ này chèn bừa và để `tsc` la làng. Nhưng `tsc` chỉ la
      khi hai bên khác KIỂU — một tham số `c` tình cờ có đủ khoá màu sẽ biên
      dịch trót lọt. Nên đây là chỗ phải TỪ CHỐI, không phải chỗ để dựa vào lưới.
    */
    if (/(^|[^\w$.])c\s*[,:}\])]/.test(src.slice(openParen, closeParen + 1))) {
      shadowed.push(name);
      continue;
    }

    const lines = [];
    if (usesPalette || usesStyles) lines.push('  const c = usePalette();');
    if (usesStyles) lines.push('  const styles = stylesFor(c);');
    edits.push({ at: open + 1, text: `\n${lines.join('\n')}` });
    touched.push(name);
  }

  /* Chèn từ cuối về đầu, để mỗi vị trí đã tính vẫn còn đúng. */
  let out = src;
  for (const e of edits.sort((a, b) => b.at - a.at)) out = out.slice(0, e.at) + e.text + out.slice(e.at);
  return { src: out, touched, manual, shadowed };
}

const rel = process.argv[2];
const dry = process.argv.includes('--dry');
if (!rel) {
  console.log('dùng: node tools/theme-migrate.mjs <đường-dẫn-tệp> [--dry]');
  process.exit(2);
}
const abs = path.join(NATIVE, rel);
let src = readFileSync(abs, 'utf8');

/*
  Một tệp đã chuyển vẫn có thể còn component BỊ BỎ SÓT.

  Bản đầu của `fixComponents` đòi danh sách tham số nằm gọn trên một dòng và
  không chứa `)`. Ở repo này phần lớn component phụ khai báo kiểu props ngay tại
  chỗ, nhiều dòng, có cả `onPress: () => void` bên trong — nên nó trượt hàng
  loạt, và lần chạy đầu để lại 784 lỗi kiểu chứ không phải 25.

  Vậy nên "đã chuyển rồi" KHÔNG còn là lý do để không làm gì: bước chèn hook
  chạy lại được, và nó tự bỏ qua component nào đã có `stylesFor(`.
*/
const already = /makeStyles\(/.test(src);
const notes = [];
let hits = 0;
if (!already) {
  for (const step of [fixImports, fixSheet]) {
    const r = step(src);
    if (!r.ok) { console.log(`${rel}: DỪNG — ${r.why}`); process.exit(1); }
    src = r.src;
  }
  /* `colors.` → `c.` sau khi vỏ stylesheet đã đổi, và CHỈ trong mã. */
  const rep = replaceInCode(src, 'colors.', 'c.');
  hits = rep.n;
  src = rep.out;
}
const { src: withHooks, touched, manual, shadowed } = fixComponents(src);
src = withHooks;
/*
  Hai lý do bỏ qua, và chúng KHÁC nhau — gộp làm một thì lời báo nói sai.

  `Macros` và `CollectionRow` LÀ component; vấn đề của chúng là `c` đã có chủ.
  `weightDiffTone` thì ngược lại: nó không phải component ở bất cứ nghĩa nào.
  Cách sửa cũng khác — một bên đổi tên, bên kia thêm tham số.
*/
if (manual.length) {
  notes.push(
    `${manual.length} hàm KHÔNG phải component cũng dùng màu (${manual.join(', ')}) — ` +
      'chúng phải nhận bảng màu qua tham số, không được gọi hook',
  );
}
if (shadowed.length) {
  notes.push(
    `${shadowed.length} component đã có \`c\` của riêng nó (${shadowed.join(', ')}) — ` +
      'đổi tên biến kia trước, rồi chạy lại; chèn bừa vào đó là một khai báo trùng, ' +
      'và bước `colors.` → `c.` đã trỏ những chỗ dùng màu vào biến của người ta',
  );
}

/* ── những gì công cụ KHÔNG chạm, in ra để không ai tưởng là đã xong ── */
const hex = (src.match(/'#[0-9a-fA-F]{3,8}'/g) ?? []).length;
const rgba = (src.match(/rgba\(\s*\d+/g) ?? []).length;
const glassRefs = (src.match(/\bglass\./g) ?? []).length;
if (hex) notes.push(`${hex} mã hex viết thẳng — mỗi cái là một quyết định, công cụ không đoán`);
if (rgba) notes.push(`${rgba} rgba() viết thẳng — xem cái nào là lớp phủ đúng ở cả hai theme`);
if (glassRefs) notes.push(`${glassRefs} chỗ dùng \`glass.*\` — cần \`makeMaterialStyles\`, không phải bảng màu`);

if (!dry) writeFileSync(abs, src);
console.log(
  `${rel}: ${dry ? '(thử)' : 'đã đổi'} ${hits} chỗ \`colors.\` → \`c.\`; ` +
    `đọc bảng màu trong ${touched.length} component (${touched.join(', ') || 'không có'})`,
);
for (const n of notes) console.log(`  ⚠ ${n}`);
console.log('  → chạy `npx tsc --noEmit`: nó bắt mọi component bị bỏ sót');
