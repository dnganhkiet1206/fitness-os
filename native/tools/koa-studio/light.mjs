/**
 * The scene's tonal structure, not its coordinates.
 *
 * The screenshot is not an iPhone aspect, so matching positions out of it is
 * the wrong idea — a landmark table can read 4pt everywhere while the room
 * still looks nothing like the design. What carries over is how the room is
 * lit: where it is bright, how fast it falls to the edges, how warm the
 * light is at the lamp, and how far the props sit below the centre.
 *
 * Everything is sampled as a fraction of the stage box, so it does not care
 * what either image's aspect is.
 *
 *   node tools/koa-studio/light.mjs <dir>
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

// ref.png = the design screenshot, stage.png = the stage as the app builds it
const DIR = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '.';
const { chromium } = createRequire(import.meta.url)('playwright');
const b64 = (f) => readFileSync(path.join(DIR, f)).toString('base64');

/** everything is sampled inside the stage box: the top 490pt of 844 */
const PROBE = ([sel, stagePt]) => {
  const img = document.querySelector(sel);
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const cx = c.getContext('2d');
  cx.drawImage(img, 0, 0);
  const d = cx.getImageData(0, 0, c.width, c.height).data;
  // the image's own pt scale: width is always 390pt
  const S = c.width / 390;
  const H = Math.min(c.height, Math.round(stagePt * S));
  const at = (xf, yf) => {
    const px = Math.max(0, Math.min(c.width - 1, Math.round(xf * c.width)));
    const py = Math.max(0, Math.min(H - 1, Math.round(yf * H)));
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (let dy = -3; dy <= 3; dy++)
      for (let dx = -3; dx <= 3; dx++) {
        const y = Math.max(0, Math.min(H - 1, py + dy));
        const x = Math.max(0, Math.min(c.width - 1, px + dx));
        const i = (y * c.width + x) * 4;
        r += d[i];
        g += d[i + 1];
        b += d[i + 2];
        n++;
      }
    return [r / n, g / n, b / n];
  };
  const L = (p) => (p[0] + p[1] + p[2]) / 3;
  /** how warm: red minus blue */
  const W = (p) => p[0] - p[2];

  return {
    // the cone, down the middle
    cone: [0.16, 0.3, 0.46, 0.62].map((y) => +L(at(0.5, y)).toFixed(1)),
    coneWarm: [0.16, 0.3, 0.46].map((y) => +W(at(0.5, y)).toFixed(1)),
    // the vignette: centre out to the edge, across the middle of the wall
    across: [0.02, 0.12, 0.28, 0.5, 0.72, 0.88, 0.98].map((x) => +L(at(x, 0.3)).toFixed(1)),
    // corners against the centre
    corners: [
      +L(at(0.04, 0.05)).toFixed(1),
      +L(at(0.96, 0.05)).toFixed(1),
      +L(at(0.04, 0.95)).toFixed(1),
      +L(at(0.96, 0.95)).toFixed(1),
    ],
    centre: +L(at(0.5, 0.42)).toFixed(1),
  };
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 600, height: 400 } });
await page.setContent(
  `<body style="margin:0">
     <img id="ref" src="data:image/png;base64,${b64('ref.png')}">
     <img id="mine" src="data:image/png;base64,${b64('stage.png')}">
   </body>`,
);
await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth));

const A = await page.evaluate(PROBE, ['#ref', 490]);
const B = await page.evaluate(PROBE, ['#mine', 476]);
await browser.close();

const row = (name, a, b) =>
  console.log(`${name.padEnd(26)}${JSON.stringify(a).padEnd(30)}${JSON.stringify(b)}`);
console.log(`${''.padEnd(26)}${'GỐC'.padEnd(30)}BẢN DỰNG`);
row('chùm sáng (dọc giữa)', A.cone, B.cone);
row('  độ ấm (đỏ − lam)', A.coneWarm, B.coneWarm);
row('ngang tường (trái→phải)', A.across, B.across);
row('4 góc', A.corners, B.corners);
row('tâm sân khấu', A.centre, B.centre);
const vig = (o) => (o.corners.reduce((s, v) => s + v, 0) / 4 / o.centre).toFixed(2);
console.log(`\nvignette (góc ÷ tâm):        GỐC ${vig(A)}                          BẢN DỰNG ${vig(B)}`);
const edge = (o) => ((o.across[0] + o.across[6]) / 2 / o.across[3]).toFixed(2);
console.log(`tối rìa   (rìa ÷ giữa):      GỐC ${edge(A)}                          BẢN DỰNG ${edge(B)}`);
