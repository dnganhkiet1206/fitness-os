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

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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

/**
 * Chèn hai dòng đọc bảng màu vào mỗi component có dùng `styles` hoặc `c.`.
 *
 * Chỉ nhận diện component ở PHẠM VI MODULE (không thụt lề), vì một hàm lồng
 * trong hàm khác đã có `c` của hàm ngoài và chèn thêm sẽ là khai báo trùng.
 */
function fixComponents(src) {
  const heads = [
    /^(export default function \w+\([^)]*\)(?::\s*[^{]+)?\s*\{)/gm,
    /^(export function \w+\([^)]*\)(?::\s*[^{]+)?\s*\{)/gm,
    /^(function \w+\([^)]*\)(?::\s*[^{]+)?\s*\{)/gm,
  ];
  const touched = [];
  let out = src;
  for (const re of heads) {
    out = out.replace(re, (whole, head, offset, whole2) => {
      /* Thân hàm = từ đây tới hàm cấp module tiếp theo. Đủ để biết nó có dùng
         `styles` hay không; không cần phân tích cú pháp đầy đủ. */
      const rest = whole2.slice(offset + head.length);
      const stop = rest.search(/^\}/m);
      const body = stop < 0 ? rest : rest.slice(0, stop);
      if (!/\bstyles\./.test(body) && !/\bc\.[a-zA-Z]/.test(body)) return whole;
      if (/const styles = stylesFor\(/.test(body)) return whole;
      touched.push(/function (\w+)/.exec(head)[1]);
      return `${head}\n  const c = usePalette();\n  const styles = stylesFor(c);`;
    });
  }
  return { src: out, touched };
}

const rel = process.argv[2];
const dry = process.argv.includes('--dry');
if (!rel) {
  console.log('dùng: node tools/theme-migrate.mjs <đường-dẫn-tệp> [--dry]');
  process.exit(2);
}
const abs = path.join(NATIVE, rel);
let src = readFileSync(abs, 'utf8');

if (/makeStyles\(/.test(src)) {
  console.log(`${rel}: đã chuyển rồi (có \`makeStyles\`) — không làm gì`);
  process.exit(0);
}

const notes = [];
for (const step of [fixImports, fixSheet]) {
  const r = step(src);
  if (!r.ok) { console.log(`${rel}: DỪNG — ${r.why}`); process.exit(1); }
  src = r.src;
}
/* `colors.` → `c.` sau khi vỏ stylesheet đã đổi, để không đổi trong chuỗi import. */
const hits = (src.match(/\bcolors\./g) ?? []).length;
src = src.replace(/\bcolors\./g, 'c.');
const { src: withHooks, touched } = fixComponents(src);
src = withHooks;

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
