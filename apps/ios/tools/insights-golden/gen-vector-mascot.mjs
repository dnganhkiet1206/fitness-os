#!/usr/bin/env node
/**
 * Golden cho linh vật vector (#527, V1): cây phần tử mà CHÍNH `VectorMascot`
 * của RN @ fac9ac2 (`components/ascnd/vector-mascot.tsx`) đưa xuống
 * react-native-svg, ở khung đứng yên (`animated={false}` — như avatar cộng đồng
 * và mọi lưới chọn).
 *
 * Tệp lấy thẳng bằng `git show`, dịch bằng TypeScript, dựng bằng
 * react-test-renderer. Bản giả: react-native-svg → thẻ chuỗi; reanimated →
 * `useAnimatedStyle(fn)` chạy `fn` ngay, `withTiming` / `withSequence` trả đích;
 * `useIsFocused` → true; `useInteracting` → false.
 *
 * Chuẩn hoá (kiểm, không khớp → dừng):
 *  - `G` `x` / `y` → `m` tịnh tiến; `rotation` + `originX` / `originY` → `m` xoay
 *    quanh gốc (đúng nghĩa của react-native-svg);
 *  - id clip `vm<n>_<k>` → `vm_<k>` (bộ đếm của module tăng theo lần dựng);
 *  - lớp thở bọc ngoài phải là ma trận đơn vị ở khung đứng yên (bỏ đi);
 *  - hai mí mắt là View phủ NGOÀI Svg, theo toạ độ màn hình = toạ độ rig × tỉ
 *    lệ → đổi về `Rect` trong rig, `scaleY` của mí quanh tâm của nó → `m`.
 *
 * Chạy (từ apps/ios/tools/insights-golden):
 *   npm i --prefix <deps> react@19.2.3 react-test-renderer@19.2.3 typescript@5.6.3
 *   KOA_DEPS=<deps> node gen-vector-mascot.mjs > ../../Packages/ASCNDKit/Tests/ASCNDCoreTests/Fixtures/vector-mascot-golden.json
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

const src = execFileSync('git', ['show', 'fac9ac2:native/src/components/ascnd/vector-mascot.tsx'], { encoding: 'utf8' });
const out = mkdtempSync(path.join(tmpdir(), 'vector-mascot-'));

let s = src
  .replace("'react-native-reanimated'", "'./stub-reanimated'")
  .replace("'react-native-svg'", "'./stub-svg'")
  .replace("'expo-router'", "'./stub-router'")
  .replace("'@/lib/interaction'", "'./stub-interaction'")
  .replace("'react-native'", "'./stub-rn'");
let js = ts.transpileModule(s, {
  fileName: 'vector-mascot.tsx',
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
js = js
  .replace(/require\("react\/jsx-runtime"\)/g, `require(${JSON.stringify(jsxPath)})`)
  .replace(/require\("react"\)/g, `require(${JSON.stringify(reactPath)})`);
writeFileSync(path.join(out, 'vector-mascot.js'), js);

const R = JSON.stringify(reactPath);
const stubs = {
  'stub-svg': `
    for (const n of ['Svg','ClipPath','Defs','Ellipse','G','Path','Rect']) exports[n] = n;
    exports.default = 'Svg';`,
  'stub-reanimated': `
    const React = require(${R});
    exports.default = { View: function AnimatedView({ children, ...p }) { return React.createElement('AView', p, children); } };
    const id = (x) => x;
    exports.Easing = { inOut: () => id, sin: id };
    exports.useAnimatedStyle = (fn) => fn();
    exports.useSharedValue = (v) => React.useState(() => ({ value: v }))[0];
    exports.withTiming = (v) => v;
    exports.withSequence = (...a) => a[a.length - 1];`,
  'stub-rn': `exports.View = 'View';`,
  'stub-router': `exports.useIsFocused = () => true;`,
  'stub-interaction': `exports.useInteracting = () => false;`,
};
for (const [n, body] of Object.entries(stubs)) writeFileSync(path.join(out, `${n}.js`), `exports.__esModule = true;\n${body}`);

const req = createRequire(path.join(out, 'x.js'));
const React = req(reactPath);
const TestRenderer = req(rtrPath);
const { VectorMascot } = req('./vector-mascot.js');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const warn = console.error;
console.error = (...a) => { if (!String(a[0]).includes('deprecated')) warn(...a); };

const mul = (m, n) => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];

function norm(e) {
  if (typeof e === 'string') throw new Error(`chữ trong cây: ${e}`);
  const { children, ...rest } = e.props;
  // `x` / `y` của G là phép dời; của Rect là toạ độ thật
  const { x, y, rotation, originX, originY, ...gp } = e.type === 'G' ? rest : { ...rest, x: undefined, y: undefined };
  const p = e.type === 'G' ? gp : rest;
  if (e.type !== 'G' && (rest.rotation !== undefined || rest.originX !== undefined)) throw new Error(`rotation ngoài G: ${e.type}`);
  const o = { t: e.type, p };
  if (x !== undefined || y !== undefined || rotation !== undefined) {
    if ((x !== undefined || y !== undefined) && rotation !== undefined) throw new Error('G vừa dời vừa xoay');
    if (rotation !== undefined) {
      const r = (rotation * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
      const ox = originX ?? 0, oy = originY ?? 0;
      o.m = mul(mul([1, 0, 0, 1, ox, oy], [c, s, -s, c, 0, 0]), [1, 0, 0, 1, -ox, -oy]);
    } else {
      o.m = [1, 0, 0, 1, x ?? 0, y ?? 0];
    }
  } else if (originX !== undefined || originY !== undefined) {
    throw new Error('origin không kèm rotation');
  }
  for (const [k, v] of Object.entries(p)) {
    if (typeof v !== 'string' && typeof v !== 'number') throw new Error(`prop lạ ${e.type}.${k}: ${JSON.stringify(v)}`);
    if (typeof v === 'string') p[k] = v.replace(/vm\d+_/g, 'vm_');
  }
  if (e.children && e.children.length) o.k = e.children.map(norm);
  return o;
}

function render(c) {
  let r;
  TestRenderer.act(() => {
    r = TestRenderer.create(
      React.createElement(VectorMascot, {
        mascot: { id: c.id }, size: c.size, mood: c.mood, level: c.level, equippedOutfits: new Set(c.equipped), animated: false,
      }),
    );
  });
  const j = r.toJSON();
  TestRenderer.act(() => r.unmount());
  const scale = c.size / 240;
  if (j.type !== 'View') throw new Error('gốc không phải View');
  const [body, ...lids] = j.children;
  if (body.type !== 'AView' || body.children.length !== 1) throw new Error('thiếu lớp thở');
  // khung đứng yên: lớp thở là đơn vị
  const tf = body.props.style.transform;
  const v = tf.map((t) => Object.values(t)[0]);
  if (!(v[0] === 0 && parseFloat(v[1]) === 0 && v[2] === 0 && v[3] === 1)) throw new Error(`lớp thở không đơn vị: ${JSON.stringify(tf)}`);
  const svg = norm(body.children[0]);
  for (const l of lids) {
    if (l.type !== 'AView') throw new Error('mí không phải AView');
    const [box, anim] = l.props.style;
    const sy = anim.transform[0].scaleY;
    const xx = box.left / scale, yy = box.top / scale, w = box.width / scale, h = box.height / scale;
    const cy = yy + h / 2;
    (svg.k ??= []).push({
      t: 'Rect', p: { x: xx, y: yy, width: w, height: h, rx: box.borderRadius / scale, fill: box.backgroundColor },
      m: [1, 0, 0, sy, 0, cy * (1 - sy)],
    });
  }
  return svg;
}

const IDS = ['koa', 'blaze', 'swift', 'titan', 'drago', 'nova', 'nope'];
const MOODS = ['neutral', 'happy', 'tired'];
const OUTFITS = ['sunglasses', 'medal', 'belt', 'headband', 'cap'];
const cases = [];
IDS.forEach((id, i) => {
  MOODS.forEach((mood, j) => {
    const level = [1, 2, 9, 30][(i + j) % 4];
    const equipped = OUTFITS.filter((_, k) => ((i * 3 + j + k) % 3) === 0);
    cases.push({ id, mood, level, equipped, size: [40, 50, 160][(i + j) % 3] });
  });
});
cases.push({ id: 'titan', mood: 'neutral', level: 1, equipped: [], size: 40 });
cases.push({ id: 'blaze', mood: 'happy', level: 15, equipped: OUTFITS, size: 120 });

const fmt = (k, v) => (typeof v === 'number' ? +v.toPrecision(12) : v);
process.stdout.write(JSON.stringify({ cases: cases.map((c) => ({ ...c, tree: render(c) })) }, fmt) + '\n');
