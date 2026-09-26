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
 *
 * ── nút gập chưa khai gì (#123) ──
 *
 * Luật `expanded` của #103 chỉ xét chỗ ĐÃ khai `accessibilityState.expanded`.
 * Một nút gập chưa khai thì không có gì để xét, nên nó lọt: hai nút ở
 * `/log-meal` đổi mũi tên khi mở mà VoiceOver không biết (#121). Nên nút gập
 * được NHẬN DIỆN từ hình của nó — một chỗ bấm (không ẩn) mà bên trong, không
 * kể các chỗ bấm lồng, có:
 *   · một mũi tên `Chevron…` đổi theo điều kiện (`x ? ChevronDown : ChevronRight`,
 *     hay `{x ? <Icon icon={ChevronUp} /> : …}`), hoặc
 *   · một mũi tên `Chevron…` nằm trong phần tử có style là một
 *     `useAnimatedStyle` có `rotate` — mũi tên xoay.
 * Nút gập phải mang `accessibilityState.expanded` lẫn `aria-expanded`. Mũi tên
 * cố định (dẫn sang màn khác) không phải nút gập.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { parse } = createRequire(pathToFileURL(path.join(NATIVE, 'package.json')))('@babel/parser');

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

const PRESS = /^(Pressable|PressScale|Touchable[A-Za-z]*)$/;
const CHEVRON = /\bChevron(Down|Up|Right|Left)\b/;
const tagOf = (n) => (n.type === 'JSXIdentifier' ? n.name : n.type === 'JSXMemberExpression' ? `${tagOf(n.object)}.${n.property.name}` : '');
const kids = (node) => Object.keys(node).filter((k) => k !== 'loc' && !k.endsWith('Comments')).map((k) => node[k]);

/** Nút gập thiếu trạng thái (#123): `{ out, n }` trên các tệp `[[tên, mã GỐC]]`. */
export function disclosureProblemsOf(files) {
  const out = [];
  let n = 0;
  for (const [rel, src] of files) {
    const ast = parse(src, { sourceType: 'module', plugins: ['typescript', 'jsx'] });
    const text = (x) => src.slice(x.start, x.end);
    /* Tên các style xoay: `const chevron = useAnimatedStyle(() => ({ transform: [{ rotate: … }] }))`. */
    const rotors = new Set();
    const findRotors = (node) => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) return node.forEach(findRotors);
      if (node.type === 'VariableDeclarator' && node.id?.type === 'Identifier' && node.init?.type === 'CallExpression' &&
        node.init.callee?.name === 'useAnimatedStyle' && /\brotate\b/.test(text(node.init))) rotors.add(node.id.name);
      kids(node).forEach(findRotors);
    };
    findRotors(ast.program);
    /* Phần tử có style xoay mà bên trong là một mũi tên. */
    const spinsChevron = (el) => {
      if (!rotors.size) return false;
      const st = el.openingElement.attributes.find((x) => x.type === 'JSXAttribute' && x.name.name === 'style');
      return !!st?.value && [...rotors].some((r) => new RegExp(`\\b${r}\\b`).test(text(st.value))) && CHEVRON.test(text(el));
    };
    /* Component trong tệp vẽ một mũi tên xoay (`function Chevron({ open })` của
       day-plan): dùng `<Chevron open={…} />` trong một chỗ bấm là nút gập. */
    const spinners = new Set();
    const findSpinners = (node, owner) => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) return node.forEach((x) => findSpinners(x, owner));
      const name = node.type === 'FunctionDeclaration' ? node.id?.name : node.type === 'VariableDeclarator' && /Function/.test(node.init?.type ?? '') ? node.id?.name : null;
      const next = name && /^[A-Z]/.test(name) ? name : owner;
      if (next && node.type === 'JSXElement' && spinsChevron(node)) spinners.add(next);
      kids(node).forEach((x) => findSpinners(x, next));
    };
    findSpinners(ast.program, null);
    /* Bên trong một chỗ bấm, không đi vào chỗ bấm lồng: có mũi tên đổi/xoay không. */
    const discloses = (node, top = true) => {
      if (!node || typeof node !== 'object') return false;
      if (Array.isArray(node)) return node.some((x) => discloses(x, false));
      if (!top && node.type === 'JSXElement' && PRESS.test(tagOf(node.openingElement.name))) return false;
      /* Cả hai nhánh là mũi tên, khác nhau, và ít nhất một cái lên/xuống:
         `dir === 'left' ? ChevronLeft : ChevronRight` là HƯỚNG, không phải
         mở/đóng; `cta ? Plus : ChevronRight` chỉ một nhánh là mũi tên. */
      if (node.type === 'ConditionalExpression') {
        const a = text(node.consequent).match(CHEVRON)?.[0] ?? null;
        const b = text(node.alternate).match(CHEVRON)?.[0] ?? null;
        if (a && b && a !== b && /Down|Up/.test(a + b)) return true;
      }
      if (node.type === 'JSXElement') {
        if (spinners.has(tagOf(node.openingElement.name))) return true;
        if (spinsChevron(node)) return true;
      }
      return kids(node).some((x) => discloses(x, false));
    };
    const visit = (node) => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) return node.forEach(visit);
      if (node.type === 'JSXElement' && PRESS.test(tagOf(node.openingElement.name))) {
        const attrs = new Map(node.openingElement.attributes.filter((x) => x.type === 'JSXAttribute').map((x) => [x.name.name, x.value]));
        const hidden = attrs.has('aria-hidden') || /\bfalse\b/.test(attrs.get('accessible') ? text(attrs.get('accessible')) : '');
        if (!hidden && discloses(node.children)) {
          n++;
          const line = node.loc.start.line;
          const st = attrs.get('accessibilityState');
          if (!st || !/\bexpanded\b/.test(text(st))) out.push(`${rel}:${line}: nút gập (mũi tên đổi hoặc xoay khi mở) mà không có accessibilityState.expanded — VoiceOver không biết khối đã mở (#123)`);
          if (!attrs.has('aria-expanded')) out.push(`${rel}:${line}: nút gập mà không có aria-expanded — trên web khối gập và khối mở đọc y hệt nhau (#123)`);
        }
      }
      kids(node).forEach(visit);
    };
    visit(ast.program);
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
/* Nút gập đọc mã GỐC: Babel cần chú thích nguyên vẹn thì mới chắc parse được. */
const raw = walk(path.join(NATIVE, 'src')).map((p) => [path.relative(NATIVE, p), readFileSync(p, 'utf8')]);
const { out: dOut, n: dN } = disclosureProblemsOf(raw);
problems.push(...dOut);
if (dN < 5) problems.push(`chỉ nhận ra ${dN} nút gập — bộ nhận diện hỏng, đừng tin kết quả`);

/* ── thử ngược ── */
{
  const base = problemsOf(files).out.length;
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
  /* #123: nhận diện nút gập từ hình của nó. */
  const dBase = disclosureProblemsOf(raw).out.length;
  const dProbe = (label, file, from, to) => {
    const i = raw.findIndex(([f]) => f === file);
    if (i < 0 || !raw[i][1].includes(from)) return problems.push(`thử ngược hỏng: "${label}" không áp được`);
    const copy = raw.slice();
    copy[i] = [file, copy[i][1].replace(from, to)];
    if (disclosureProblemsOf(copy).out.length <= dBase) problems.push(`thử ngược hỏng: ${label} mà luật vẫn xanh`);
  };
  dProbe('bỏ expanded ở "AI gợi ý bữa ăn" (mũi tên đổi, #121)', 'src/app/log-meal.tsx', 'accessibilityState={{ expanded: aiOpen }}', '');
  dProbe('bỏ expanded ở nút gập bài của Kế hoạch ngày (mũi tên xoay)', 'src/components/ascnd/day-plan.tsx', 'accessibilityState={{ expanded }}', '');
  const one = (label, src, wantRed) => {
    const red = disclosureProblemsOf([['thử.tsx', src]]).out.length > 0;
    if (red !== wantRed) problems.push(`thử ngược hỏng: ${label} — luật ${red ? 'đỏ' : 'xanh'}, phải ${wantRed ? 'đỏ' : 'xanh'}`);
  };
  one('mũi tên cố định (dẫn sang màn khác)', 'const a = <PressScale onPress={go}><Text>Cài đặt</Text><Icon icon={ChevronRight} /></PressScale>;', false);
  one('mũi tên đổi theo điều kiện, không khai gì', 'const b = <PressScale onPress={t}><Icon icon={open ? ChevronUp : ChevronDown} /></PressScale>;', true);
  one('mũi tên đổi nằm trong một chỗ bấm LỒNG', 'const c = <PressScale onPress={t} accessible={false}><Pressable onPress={u} accessibilityState={{ expanded: open }} aria-expanded={open}><Icon icon={open ? ChevronUp : ChevronDown} /></Pressable></PressScale>;', false);
}

if (problems.length) {
  console.log('ô chọn không nói trạng thái:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}
console.log(
  `trạng thái ô chọn OK — ${dN} nút gập nhận ra từ mũi tên đổi/xoay đều khai expanded lẫn aria-expanded (#123; thử ngược: bỏ expanded ở một nút mũi tên đổi và một nút mũi tên xoay thì đỏ, mũi tên cố định thì xanh); ${n} phần tử role tab/checkbox/switch/radio trong src/: tab mang accessibilityState.selected (iOS) lẫn aria-selected, ô tick mang checked lẫn aria-checked (#101), khối gập mang aria-expanded (#103) ` +
    '(web, nơi react-native-web không dịch accessibilityState — bảy ô ngày của Kế hoạch ngày từng rỗng cả bảy, kể cả ô đang ' +
    'mở; sáu ô tick set cũng rỗng aria-checked). Thử ngược: bỏ aria-selected ở hàng ngày, bỏ accessibilityState ở PickRow, bỏ aria-checked ở ô tick set, bỏ accessibilityState ở công tắc khởi động, bỏ aria-expanded ở nút gập bài — mỗi cái đỏ',
);
