/**
 * Hold the studio to the design screenshot, with numbers.
 *
 * Put `ref.png` (the design) and `studio.png` (from preview.mjs) in one
 * folder and this measures each landmark in both, in 390×844 points, and
 * prints the disagreement.
 *
 *   node tools/koa-studio/preview.mjs <dir>/studio.png
 *   node tools/koa-studio/compare.mjs  <dir> [--shot]
 *
 * `--shot` also writes compare.png: reference, render, and the two at 50%
 * over each other, which catches what a bounding box cannot.
 *
 * Read the last block, not the table, for anything that glows. A box takes
 * the glow in with the object.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

// ref.png = the design screenshot, studio.png = what preview.mjs just wrote
const DIR = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '.';
const { chromium } = createRequire(import.meta.url)('playwright');
const b64 = (f) => readFileSync(path.join(DIR, f)).toString('base64');

/**
 * Landmarks found by what the colour *is* rather than by an exact hex: the
 * reference is a rendered screenshot with its own anti-aliasing and gradient
 * mixing, so matching palette values against it finds almost nothing.
 *
 * `band` is the vertical slice to look in (fraction of screen height) and
 * `half` the side — that is what keeps the podium's gold apart from the
 * bolt's and the streak pips'.
 */
const MARKS = [
  { name: 'vòng bục', kind: 'gold', band: [0.42, 0.62] },
  // the coin pill lives at the same height and the same colour, so the lamp
  // has to be looked for in the middle column only
  { name: 'miệng đèn', kind: 'gold', band: [0.05, 0.1], xband: [0.3, 0.7] },
  { name: 'biển neon', kind: 'purple', band: [0.13, 0.26], half: 'left' },
  { name: 'thẻ streak', kind: 'purple', band: [0.27, 0.38], half: 'right' },
  { name: 'cây trên kệ', kind: 'green', band: [0.22, 0.34], half: 'left' },
  { name: 'cây dưới sàn', kind: 'green', band: [0.33, 0.52], half: 'right' },
  { name: 'trời cửa sổ', kind: 'sky', band: [0.09, 0.27], half: 'right' },
];

const SCAN = ([sel, marks, H]) => {
  const img = document.querySelector(sel);
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const cx = c.getContext('2d');
  cx.drawImage(img, 0, 0);
  const d = cx.getImageData(0, 0, c.width, c.height).data;
  const scale = H / c.height;
  return marks.map((m) => {
    const hit =
      m.kind === 'gold'
        ? (r, g, b) => r > 170 && g > 110 && g < 230 && b < 140 && r - b > 85
        : m.kind === 'purple'
          ? (r, g, b) => b > 108 && b - g > 26 && b - r > 8 && r + g + b > 150
          : m.kind === 'sky'
            ? (r, g, b) => b > 95 && b - g > 22 && r + g + b > 190
            : (r, g, b) => g > 85 && g - r > 22 && g - b > 22;
    const y0 = Math.floor(m.band[0] * c.height);
    const y1 = Math.ceil(m.band[1] * c.height);
    let x0 = m.half === 'right' ? Math.floor(c.width * 0.5) : 0;
    let x1 = m.half === 'left' ? Math.ceil(c.width * 0.5) : c.width;
    if (m.xband) { x0 = Math.floor(m.xband[0] * c.width); x1 = Math.ceil(m.xband[1] * c.width); }
    let minx = 1e9;
    let miny = 1e9;
    let maxx = -1;
    let maxy = -1;
    let n = 0;
    for (let py = y0; py < y1; py++)
      for (let px = x0; px < x1; px++) {
        const i = (py * c.width + px) * 4;
        if (d[i + 3] < 128) continue;
        if (!hit(d[i], d[i + 1], d[i + 2])) continue;
        n++;
        if (px < minx) minx = px;
        if (px > maxx) maxx = px;
        if (py < miny) miny = py;
        if (py > maxy) maxy = py;
      }
    if (n < 12) return { name: m.name, found: false };
    return {
      name: m.name,
      found: true,
      n,
      x: Math.round(minx * scale),
      y: Math.round(miny * scale),
      w: Math.round((maxx - minx) * scale),
      h: Math.round((maxy - miny) * scale),
    };
  });
};

/**
 * A bounding box takes in a glow. The podium's ring throws one, and a warm
 * pool on the floor besides, so its box measured 141pt tall where the ring
 * itself is 61 — and this scene was built with a podium twice as deep as
 * the design's before a column scan caught it. Anything that glows gets
 * measured down a line instead.
 */
const RUNS = ([sel, xpt, kind]) => {
  const img = document.querySelector(sel);
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const cx = c.getContext('2d');
  cx.drawImage(img, 0, 0);
  const d = cx.getImageData(0, 0, c.width, c.height).data;
  const S = c.height / 844;
  const PX = Math.round(xpt * (c.width / 390));
  const out = [];
  let on = false;
  let st = 0;
  for (let y = 340; y < 580; y++) {
    const i = (Math.round(y * S) * c.width + PX) * 4;
    const [r, g, b] = [d[i], d[i + 1], d[i + 2]];
    const hit = kind === 'gold' && r > 170 && g > 110 && g < 230 && b < 140 && r - b > 85;
    if (hit && !on) { on = true; st = y; }
    else if (!hit && on) { on = false; out.push([st, y - 1]); }
  }
  return out;
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
await page.setContent(
  `<body style="margin:0">
     <img id="ref" src="data:image/png;base64,${b64('ref.png')}">
     <img id="mine" src="data:image/png;base64,${b64('studio.png')}">
   </body>`,
);
await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth));

const REF = await page.evaluate(SCAN, ['#ref', MARKS, 844]);
const MINE = await page.evaluate(SCAN, ['#mine', MARKS, 844]);

const fmt = (o) =>
  o.found
    ? `x${String(o.x).padStart(4)} y${String(o.y).padStart(4)} ${String(o.w).padStart(4)}×${String(o.h).padStart(4)}`
    : '     không thấy      ';
console.log(`\n${'landmark'.padEnd(15)}${'GỐC'.padEnd(24)}${'BẢN DỰNG'.padEnd(24)}lệch`);
let worst = 0;
for (let i = 0; i < REF.length; i++) {
  const a = REF[i];
  const b = MINE[i];
  let delta = 'không so được';
  if (a.found && b.found) {
    const d = Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.w - b.w), Math.abs(a.h - b.h));
    worst = Math.max(worst, d);
    delta = `${d}pt${d > 10 ? '  ← LỆCH' : ''}`;
  }
  console.log(`${a.name.padEnd(15)}${fmt(a).padEnd(24)}${fmt(b).padEnd(24)}${delta}`);
}
console.log(`\nlệch lớn nhất: ${worst}pt`);

const ra = await page.evaluate(RUNS, ['#ref', 195, 'gold']);
const rb = await page.evaluate(RUNS, ['#mine', 195, 'gold']);
const ring = (r) => (r.length >= 2 ? `đỉnh y${r[0][0]} · đáy y${r[r.length - 1][1]} → ry ${((r[r.length - 1][1] - r[0][0]) / 2).toFixed(1)}` : 'không đọc được');
console.log(`\nvành bục, quét cột giữa (không tính quầng):`);
console.log(`  GỐC       ${ring(ra)}`);
console.log(`  BẢN DỰNG  ${ring(rb)}`);

if (process.argv.includes('--shot')) {
  const p2 = await browser.newPage({ viewport: { width: 1180, height: 900 } });
  await p2.setContent(
    `<body style="margin:0;background:#111;display:flex;gap:10px;padding:10px;align-items:flex-start">
       <figure style="margin:0"><img src="data:image/png;base64,${b64('ref.png')}" style="height:850px;display:block">
         <figcaption style="color:#9aa;font:11px monospace;text-align:center;padding-top:4px">GỐC</figcaption></figure>
       <figure style="margin:0"><img src="data:image/png;base64,${b64('studio.png')}" style="height:850px;display:block">
         <figcaption style="color:#9aa;font:11px monospace;text-align:center;padding-top:4px">BẢN DỰNG</figcaption></figure>
       <figure style="margin:0"><div style="position:relative;height:850px">
         <img src="data:image/png;base64,${b64('ref.png')}" style="height:850px;display:block">
         <img src="data:image/png;base64,${b64('studio.png')}" style="height:850px;position:absolute;left:0;top:0;opacity:.5">
       </div><figcaption style="color:#9aa;font:11px monospace;text-align:center;padding-top:4px">CHỒNG 50%</figcaption></figure>
     </body>`,
  );
  await p2.waitForTimeout(400);
  await p2.screenshot({ path: path.join(DIR, 'compare.png') });
}
await browser.close();
