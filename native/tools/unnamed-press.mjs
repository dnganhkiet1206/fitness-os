/**
 * Mọi chỗ bấm được đều có TÊN cho trình đọc màn hình (#120).
 *
 * ── lỗi này trông như thế nào ──
 *
 * Nút chụp của máy quét món là một vòng tròn trắng: `<PressScale>` bọc một
 * `<View>`, không chữ, không `accessibilityLabel`, không role. Người nhìn thấy
 * thì bấm được. VoiceOver gặp một ô không tên, không vai — người dùng trình
 * đọc màn hình không chụp được món ăn, mà chụp là việc chính của màn ấy. Chuỗi
 * `a11yTakePhoto` ("Chụp ảnh") có sẵn trong `native-strings.ts` từ đầu, chỉ
 * không ai gắn nó vào nút. Nút chụp ảnh tiến độ và nút X của sheet Điều khoản
 * cũng vậy.
 *
 * ── vì sao cổng chưa thấy ──
 *
 * `a11y-swallow.mjs` canh nút lồng trong nút, không canh nút không tên. Lượt
 * quét màn của `live.mjs` không mở camera hay sheet pháp lý. Đo lúc viết: 9 chỗ.
 *
 * ── luật ──
 *
 * Trong `src/**\/*.tsx`, mỗi `<Pressable>`/`<PressScale>`/`<Touchable…>` phải
 * có MỘT trong:
 *   · `accessibilityLabel` / `aria-label` / `…labelledby`;
 *   · chữ con — JSXText, một phần tử `…Text…`, một biểu thức không chứa JSX
 *     (`{label}`), hoặc một component lạ (`<SleepCard>`: có thể vẽ chữ, và
 *     iOS gộp chữ của con thành tên — tĩnh không biết được hơn thế);
 *   · `aria-hidden` (hay `accessible={false}` / `importantForAccessibility=
 *     "no…"`) KÈM `tabIndex={-1}`: cố ý ẩn, như lớp nền "chạm để đóng" khi đã
 *     có nút đóng có nhãn. `tabIndex` vì Pressable của react-native-web bỏ
 *     qua `accessible` và luôn đặt tabindex=0 — con linh vật "đã ẩn" trên Hôm
 *     nay vẫn là một điểm dừng Tab không tên (đo bằng DOM thật).
 * Chỉ `View`/`Image`/`Icon`/SVG… thì KHÔNG phải chữ. Một phần tử có spread
 * (`{...rest}`) không xét được, nên được đếm riêng và bỏ qua.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { parse } = createRequire(pathToFileURL(path.join(NATIVE, 'package.json')))('@babel/parser');

const PRESS = /^(Pressable|PressScale|Touchable[A-Za-z]*)$/;
const NAME_ATTR = /^(accessibilityLabel|aria-label|accessibilityLabelledBy|aria-labelledby)$/;
/* Phần tử chắc chắn không vẽ chữ. Mọi component khác được coi là "có thể có chữ". */
const NON_TEXT = new Set([
  'View', 'Animated.View', 'Image', 'Animated.Image', 'ExpoImage', 'Icon', 'ActivityIndicator',
  'LinearGradient', 'BlurView', 'Svg', 'Circle', 'Path', 'Rect', 'G', 'Line', 'Ellipse',
]);

const nameOf = (n) =>
  n.type === 'JSXIdentifier' ? n.name : n.type === 'JSXMemberExpression' ? `${nameOf(n.object)}.${n.property.name}` : '';

function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (f.endsWith('.tsx')) out.push(p);
  }
  return out;
}

/** Mọi phần tử JSX nằm trong một nút AST bất kỳ (không đi vào con của chúng). */
function jsxIn(node, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    node.forEach((n) => jsxIn(n, out));
    return out;
  }
  if (node.type === 'JSXElement' || node.type === 'JSXFragment') {
    out.push(node);
    return out;
  }
  for (const k in node) if (k !== 'loc' && !k.endsWith('Comments')) jsxIn(node[k], out);
  return out;
}

/** Con của phần tử này có thể cho nó một cái tên không. */
function texty(children) {
  for (const ch of children) {
    if (ch.type === 'JSXText') {
      if (ch.value.trim()) return true;
    } else if (ch.type === 'JSXExpressionContainer') {
      if (ch.expression.type === 'JSXEmptyExpression') continue;
      const inner = jsxIn(ch.expression);
      if (inner.length === 0 || inner.some((el) => texty([el]))) return true;
    } else if (ch.type === 'JSXFragment') {
      if (texty(ch.children)) return true;
    } else if (ch.type === 'JSXElement') {
      const n = nameOf(ch.openingElement.name);
      if (/Text/.test(n)) return true;
      if (!NON_TEXT.has(n) && /^[A-Z]/.test(n)) return true;
      if (texty(ch.children)) return true;
    }
  }
  return false;
}

/** `{ out: ["tệp:dòng: …"], n: số chỗ bấm đã xét, spread: số chỗ bỏ qua vì spread }`. */
export function problemsOf(files) {
  const out = [];
  let n = 0;
  let spread = 0;
  for (const [rel, src] of files) {
    const ast = parse(src, { sourceType: 'module', plugins: ['typescript', 'jsx'] });
    const visit = (node) => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) return node.forEach(visit);
      if (typeof node.type !== 'string') return;
      if (node.type === 'JSXElement') {
        const o = node.openingElement;
        const tag = nameOf(o.name);
        if (PRESS.test(tag)) {
          n++;
          const attrs = new Map(o.attributes.filter((a) => a.type === 'JSXAttribute').map((a) => [a.name.name, a.value]));
          const lit = (k) => {
            const v = attrs.get(k);
            if (!v) return undefined;
            if (v.type === 'StringLiteral') return v.value;
            if (v.type === 'JSXExpressionContainer' && v.expression.type === 'BooleanLiteral') return v.expression.value;
            return null;
          };
          if (o.attributes.some((a) => a.type === 'JSXSpreadAttribute')) spread++;
          else if ([...attrs.keys()].some((k) => NAME_ATTR.test(k))) {
            /* có tên */
          } else if (lit('aria-hidden') === true || (attrs.has('aria-hidden') && attrs.get('aria-hidden') === null) || lit('accessible') === false || /^no/.test(String(lit('importantForAccessibility') ?? ''))) {
            /* Cố ý ẩn — nhưng Pressable của react-native-web bỏ qua `accessible`
               và luôn đặt tabindex=0: không có `tabIndex={-1}` thì trên web nó
               vẫn là một điểm dừng Tab không tên (đo trên Hôm nay, #120). */
            const ti = attrs.get('tabIndex');
            const minusOne = ti?.type === 'JSXExpressionContainer' && ti.expression.type === 'UnaryExpression' && ti.expression.operator === '-' && ti.expression.argument.value === 1;
            if (!minusOne && !texty(node.children)) out.push(`${rel}:${o.loc.start.line}: <${tag}> ẩn khỏi cây trợ năng mà thiếu tabIndex={-1} — trên web vẫn là một điểm dừng Tab không tên`);
          } else if (!texty(node.children)) {
            out.push(`${rel}:${o.loc.start.line}: <${tag}> không tên — không nhãn, không chữ con; VoiceOver đọc một ô trống`);
          }
        }
      }
      for (const k in node) if (k !== 'loc' && !k.endsWith('Comments')) visit(node[k]);
    };
    visit(ast.program);
  }
  return { out, n, spread };
}

const files = walk(path.join(NATIVE, 'src')).map((p) => [path.relative(NATIVE, p), readFileSync(p, 'utf8')]);
const { out: problems, n, spread } = problemsOf(files);
if (n < 300) problems.push(`chỉ xét được ${n} chỗ bấm — bộ đọc hỏng, đừng tin kết quả`);

/* ── thử ngược ── */
{
  const base = problems.length;
  const one = (label, src, wantRed) => {
    const got = problemsOf([['thử.tsx', src]]).out.length > 0;
    if (got !== wantRed) problems.push(`thử ngược hỏng: ${label} — luật ${got ? 'đỏ' : 'xanh'}, phải ${wantRed ? 'đỏ' : 'xanh'}`);
  };
  one('chỉ một View (nút chụp cũ)', 'const a = <PressScale onPress={f}><View style={s} /></PressScale>;', true);
  one('chỉ một Icon, có role nhưng không nhãn (X cũ)', 'const b = <PressScale accessibilityRole="button" onPress={f}><Icon icon={X} /></PressScale>;', true);
  one('lớp nền tự đóng, không con', 'const c = <Pressable style={s} onPress={f} />;', true);
  one('biểu thức chỉ chứa Icon', 'const d = <Pressable onPress={f}>{on ? <Icon icon={A} /> : <Icon icon={B} />}</Pressable>;', true);
  one('có accessibilityLabel', 'const e = <PressScale accessibilityLabel={t} onPress={f}><View /></PressScale>;', false);
  one('có <Text> con', 'const g = <Pressable onPress={f}><View><Text>Lưu</Text></View></Pressable>;', false);
  one('biểu thức giá trị {label}', 'const h = <Pressable onPress={f}>{label}</Pressable>;', false);
  one('component lạ <SleepCard>', 'const i = <PressScale onPress={f}><SleepCard m={1} /></PressScale>;', false);
  one('aria-hidden + tabIndex={-1}', 'const j = <Pressable aria-hidden tabIndex={-1} onPress={f} />;', false);
  one('importantForAccessibility="no" + tabIndex={-1}', 'const k = <Pressable importantForAccessibility="no" tabIndex={-1} onPress={f} />;', false);
  one('accessible={false} mà thiếu tabIndex={-1} (web vẫn Tab tới)', 'const l = <Pressable accessible={false} onPress={f} />;', true);
  /* Trên chính cây thật: gỡ nhãn khỏi nút chụp của máy quét món thì đỏ. */
  const at = files.findIndex(([f]) => f === 'src/app/scan-food.tsx');
  const needle = 'accessibilityLabel={i18n.a11yTakePhoto} onPress={capture}';
  if (at < 0 || !files[at][1].includes(needle)) problems.push('thử ngược hỏng: không thấy nhãn nút chụp trong scan-food.tsx');
  else {
    const copy = files.slice();
    copy[at] = [files[at][0], files[at][1].replace(needle, 'onPress={capture}')];
    if (problemsOf(copy).out.length <= base) problems.push('thử ngược hỏng: gỡ nhãn nút chụp của máy quét món mà luật vẫn xanh');
  }
}

if (problems.length) {
  console.log('chỗ bấm không tên:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}
console.log(
  `nút không tên OK — ${n} chỗ bấm trong ${files.length} tệp src/ đều có nhãn, có chữ con, hoặc cố ý ẩn khỏi cây trợ năng ` +
    `(${spread} chỗ có spread không xét được). Thử ngược: chỉ View, chỉ Icon có role, lớp nền tự đóng, biểu thức chỉ chứa Icon, ` +
    'ẩn mà thiếu tabIndex={-1}, và gỡ nhãn nút chụp của máy quét món thì đỏ; nhãn, <Text>, {label}, component lạ, aria-hidden + tabIndex={-1} thì xanh',
);
