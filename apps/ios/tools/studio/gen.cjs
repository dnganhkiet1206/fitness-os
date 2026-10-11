// Cảnh studio của phòng linh vật (#527 S1) — Kiệt đồng ý vẽ lại dựa trên RN.
//
// Các lớp tĩnh lấy NGUYÊN từ component RN @ fac9ac2 (`components/ascnd/studio/*`,
// dựng bằng react-dom/server qua `harness.cjs`), phần động thành token (skin,
// năng lượng, chuỗi, pha trăng, tên), rồi thêm các lớp vẽ lại (`improve.cjs`).
//
// Chạy (từ apps/ios/tools/studio):
//   npm i --prefix <deps> react@19.2.3 react-dom@19.2.3 typescript@5.6.3
//   KOA_DEPS=<deps> node gen.cjs [thư mục ảnh xem trước]
// Ghi: ASCNDCore/Koa/StudioSceneData.swift + Fixtures/studio-golden.json.
const { SRC } = require('./harness.cjs');
const path = require('path');
const fs = require('fs');
const { emit } = require('./svgtree.cjs');
const { render, diff, colours, energyTok, TOK_SKIN, screenshot } = require('./scene.cjs');
const React = require('react');
const S = (m) => require(path.join(SRC, 'components', 'ascnd', 'studio', m));

const pal = S('palette.ts');
pal.STUDIO_SKINS.__tok = TOK_SKIN;
const r = (mod, exp, props) => render(React.createElement(S(mod)[exp], props));

// ── phía sau ──
const backParts = {
  bg: colours(r('background.tsx', 'Background', { wall: pal.STUDIO_SKINS.__tok.wall })),
  floor: r('floor.tsx', 'FloorPlane', {}),
  window: diff(r('window.tsx', 'StudioWindow', { moonPhase: 0.3 }), r('window.tsx', 'StudioWindow', { moonPhase: 0.7 }), (w, k, a) => {
    if (k !== 'd') throw new Error('moon ' + k);
    const m = /^M (\S+) (\S+) A (\S+)/.exec(a);
    const r0 = +m[3], cx = +m[1], cy = +m[2] + r0;
    return `$moon:${cx}:${cy}:${r0}`;
  }),
  streak: diff(r('streak-card.tsx', 'StreakCard', { days: 0 }), r('streak-card.tsx', 'StreakCard', { days: 7 }), (w, k, a, b) => {
    if (k === 'text') return a;
    if (k !== 'fill') throw new Error('dot ' + k);
    return `$dot:${a}:${b}`;
  }),
  shelf: r('shelf.tsx', 'Shelf', {}),
  plants: r('plants.tsx', 'StudioPlants', {}),
};
const back = Object.values(backParts).flat();
// chữ số + cỡ của chuỗi
(function fixStreak(nodes) {
  for (const n of nodes) {
    if (n.t === 'Text' && n.p.text === '0' && n.p.fontSize === 22) { n.p.text = '$streak'; n.p.fontSize = '$countSize'; }
    if (n.k) fixStreak(n.k);
  }
})(back);
// đánh số chấm theo thứ tự
let dot = 0;
(function dots(nodes) {
  for (const n of nodes) {
    if (typeof n.p.fill === 'string' && n.p.fill.startsWith('$dot:')) n.p.fill = n.p.fill.replace('$dot:', `$dot${dot++}:`);
    if (n.k) dots(n.k);
  }
})(back);

// ── phía trước ──
const FRONT = ['ball', 'stageShadow', 'vignette', 'neon', 'spot', 'motes', 'floorLight', 'platform', 'stageGlow', 'label'];
const front0 = (e) => [
  r('yoga-ball.tsx', 'YogaBall', { x: 352, y: 400, r: 30 }),
  [{ t: 'Ellipse', p: { cx: pal.STAGE_MARK.x, cy: pal.STAGE_MARK.y + 6, rx: 205, ry: 50, fill: pal.C.shadow, opacity: 0.036 } }],
  r('floor.tsx', 'Vignette', {}),
  r('neon-sign.tsx', 'NeonSign', {}),
  r('spotlight.tsx', 'Spotlight', {}),
  r('motes.tsx', 'Motes', {}),
  r('floor.tsx', 'FloorLight', { glow: '#a00003', energy: e }),
  r('platform.tsx', 'Platform', { glow: '#a00003', energy: e }),
  r('platform.tsx', 'StageGlow', { glow: '#a00003', energy: e }),
  r('stage-label.tsx', 'StageLabel', { label: '@@', glow: '#a00003' }),
];
const f0 = front0(0), f1 = front0(1);
const frontParts = Object.fromEntries(FRONT.map((n, i) => [n, colours(diff(f0[i], f1[i], energyTok, n))]));
const front = Object.values(frontParts).flat();
(function label(nodes) {
  for (const n of nodes) {
    if (n.t === 'Text' && n.p.text === '@@') n.p.text = '$label';
    if (n.k) label(n.k);
  }
})(front);

const improve = require('./improve.cjs');
const scene = improve({ back: backParts, front: frontParts, pal });
// ── dữ liệu cho Swift ──
const IOS = path.join(__dirname, '..', '..');
const json = JSON.stringify({ back: scene.back, front: scene.front });
if (json.includes('"##')) throw new Error('chuỗi thô Swift bị cắt');
fs.writeFileSync(path.join(IOS, 'Packages/ASCNDKit/Sources/ASCNDCore/Koa/StudioSceneData.swift'),
  `// SINH TỰ ĐỘNG bởi tools/studio/gen.cjs — đừng sửa tay.\n// Cảnh studio (#527 S1): lớp tĩnh của RN @ fac9ac2 + lớp vẽ lại của native (improve.cjs).\n\nextension StudioScene {\n  static let json = ##"${json}"##\n}\n`);

const moonPath = S('window.tsx').moonPath;
const moonPhase = S('window.tsx').moonPhase;
function resolve(tree, v) {
  return JSON.parse(JSON.stringify(tree), (k, x) => {
    if (typeof x !== 'string' || !x.startsWith('$')) return x;
    if (x === '$wall0') return v.skin.wall[0];
    if (x === '$wall1') return v.skin.wall[1];
    if (x === '$glow') return v.skin.glow;
    if (x === '$streak') return String(Math.max(0, Math.round(v.streak)));
    if (x === '$countSize') { const c = Math.max(0, Math.round(v.streak)); return c >= 100 ? 15 : c >= 10 ? 19 : 22; }
    if (x === '$label') return v.label.toUpperCase();
    let m;
    if ((m = /^\$e:(.+):(.+)$/.exec(x))) return +m[1] + (+m[2] - +m[1]) * Math.max(0, Math.min(1, v.energy));
    if ((m = /^\$moon:(.+):(.+):(.+)$/.exec(x))) return moonPath(+m[1], +m[2], +m[3], v.moon);
    if ((m = /^\$dot(\d+):(.+):(.+)$/.exec(x))) return +m[1] < Math.max(0, Math.min(7, v.streak)) ? m[3] : m[2];
    throw new Error('token lạ ' + x);
  });
}

// ── golden ──
const OPTS = [
  { skin: 'default', energy: 0.6, streak: 5, moon: 0.3, label: 'Koa' },
  { skin: 'night', energy: 0, streak: 23, moon: 0.71, label: 'blaze' },
  { skin: 'sunset', energy: 1, streak: 0, moon: 0.5, label: 'Swift' },
  { skin: 'champion', energy: 1.4, streak: 140, moon: 0.02, label: 'Nova' },
];
const moons = [];
for (let i = 0; i <= 40; i++) moons.push({ phase: i / 40, d: moonPath(301, 125, 11, i / 40) });
const dates = [0, 1e12, 1.6e12, 1.79e12, 1791000000000, 946684800000].map((t) => ({ t, phase: moonPhase(new Date(t)) }));
fs.writeFileSync(path.join(IOS, 'Packages/ASCNDKit/Tests/ASCNDCoreTests/Fixtures/studio-golden.json'), JSON.stringify({
  skins: pal.STUDIO_SKINS.default && Object.fromEntries(Object.entries(pal.STUDIO_SKINS).filter(([k]) => k !== '__tok')),
  stageMark: pal.STAGE_MARK, sceneBottom: pal.SCENE_BOTTOM, moons, dates,
  scenes: OPTS.map((o) => ({ ...o, tree: resolve([...scene.back, ...scene.front], { ...o, skin: pal.STUDIO_SKINS[o.skin] }) })),
}) + '\n');

// ── xem trước (tuỳ chọn): node gen.cjs <thư mục> ──
const outDir = process.argv[2];
if (outDir) {
  for (const o of OPTS) {
    const all = resolve([...scene.back, ...scene.front], { ...o, skin: pal.STUDIO_SKINS[o.skin] });
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="390" height="${pal.SCENE_BOTTOM}" viewBox="0 0 390 ${pal.SCENE_BOTTOM}">${all.map(emit).join('')}</svg>`;
    screenshot(path.join(path.resolve(outDir), `studio-${o.skin}`), svg, 390, pal.SCENE_BOTTOM);
  }
}
console.log('ok', json.length);
