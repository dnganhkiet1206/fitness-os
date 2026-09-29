/**
 * `Screen` trao prop cuộn của chỗ gọi cho ScrollView ở CẢ BA bố cục.
 *
 * ── lỗi nó sinh ra để bắt (29/09) ──
 *
 * `onScrollBeginDrag` bị tách khỏi `...props` để nhánh tab gọi nó sau khi thu
 * hàng vuốt — và hai nhánh trang con không bao giờ nhận lại nó. Hai hậu quả
 * thật, đều im lặng:
 *   · `mascot-room` (`back transparentHeader`) truyền `markScrolling` "để đóng
 *     băng Koa ngay khi bắt đầu kéo" — hàm ấy chưa từng chạy từ prop này;
 *   · `/sessions` (`back`, có hàng vuốt): kéo trang không thu hàng đang mở.
 * Chiều ngược lại cũng im lặng: một `onScroll` để trong spread ghi đè lặng lẽ
 * `onScroll` của nhánh tab (thanh tab, dải Koa), vì `{...props}` đứng cuối.
 *
 * ── luật ──
 *
 *   1. `onScroll`, `onScrollBeginDrag` và `overlay` được tách khỏi `...props`
 *      ở chữ ký của `ScreenBody`.
 *   2. MỖI `<ScrollView` của tệp nhận `onScrollBeginDrag={beginDrag}` và gọi
 *      `onScroll` của chỗ gọi — thẳng (`onScroll={onScroll}`) hay trong hàm
 *      của nhánh (`onScroll?.(e)`).
 *   3. `beginDrag` thu hàng vuốt VÀ gọi prop của chỗ gọi.
 *   4. Mỗi nhánh `return` vẽ `{overlay}`.
 * Rồi tự phá: gỡ từng thứ ở một nhánh, luật phải đỏ.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = 'src/components/ascnd/screen.tsx';
const src = readFileSync(path.join(NATIVE, FILE), 'utf8');
/* Chỉ gỡ chú thích khối và dòng; giữ nguyên xuống dòng không cần — luật này
   không báo số dòng. */
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\s*\}/g, '');

function check(text) {
  const s = strip(text);
  const out = [];
  const sig = s.match(/function ScreenBody\(\{([^}]*)\}/)?.[1] ?? '';
  for (const k of ['onScroll', 'onScrollBeginDrag', 'overlay']) {
    if (!new RegExp(`\\b${k}\\b`).test(sig)) out.push(`luật 1: \`${k}\` không được tách khỏi \`...props\` ở chữ ký ScreenBody`);
  }
  const views = [...s.matchAll(/<ScrollView\b([\s\S]*?)\{\.\.\.props\}>/g)].map((m) => m[1]);
  if (views.length !== 3) out.push(`luật 2: mong 3 ScrollView (tab, trang con, trang con nổi), thấy ${views.length} — thêm bố cục thì sửa luật này`);
  views.forEach((v, i) => {
    if (!/onScrollBeginDrag=\{beginDrag\}/.test(v)) out.push(`luật 2: ScrollView thứ ${i + 1} không nhận \`onScrollBeginDrag={beginDrag}\``);
    if (!/onScroll=\{onScroll\}/.test(v) && !/onScroll=\{\(e\) => \{[\s\S]*?onScroll\?\.\(e\);[\s\S]*?\}\}/.test(v)) {
      out.push(`luật 2: ScrollView thứ ${i + 1} không gọi \`onScroll\` của chỗ gọi`);
    }
  });
  const bd = s.match(/const beginDrag[^=]*= \(e\) => \{([\s\S]*?)\};/)?.[1] ?? '';
  if (!/closeOpenSwipeRow\(\)/.test(bd)) out.push('luật 3: `beginDrag` không thu hàng vuốt');
  if (!/onScrollBeginDrag\?\.\(e\)/.test(bd)) out.push('luật 3: `beginDrag` không gọi `onScrollBeginDrag` của chỗ gọi');
  const overlays = (s.match(/\{overlay\}/g) ?? []).length;
  if (overlays !== 3) out.push(`luật 4: \`{overlay}\` được vẽ ở ${overlays}/3 nhánh`);
  return out;
}

const problems = check(src);

/* Tự phá: mỗi bản phải đỏ. */
const MUTANTS = [
  ['nhánh trang con thôi nhận onScrollBeginDrag', (t) => t.replace(/(\n\s*)onScrollBeginDrag=\{beginDrag\}(\n\s*\{\.\.\.props\})/, '$2')],
  ['nhánh trang con thôi nhận onScroll', (t) => t.replace(/\n\s*onScroll=\{onScroll\}/, '')],
  ['nhánh tab thôi gọi onScroll của chỗ gọi', (t) => t.replace(/\n\s*onScroll\?\.\(e\);/, '')],
  ['onScroll để lại trong spread', (t) => t.replace(/refreshable = false, onScroll, /, 'refreshable = false, ')],
  ['beginDrag thôi thu hàng vuốt', (t) => t.replace(/(const beginDrag[\s\S]*?)closeOpenSwipeRow\(\);/, '$1')],
  ['một nhánh không vẽ overlay', (t) => t.replace(/\n\s*\{overlay\}/, '')],
];
for (const [name, mut] of MUTANTS) {
  const t = mut(src);
  if (t === src) {
    console.error(`phép tự kiểm hỏng — bản hỏng "${name}": không sửa được gì, đừng tin kết quả`);
    process.exit(1);
  }
  if (!check(t).length) {
    console.error(`phép tự kiểm hỏng — bản hỏng "${name}" vẫn xanh, đừng tin kết quả`);
    process.exit(1);
  }
}

if (problems.length) {
  console.error(`${FILE}: prop cuộn của Screen CÓ LỖI:\n`);
  for (const p of problems) console.error(`  • ${p}`);
  process.exit(1);
}
console.log(
  'prop cuộn của Screen OK — onScroll/onScrollBeginDrag/overlay tách khỏi ...props, và CẢ BA ScrollView (tab, trang con, ' +
    'trang con nổi) nhận beginDrag (thu hàng vuốt rồi gọi prop của chỗ gọi) và gọi onScroll của chỗ gọi; ba nhánh vẽ ' +
    `overlay. ${MUTANTS.length} bản hỏng đều đỏ`,
);
