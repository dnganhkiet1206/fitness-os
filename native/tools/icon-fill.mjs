/**
 * That an optional prop is *omitted* when absent, not passed as `undefined`.
 *
 * ── the bug, which shipped and was visible on every screen ──
 *
 * `Icon` gained a `fill` prop so a lit streak flame could be solid against an
 * unlit outline. It forwarded it unconditionally:
 *
 *     <LucideCmp size={size} color={…} strokeWidth={strokeWidth} fill={fill} />
 *
 * Lucide builds the props it hands to `react-native-svg` as
 * `{ ...defaultAttributes, ...customAttrs }`, where `defaultAttributes.fill` is
 * the string `'none'` and `customAttrs` is everything else it was given. A key
 * that is **present and `undefined` still wins a spread** — so `fill: 'none'`
 * became `fill: undefined`, and an SVG shape with no fill specified is not
 * unfilled, it is **black**.
 *
 * Every outline icon in the app filled itself in. Nothing threw, nothing failed
 * a type check — `fill?: string` is honestly typed and honestly passed — and no
 * rule in this suite had an opinion, because the mistake is not in any one
 * file's logic. It is in what a spread does with a key nobody set.
 *
 * ── the rule ──
 *
 * In the icon wrapper, an optional prop reaches the third-party component only
 * through a conditional spread. `{...(fill ? { fill } : null)}` says absent
 * means absent; `fill={fill}` says absent means "explicitly nothing", and those
 * are different sentences to a library that has its own default.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ICON = 'src/components/ascnd/icon.tsx';
const read = (f) => readFileSync(path.join(NATIVE, f), 'utf8');

export function problems(src) {
  const out = [];

  /** the optional props of the wrapper, from its own type literal */
  const optional = [...src.matchAll(/^\s{2}(\w+)\?:/gm)].map((m) => m[1]);
  if (optional.length === 0) out.push('không đọc được prop tuỳ chọn nào trong icon.tsx');

  const body = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const call = body.match(/<LucideCmp[\s\S]*?\/>/);
  if (!call) {
    out.push('không tìm thấy chỗ dựng LucideCmp');
    return out;
  }

  /* A prop with a default in the destructuring can never arrive as undefined,
     so forwarding it plainly is fine — `size = 20` and `strokeWidth = 2` are
     real values by the time they are passed. The rule is about the ones with
     nothing standing behind them. */
  const params = src.match(/export function Icon\(\{([\s\S]*?)\}:/);
  const defaulted = new Set(
    params ? [...params[1].matchAll(/(\w+)\s*=\s*[^,}]+/g)].map((m) => m[1]) : [],
  );

  for (const prop of optional) {
    if (defaulted.has(prop)) continue;
    if (new RegExp(`\\b${prop}=\\{${prop}\\}`).test(call[0])) {
      out.push(
        `\`${prop}={${prop}}\` chuyển thẳng một prop tuỳ chọn xuống lucide — một khoá CÓ MẶT ` +
          'mà undefined vẫn thắng trong spread, nên nó ghi đè mặc định của thư viện. Với `fill` ' +
          'thì mặc định `none` bị thay bằng undefined, và một hình SVG không nói fill thì được ' +
          'tô ĐEN: mọi icon nét trong app tự tô đặc lại. Phải spread có điều kiện.',
      );
    }
  }

  if (!/\{\.\.\.\(\w+ \? \{ \w+ \} : null\)\}/.test(call[0])) {
    out.push('không thấy spread có điều kiện nào — prop tuỳ chọn phải vắng mặt khi không có giá trị');
  }

  return out;
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const src = read(ICON);
  const found = problems(src);

  /* Self-test on the exact line that shipped. */
  const SHIPPED = src.replace(/\{\.\.\.\(fill \? \{ fill \} : null\)\}/, 'fill={fill}');
  const selftest = [];
  if (SHIPPED === src) selftest.push('không dựng lại được bản đã ship (fill={fill})');
  else if (!problems(SHIPPED).length) selftest.push('bản fill={fill} đã ship vẫn lọt');

  if (found.length || selftest.length) {
    console.log('icon tô đặc:\n');
    for (const p of found) console.log(`  • ${p}`);
    for (const p of selftest) console.log(`  • tự kiểm: ${p}`);
    process.exit(1);
  }

  console.log(
    'icon OK — prop tuỳ chọn được spread có điều kiện chứ không chuyển thẳng; ' +
      'bản đã ship (fill={fill}, khiến MỌI icon nét trong app bị tô đen) vẫn bị bắt',
  );
}
