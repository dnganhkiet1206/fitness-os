/**
 * Mọi ô `accessibilityRole="tab"` nói nó có ĐANG được chọn không — trên cả hai nền (#99).
 *
 * ── vì sao hai thuộc tính cho một trạng thái ──
 *
 * iOS đọc `accessibilityState={{ selected }}`. react-native-web thì KHÔNG dịch
 * nó ra `aria-selected` — `pick-row.tsx` đã đo điều ấy và thêm `aria-selected`,
 * nhưng bốn chỗ khác dùng `role="tab"` (hàng ngày trong tuần, thanh tab, màn
 * hướng dẫn đầu, ngày của kế hoạch ăn) thì chưa. Đo ở #58/#99: bảy ô ngày của
 * Kế hoạch ngày đều ra `aria-selected` rỗng, kể cả ô đang mở. Hệ quả kép: trên
 * web mọi ô đọc lên y hệt nhau, và lượt quét của `live.mjs` — bấm các ô mang
 * `aria-selected="false"` — không bao giờ bấm qua các ngày, nên lỗi #72 (kẹt khi
 * đổi ngày) chỉ bắt được bằng một đầu dò viết tay.
 *
 * `aria-selected` là bí danh chính thức của React Native (từ 0.71) và được ưu
 * tiên trên native, nên có cả hai là đúng ở cả hai nền.
 *
 * ── luật ──
 *
 * Trong `src/`, mỗi phần tử JSX mang `accessibilityRole="tab"` phải mang cả
 * `accessibilityState={{ … selected … }}` lẫn `aria-selected={…}`.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (f.endsWith('.tsx')) out.push(p);
  }
  return out;
}

/** Mọi phần tử có role tab trong một tệp: `[{ line, props }]` — `props` là phần mở thẻ, từ `<Tên` tới thẻ JSX kế tiếp. */
export function tabElements(src, role = 'tab') {
  const out = [];
  for (const m of src.matchAll(new RegExp(`accessibilityRole="${role}"`, 'g'))) {
    const before = src.slice(0, m.index);
    const open = Math.max(...[...before.matchAll(/<[A-Z][\w.]*\s/g)].map((x) => x.index), -1);
    if (open < 0) continue;
    const next = src.slice(m.index).search(/<[A-Za-z/{]/);
    const props = src.slice(open, next < 0 ? src.length : m.index + next);
    out.push({ line: before.split('\n').length, props, role: m[0].slice(19, -1) });
  }
  return out;
}

export function problemsOf(files) {
  const out = [];
  let n = 0;
  for (const [rel, src] of files) {
    for (const { line, props } of tabElements(src)) {
      n++;
      if (!/accessibilityState=\{\{[^}]*\bselected\b/.test(props)) out.push(`${rel}:${line}: role="tab" mà không có accessibilityState.selected — iOS không biết ô nào đang chọn`);
      if (!/\baria-selected=\{/.test(props)) out.push(`${rel}:${line}: role="tab" mà không có aria-selected — react-native-web không dịch accessibilityState, nên trên web ô này đọc như mọi ô khác và live.mjs không bấm qua nó`);
    }
    /* #101: cùng lỗ, cho trạng thái "đã tick". Radio được đọc trạng thái bằng
       `selected` hay `checked` trên iOS; trên web chỉ `aria-checked` có nghĩa. */
    for (const { line, props, role } of tabElements(src, '(?:checkbox|switch|radio)')) {
      n++;
      const iosState = role === 'radio' ? /accessibilityState=\{\{[^}]*\b(selected|checked)\b/ : /accessibilityState=\{\{[^}]*\bchecked\b/;
      if (!iosState.test(props)) out.push(`${rel}:${line}: role="${role}" mà không có accessibilityState.${role === 'radio' ? 'selected/checked' : 'checked'} — iOS không biết ô đã tick chưa`);
      if (!/\baria-checked=\{/.test(props)) out.push(`${rel}:${line}: role="${role}" mà không có aria-checked — trên web ô đã tick và chưa tick đọc y hệt nhau`);
    }
    /* #103: `expanded` cũng không ra ARIA (đo: nút gập bài ở Kế hoạch ngày có
       aria-expanded rỗng). `disabled` thì RA — react-native-web dịch nó qua
       prop `disabled` — nên không xét ở đây. */
    for (const m of src.matchAll(/accessibilityState=\{\{[^}]*\bexpanded\b/g)) {
      n++;
      const before = src.slice(0, m.index);
      const open = Math.max(...[...before.matchAll(/<[A-Z][\w.]*\s/g)].map((x) => x.index), -1);
      const next = src.slice(m.index).search(/<[A-Za-z/{]/);
      const props = src.slice(open, next < 0 ? src.length : m.index + next);
      if (!/\baria-expanded=\{/.test(props)) out.push(`${rel}:${before.split('\n').length}: accessibilityState.expanded mà không có aria-expanded — trên web khối gập và khối mở đọc y hệt nhau (#103)`);
    }
  }
  return { out, n };
}

/* Bỏ chú thích, giữ số dòng: một câu chú thích NHẮC `accessibilityRole="tab"`
   không phải một ô, và chú thích trong props của PickRow chứa đúng chữ
   `accessibilityState={{ selected }}` — bản đầu vì thế cho PickRow qua dù đã bỏ
   thuộc tính thật (phép thử ngược bắt được). */
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:])\/\/.*$/gm, '$1');
const files = walk(path.join(NATIVE, 'src')).map((p) => [path.relative(NATIVE, p), strip(readFileSync(p, 'utf8'))]);
const { out: problems, n } = problemsOf(files);
if (n < 20) problems.push(`chỉ tìm thấy ${n} ô chọn — bộ quét hỏng, đừng tin kết quả`);

/* ── thử ngược ── */
{
  const base = problems.length;
  const probe = (label, file, from, to) => {
    const i = files.findIndex(([f]) => f === file);
    if (i < 0 || !files[i][1].includes(from)) return problems.push(`thử ngược hỏng: "${label}" không áp được`);
    const copy = files.slice();
    copy[i] = [file, copy[i][1].replace(from, to)];
    if (problemsOf(copy).out.length <= base) problems.push(`thử ngược hỏng: ${label} mà luật vẫn xanh`);
  };
  probe('bỏ aria-selected ở hàng ngày trong tuần', 'src/components/ascnd/week-strip.tsx', 'aria-selected={isOpen}', '');
  probe('bỏ accessibilityState ở PickRow', 'src/components/ascnd/pick-row.tsx', 'accessibilityState={{ selected: on, disabled }}', '');
  probe('bỏ aria-checked ở ô tick set (#101)', 'src/components/ascnd/day-plan.tsx', 'aria-checked={isDone}', '');
  probe('bỏ accessibilityState ở công tắc khởi động (#101)', 'src/app/log-workout.tsx', 'accessibilityState={{ checked: s.warmup }}', '');
  probe('bỏ aria-expanded ở nút gập bài (#103)', 'src/components/ascnd/day-plan.tsx', 'aria-expanded={expanded}', '');
}

if (problems.length) {
  console.log('ô chọn không nói trạng thái:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}
console.log(
  `trạng thái ô chọn OK — ${n} phần tử role tab/checkbox/switch/radio trong src/: tab mang accessibilityState.selected (iOS) lẫn aria-selected, ô tick mang checked lẫn aria-checked (#101), khối gập mang aria-expanded (#103) ` +
    '(web, nơi react-native-web không dịch accessibilityState — bảy ô ngày của Kế hoạch ngày từng rỗng cả bảy, kể cả ô đang ' +
    'mở; sáu ô tick set cũng rỗng aria-checked). Thử ngược: bỏ aria-selected ở hàng ngày, bỏ accessibilityState ở PickRow, bỏ aria-checked ở ô tick set, bỏ accessibilityState ở công tắc khởi động, bỏ aria-expanded ở nút gập bài — mỗi cái đỏ',
);
