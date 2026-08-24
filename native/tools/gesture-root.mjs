/**
 * That every gesture in the app has the root it throws without.
 *
 * ── the crash ──
 *
 *   GestureDetector must be used as a descendant of GestureHandlerRootView.
 *
 * `GestureDetector` and `ReanimatedSwipeable` both throw on mount without that
 * wrapper. Not degrade — throw, red screen, on the first render of the screen
 * that holds them.
 *
 * ── why nothing caught it ──
 *
 * `tools/live.mjs` renders the app for WEB, and on web gesture-handler does not
 * require the wrapper. So it opened 31 screens in 3 states, pressed buttons,
 * ran scripted scenarios and reported everything green, while the swipe row on
 * /sessions and the hero deck on Today both crashed on a device. The runner is
 * not weak here; it is structurally blind, and a rule is the only thing that
 * can see it.
 *
 * ── and the repository had already written the requirement down ──
 *
 * `line-chart.tsx` refused `Gesture.Pan` years before either of these existed
 * and said exactly why: "`Gesture.Pan` needs a `GestureHandlerRootView` wrapped
 * around the app." The note was right, it was read, and it was walked into
 * anyway — which is what a rule is for and a comment is not.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT_FILE = 'src/app/_layout.tsx';
const read = (f) => readFileSync(path.join(NATIVE, f), 'utf8');
const strip = (t) =>
  t.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/(^|\s)\/\/.*$/, '$1')).join('\n');

const problems = [];

const walk = (d) =>
  readdirSync(d).flatMap((e) => {
    const p = path.join(d, e);
    return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(p) ? [p] : [];
  });

/* Who actually needs the root — by what they IMPORT, not by the library being
   in package.json. `line-chart.tsx` mentions gesture-handler in prose and
   deliberately does not use it; a rule that read the word would count it. */
const NEEDS = /import\s*\{[^}]*\b(GestureDetector|Gesture|Swipeable|ReanimatedSwipeable|PanGestureHandler|TapGestureHandler|ScrollView|Pressable)\b[^}]*\}\s*from\s*'react-native-gesture-handler'|from\s*'react-native-gesture-handler\/[A-Za-z]/;

const users = [];
for (const abs of walk(path.join(NATIVE, 'src'))) {
  const rel = path.relative(NATIVE, abs);
  if (rel === ROOT_FILE) continue;
  if (NEEDS.test(strip(read(rel)))) users.push(rel);
}

const root = strip(read(ROOT_FILE));
const hasRoot = /<GestureHandlerRootView/.test(root);

if (users.length > 0 && !hasRoot) {
  problems.push(
    `${users.length} file dùng gesture-handler (${users.join(', ')}) nhưng ${ROOT_FILE} không bọc ` +
      '<GestureHandlerRootView> — mọi màn chứa chúng sẽ NÉM ngay khi mount trên máy thật, và bộ ' +
      'chạy web không thấy được vì trên web thư viện này không đòi wrapper',
  );
} else if (hasRoot) {
  /* Outermost, or it is not a root. A gesture mounted above it is a gesture
     outside it, and the error message is identical. */
  const ret = root.slice(root.lastIndexOf('return ('));
  const g = ret.indexOf('<GestureHandlerRootView');
  const firstTag = ret.search(/<[A-Z][A-Za-z]*/);
  if (g !== firstTag) {
    problems.push(
      `${ROOT_FILE}: <GestureHandlerRootView> không phải phần tử NGOÀI CÙNG — thứ gì mount phía ` +
        'trên nó vẫn nằm ngoài nó, và thông báo lỗi y hệt như khi không có',
    );
  }
  /* Without flex it collapses to its content and the app draws in a strip. */
  if (!/<GestureHandlerRootView[^>]*style=/.test(ret)) {
    problems.push(`${ROOT_FILE}: <GestureHandlerRootView> không có style — thiếu flex: 1 thì app co lại thành một dải ở đỉnh màn hình`);
  } else {
    const styleName = /<GestureHandlerRootView[^>]*style=\{styles\.(\w+)\}/.exec(ret)?.[1];
    const decl = styleName ? new RegExp(`${styleName}:\\s*\\{[^}]*flex:\\s*1`).test(root) : /flex:\s*1/.test(ret);
    if (!decl) problems.push(`${ROOT_FILE}: style của <GestureHandlerRootView> không có flex: 1`);
  }
}

if (problems.length) {
  console.log('gốc cử chỉ CÓ LỖI:\n');
  for (const p of problems.slice(0, 10)) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  `gốc cử chỉ OK — ${users.length} file dùng react-native-gesture-handler và _layout.tsx bọc ` +
    '<GestureHandlerRootView> ở NGOÀI CÙNG với flex: 1. Luật này tồn tại vì bộ chạy web không thấy ' +
    'được lỗi đó: trên web thư viện không đòi wrapper, nên 31 màn × 3 trạng thái báo xanh trong khi ' +
    'hàng vuốt ở /sessions và deck ở Today đều NÉM ngay khi mount trên máy thật. Và nó đếm theo thứ ' +
    'được IMPORT chứ không theo tên thư viện xuất hiện: line-chart.tsx nhắc tới gesture-handler ' +
    'trong văn xuôi và cố ý KHÔNG dùng nó',
);
