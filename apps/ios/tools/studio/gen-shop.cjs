// Phòng thử đồ của cửa hàng (#527 S2) — Kiệt đồng ý vẽ lại dựa trên RN.
//
// `ShopRoom` của RN @ fac9ac2 (`components/ascnd/shop/shop-room.tsx`) dựng
// thành cây phần tử; skin và năng lượng thành token (cùng luật với studio,
// `scene.cjs`); rồi thêm các lớp vẽ lại (`improve-shop.cjs`). Máy quay
// (`shop-camera.ts`) đi kèm golden.
//
// Chạy (từ apps/ios/tools/studio): KOA_DEPS=<deps> node gen-shop.cjs [thư mục ảnh]
// Ghi: ASCNDCore/Koa/ShopSceneData.swift + Fixtures/shop-scene-golden.json.
const { SRC } = require('./harness.cjs');
const path = require('path');
const fs = require('fs');
const React = require('react');
const { emit } = require('./svgtree.cjs');
const { render, diff, colours, energyTok, TOK_SKIN, screenshot } = require('./scene.cjs');
const M = (p) => require(path.join(SRC, 'components', 'ascnd', p));

const pal = M('studio/palette.ts');
pal.STUDIO_SKINS.__tok = TOK_SKIN;
const plan = M('shop/shop-plan.ts');
const camera = M('shop/shop-camera.ts');
const { ShopRoom } = M('shop/shop-room.tsx');

const room = (energy) => render(React.createElement(ShopRoom, { skin: '__tok', energy }));
const [g0] = room(0), [g1] = room(1);
const kids = colours(diff(g0.k, g1.k, energyTok, 'shop'));
const scene = require('./improve-shop.cjs')(kids, plan);

const IOS = path.join(__dirname, '..', '..');
const json = JSON.stringify(scene);
if (json.includes('"##')) throw new Error('chuỗi thô Swift bị cắt');
fs.writeFileSync(path.join(IOS, 'Packages/ASCNDKit/Sources/ASCNDCore/Koa/ShopSceneData.swift'),
  `// SINH TỰ ĐỘNG bởi tools/studio/gen-shop.cjs — đừng sửa tay.\n// Phòng thử đồ (#527 S2): \`ShopRoom\` của RN @ fac9ac2 + lớp vẽ lại của native (improve-shop.cjs).\n\nextension ShopScene {\n  static let json = ##"${json}"##\n}\n`);

function resolve(tree, v) {
  return JSON.parse(JSON.stringify(tree), (k, x) => {
    if (typeof x !== 'string' || !x.startsWith('$')) return x;
    if (x === '$wall0') return v.skin.wall[0];
    if (x === '$wall1') return v.skin.wall[1];
    if (x === '$glow') return v.skin.glow;
    const m = /^\$e:(.+):(.+)$/.exec(x);
    if (m) return +m[1] + (+m[2] - +m[1]) * Math.max(0, Math.min(1, v.energy));
    throw new Error('token lạ ' + x);
  });
}

// ── golden ──
const OPTS = [
  { skin: 'default', energy: 0.5 },
  { skin: 'night', energy: 0 },
  { skin: 'sunset', energy: 1 },
  { skin: 'champion', energy: 1.4 },
  { skin: 'nope', energy: 0.25 },
];
const skinOf = (k) => pal.STUDIO_SKINS[k] ?? pal.STUDIO_SKINS.default;
const views = [[390, 476], [430, 525], [375, 458], [320, 391]];
const cams = [];
for (const [name, s] of Object.entries(camera.SHOTS)) for (const [w, h] of views) cams.push({ shot: name, w, h, m: camera.cameraAt(s, w, h) });
fs.writeFileSync(path.join(IOS, 'Packages/ASCNDKit/Tests/ASCNDCoreTests/Fixtures/shop-scene-golden.json'), JSON.stringify({
  width: camera.SCENE_W, height: camera.SCENE_H, shots: camera.SHOTS, figureBox: camera.FIGURE_BOX, cams,
  scenes: OPTS.map((o) => ({ ...o, tree: resolve(scene, { ...o, skin: skinOf(o.skin) }) })),
}) + '\n');

const outDir = process.argv[2];
if (outDir) {
  for (const o of OPTS.slice(0, 4)) {
    const all = resolve(scene, { ...o, skin: skinOf(o.skin) });
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="390" height="476" viewBox="0 0 390 476">${all.map(emit).join('')}</svg>`;
    screenshot(path.join(path.resolve(outDir), `shop-${o.skin}`), svg, 390, 476);
  }
}
console.log('ok', json.length);
