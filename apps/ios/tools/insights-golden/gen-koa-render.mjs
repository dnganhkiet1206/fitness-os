#!/usr/bin/env node
/**
 * Golden cho Koa K2 (#527): cây phần tử mà CHÍNH `KoaFigure` của RN @ fac9ac2
 * đưa xuống react-native-svg, ở một thời điểm `t` của đồng hồ.
 *
 * Không chép tay `RenderNode`: `koa-figure.tsx` và mọi module `koa/*` được lấy
 * thẳng bằng `git show`, dịch bằng TypeScript rồi dựng bằng
 * react-test-renderer. Chỉ phần nền tảng bị thay bằng bản giả:
 *  - react-native-svg → thẻ chuỗi (`G`, `Path`, …) để `toJSON()` ra nguyên props;
 *  - reanimated → `useAnimatedProps(fn)` chạy `fn` ngay lúc dựng (một khung),
 *    `createAnimatedComponent(G)` vẽ `G` với các props hoạt ảnh đã tính;
 *  - react-native → `Platform.OS = 'ios'`, `AppState` đang mở;
 *  - `useMaterial` / `reduceMotionSV` / `studio/*` → hằng.
 * Ba chỗ vá có kiểm (không khớp → dừng): đồng hồ bắt đầu ở `__KOA_T`, độ mặc
 * đồ ở `__KOA_BLEND`, ánh nhìn đã giải là `__KOA_GAZE` (`gazeAt` phụ thuộc cảnh
 * studio — để sau).
 *
 * Chạy (từ apps/ios/tools/insights-golden):
 *   npm i --prefix <deps> react@19.2.3 react-test-renderer@19.2.3 typescript@5.6.3
 *   KOA_DEPS=<deps> node gen-koa-render.mjs > ../../Packages/ASCNDKit/Tests/ASCNDCoreTests/Fixtures/koa-render-golden.json
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';

const DEPS = process.env.KOA_DEPS;
if (!DEPS) throw new Error('KOA_DEPS chưa đặt');
const depRequire = createRequire(path.join(path.resolve(DEPS), 'node_modules', 'x.js'));
const ts = depRequire('typescript');
const reactPath = depRequire.resolve('react');
const jsxPath = depRequire.resolve('react/jsx-runtime');
const rtrPath = depRequire.resolve('react-test-renderer');

const REV = 'fac9ac2';
const KOA = 'native/src/components/ascnd/koa';
const show = (p) => execFileSync('git', ['show', `${REV}:${p}`], { encoding: 'utf8', maxBuffer: 1 << 26 });

const out = mkdtempSync(path.join(tmpdir(), 'koa-render-'));

function patch(src, from, to) {
  if (src.split(from).length !== 2) throw new Error(`vá không khớp đúng một chỗ: ${from}`);
  return src.replace(from, to);
}

function emit(name, src, file) {
  src = src
    .replace(/'@\/components\/ascnd\/koa\/([a-z-]+)'/g, "'./$1'")
    .replace("'@/components/ascnd/studio/bugs'", "'./stub-bugs'")
    .replace("'@/components/ascnd/studio/palette'", "'./stub-studio-palette'")
    .replace("'@/hooks/use-palette'", "'./stub-palette'")
    .replace("'@/hooks/use-reduced-motion'", "'./stub-rm'")
    .replace("'react-native-reanimated'", "'./stub-reanimated'")
    .replace("'react-native-svg'", "'./stub-svg'")
    .replace("'react-native'", "'./stub-rn'");
  let js = ts.transpileModule(src, {
    fileName: file,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  js = js
    .replace(/require\("react\/jsx-runtime"\)/g, `require(${JSON.stringify(jsxPath)})`)
    .replace(/require\("react"\)/g, `require(${JSON.stringify(reactPath)})`);
  writeFileSync(path.join(out, `${name}.js`), js);
}

for (const f of ['koa-scene', 'koa-flags', 'koa-pose', 'koa-dress', 'koa-frame', 'figure-clock', 'koa-light', 'svg-shapes', 'koa-gaze']) {
  emit(f, show(`${KOA}/${f}.ts`), `${f}.ts`);
}
let figure = show(`${KOA}/koa-figure.tsx`);
figure = patch(figure, 'const clock = useSharedValue(0);', 'const clock = useSharedValue(globalThis.__KOA_T ?? 0);');
figure = patch(figure, 'const blend = useSharedValue(dress ? 1 : 0);', 'const blend = useSharedValue(globalThis.__KOA_BLEND ?? (dress ? 1 : 0));');
figure = patch(figure, 'clockOrNull ? gazeAt(clockOrNull.value)', 'clockOrNull ? (globalThis.__KOA_GAZE ?? gazeAt(clockOrNull.value))');
emit('koa-figure', figure, 'koa-figure.tsx');

const R = JSON.stringify(reactPath);
const stubs = {
  'stub-svg': `
    const names = ['Svg','ClipPath','Defs','G','LinearGradient','Path','RadialGradient','Stop','Circle','Ellipse','Line','Polygon','Polyline','Rect','Text','TSpan'];
    for (const n of names) exports[n] = n;
    exports.default = 'Svg';`,
  'stub-reanimated': `
    const React = require(${R});
    exports.default = { createAnimatedComponent: (C) => function Animated({ animatedProps, children, ...rest }) {
      return React.createElement(C, { ...rest, ...animatedProps }, children);
    } };
    exports.useAnimatedProps = (fn) => fn();
    exports.useDerivedValue = (fn) => ({ value: fn() });
    exports.useFrameCallback = () => ({ setActive() {} });
    exports.useSharedValue = (v) => React.useState(() => ({ value: v }))[0];
    exports.withTiming = (v) => v;
    exports.makeMutable = (v) => ({ value: v });`,
  'stub-rn': `
    exports.View = 'View';
    exports.Platform = { OS: 'ios' };
    exports.AppState = { currentState: 'active', addEventListener: () => ({ remove() {} }) };
    exports.AccessibilityInfo = {};`,
  'stub-palette': `exports.useMaterial = () => ({ lit: true });`,
  'stub-rm': `exports.reduceMotionSV = { value: false };`,
  'stub-bugs': `exports.perchAt = () => { throw new Error('gazeAt không có trong K2'); };`,
  'stub-studio-palette': `exports.STAGE_MARK = { x: 0, y: 0 };`,
};
for (const [n, s] of Object.entries(stubs)) writeFileSync(path.join(out, `${n}.js`), `exports.__esModule = true;\n${s}`);

const req = createRequire(path.join(out, 'x.js'));
const React = req(reactPath);
const TestRenderer = req(rtrPath);
const { KoaFigure } = req('./koa-figure.js');
const { KOA_ITEMS } = req('./koa-flags.js');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
// react-test-renderer báo "deprecated" một lần — không phải lỗi của cảnh
const warn = console.error;
console.error = (...a) => { if (!String(a[0]).includes('deprecated')) warn(...a); };

function matrixOf(s) {
  const m = /^matrix\(([^)]*)\)$/.exec(s);
  if (!m) throw new Error(`transform lạ: ${s}`);
  const v = m[1].split(' ').map(Number);
  if (v.length !== 6 || v.some((x) => !Number.isFinite(x))) throw new Error(`transform lạ: ${s}`);
  return v;
}

/** `{ t, p, m?, k? }` — props trừ `children`; `transform` / `matrix` thành `m` */
function norm(e) {
  if (typeof e === 'string') throw new Error(`chữ trong cây: ${e}`);
  const { children, transform, matrix, ...p } = e.props;
  if (transform !== undefined && matrix !== undefined) throw new Error('vừa transform vừa matrix');
  const o = { t: e.type, p };
  if (typeof transform === 'string') o.m = matrixOf(transform);
  else if (transform !== undefined) throw new Error(`transform không phải chuỗi: ${JSON.stringify(transform)}`);
  if (matrix !== undefined) o.m = matrix;
  for (const v of Object.values(p)) {
    if (typeof v !== 'string' && typeof v !== 'number') throw new Error(`prop lạ ${e.type}: ${JSON.stringify(p)}`);
  }
  if (e.children && e.children.length) o.k = e.children.map(norm);
  return o;
}

function render(c) {
  globalThis.__KOA_T = c.t;
  globalThis.__KOA_BLEND = c.blend;
  globalThis.__KOA_GAZE = c.gaze;
  const props = {
    expression: c.e, pose: c.p, dress: c.dress, worn: c.worn, size: 160, animated: c.live, paper: c.paper,
    gaze: c.gaze ? { value: 0 } : undefined,
  };
  let r;
  TestRenderer.act(() => { r = TestRenderer.create(React.createElement(KoaFigure, props)); });
  const j = r.toJSON();
  TestRenderer.act(() => r.unmount());
  if (!j || j.type !== 'View' || j.children.length !== 1) throw new Error('gốc không phải View > Svg');
  return norm(j.children[0]);
}

const EXPR = ['happy', 'surprised', 'grin', 'confident', 'sad', 'tired', 'angry', 'delighted', 'happytired', 'strain', 'plead'];
const POSES = ['idle', 'turn34', 'running', 'lifting', 'stretching', 'relaxing'];
const SLOTS = Object.keys(KOA_ITEMS);
let wornAt = 0;
/** mỗi ca mặc món kế tiếp của mỗi ô — 70 món đều xuất hiện */
function nextWorn(skip = []) {
  const w = {};
  SLOTS.forEach((s, j) => {
    if (skip.includes(s)) return;
    w[s] = KOA_ITEMS[s][(wornAt + j * 3) % KOA_ITEMS[s].length];
  });
  wornAt++;
  return w;
}

const cases = [];
const add = (c) => cases.push({ e: 'happy', p: 'idle', dress: false, live: true, paper: false, t: 0, ...c });
POSES.forEach((p, i) => add({ p, e: EXPR[(i * 4) % 11], worn: nextWorn(), t: 1234.5 + i * 977, paper: i % 2 === 1 }));
POSES.forEach((p, i) => add({ p, e: EXPR[(i * 5 + 2) % 11], worn: nextWorn(), live: false, paper: i % 3 === 0 }));
EXPR.forEach((e, i) => add({ e, worn: i % 3 === 0 ? undefined : nextWorn(['hand']), t: 777 + i * 1531 }));
for (const t of [0, 50, 3333.3, 17999, 18000, 36000.5]) add({ p: 'running', e: 'strain', worn: nextWorn(), t });
for (const [blend, t] of [[1, 500], [0.4, 1300], [1, 2200]]) add({ dress: true, blend, worn: nextWorn(), t });
add({ dress: true, live: false, worn: nextWorn() });
for (const [e, g] of [['happy', { x: 0.6, y: -0.3, k: 0.7 }], ['grin', { x: -1, y: 0.5, k: 1 }], ['sad', { x: 0.2, y: 0.2, k: 0.4 }], ['happy', { x: 0.5, y: 0.5, k: 0 }]]) {
  add({ e, gaze: g, worn: nextWorn(), t: 4100 });
}
add({ e: 'happy', worn: {}, t: 0 });

const fmt = (k, v) => (typeof v === 'number' ? +v.toPrecision(12) : v);
process.stdout.write(JSON.stringify({ cases: cases.map((c) => ({ ...c, tree: render(c) })) }, fmt) + '\n');
