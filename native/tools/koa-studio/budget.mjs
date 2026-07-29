/**
 * What the room costs to redraw, and whether anything falls outside its canvas.
 *
 * `react-native-svg` rasterises a whole `<Svg>` again whenever any child prop
 * changes, so the price of one animated group is **the area of its canvas times
 * everything else on that canvas**. The room was two full-screen canvases
 * carrying about two hundred shapes between them, redrawn sixty times a second
 * so that six stars could blink inside a window covering five percent of it.
 *
 * That is a number, and this prints it: for each canvas, the fraction of the
 * room it covers times the shapes on it, summed. It is a proxy and not
 * milliseconds — but it is the proxy the two earlier performance fixes in this
 * room were both reasoned from, and it is the one that says why "shape count is
 * not the cost, covered area is".
 *
 * It also checks the thing that makes the split dangerous. A canvas smaller
 * than its contents does not warn you, **it clips them** — the same failure as
 * the mascot losing its ears to its own viewBox. So every layer's shapes are
 * rendered and measured, the motion's amplitude is added, and the result is
 * compared against the region it was given.
 *
 *   node tools/koa-studio/budget.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(path.join(tmpdir(), 'koa-budget-'));

const stub = path.join(dir, 'rnsvg.js');
writeFileSync(
  stub,
  ['Svg', 'G', 'Path', 'Rect', 'Circle', 'Ellipse', 'Line', 'Text', 'TSpan', 'Defs', 'ClipPath',
   'LinearGradient', 'RadialGradient', 'Stop', 'Polygon', 'Polyline']
    .map((n) => `export const ${n} = ${JSON.stringify(n === 'Svg' ? 'svg' : n[0].toLowerCase() + n.slice(1))};`)
    .join('\n') + '\nexport default "svg";\n',
);
const BANNER = [
  "const FRAG = '#fragment';",
  'const h = (type, props, ...kids) => ({ type, props: { ...(props || {}),',
  '  children: kids.length ? (kids.length === 1 ? kids[0] : kids) : (props && props.children) } });',
].join('\n');
const entry = path.join(dir, 'e.tsx');
writeFileSync(
  entry,
  `export * from '@/components/ascnd/studio/live-regions';
   export * from '@/components/ascnd/studio/motes';
   export * from '@/components/ascnd/studio/clouds';
   export { Bee, Butterfly, ROUTES } from '@/components/ascnd/studio/bugs';
   export { PlantFoliage, PlantPot } from '@/components/ascnd/studio/plant';
   export { PLANTS } from '@/components/ascnd/studio/plants';
   export { STAGE_GLOW } from '@/components/ascnd/studio/platform';
   export { CX, MOUTH_R, MOUTH_Y } from '@/components/ascnd/studio/spotlight';
   export { GLASS, STAR_POINTS } from '@/components/ascnd/studio/window';
   export { STUDIO_W, SCENE_BOTTOM } from '@/components/ascnd/studio/palette';
`,
);
execFileSync(
  'npx',
  ['esbuild', entry, '--bundle', '--format=esm', `--alias:react-native-svg=${stub}`,
   '--tsconfig=tsconfig.json', '--jsx=transform', '--jsx-factory=h', '--jsx-fragment=FRAG',
   `--banner:js=${BANNER}`, `--outfile=${path.join(dir, 'b.js')}`],
  { stdio: 'inherit' },
);
const B = await import(pathToFileURL(path.join(dir, 'b.js')));

const KEBAB = {
  strokeWidth: 'stroke-width',
  strokeLinecap: 'stroke-linecap',
  strokeOpacity: 'stroke-opacity',
};
function render(node) {
  if (node == null || node === false || node === true) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(render).join('');
  const { type, props } = node;
  if (typeof type === 'function') return render(type(props ?? {}));
  if (type === '#fragment' || typeof type !== 'string') return render(props?.children);
  const attrs = Object.entries(props ?? {})
    .filter(([k]) => k !== 'children' && k !== 'key')
    .map(([k, v]) => `${KEBAB[k] ?? k}="${v}"`)
    .join(' ');
  const kids = render(props?.children);
  return kids ? `<${type} ${attrs}>${kids}</${type}>` : `<${type} ${attrs}/>`;
}

/**
 * What sits on each canvas, and how far it moves off where it is drawn.
 *
 * The shapes come from the real modules; the `reach` is the animation's
 * amplitude, which is the part a static render cannot know. Where the amplitude
 * is itself exported — the motes' sway — it is read rather than typed.
 */
const el = (t, a) => ({ type: t, props: a });

/** how often the sky rolls wet, from `sky-live.tsx`'s own weights */
const RAIN_DUTY = 1.6 / (3 + 4 + 2 + 1.6);
/** the expected number of insects on screen — the spans sum to it */
const BUG_DUTY = B.ROUTES.reduce((n, r) => n + r.span, 0);

const LAYERS = [
  {
    region: B.SKY,
    reach: 0,
    parts: [
      {
        duty: 1,
        body: [
          ...B.STAR_POINTS.map(([x, y, r]) => el('circle', { cx: x, cy: y, r })),
          ...B.DRIFTS.map((d) => {
            const c = B.cloudAt(d, 0.5, 1);
            return el('g', { transform: `matrix(${c.matrix.join(' ')})`, children: B.Cloud({ w: d.w }) });
          }),
        ],
      },
      { duty: RAIN_DUTY, body: B.SHEETS.map((s) => B.RainSheet({ s })) },
    ],
    /** the sky is clipped to the glass by `LiveSky`, so nothing can leave it */
    clipped: true,
  },
  {
    region: B.BEAM,
    reach: B.MOTE_REACH,
    parts: [
      {
        duty: 1,
        body: [
          el('ellipse', { cx: B.CX, cy: B.MOUTH_Y + 1, rx: B.MOUTH_R + 6, ry: 7 }),
          B.Specks({ list: B.MOTES }),
        ],
      },
    ],
  },
  {
    region: B.BUGS,
    reach: 0,
    // One insect, at its duty. `BUG_DUTY` is the sum of the spans, which *is*
    // the expected number on screen — they overlap rarely and the sum accounts
    // for it exactly.
    parts: [{ duty: BUG_DUTY, body: [el('g', { children: B.Butterfly({}) })] }],
    // An insect enters from outside the room and leaves the same way; those
    // stops sit at x −16 and y −18 on purpose, and were clipped by the old
    // full-artboard canvas exactly as they are by this one. Nothing on a route
    // goes below y 330, so the room's own bottom edge costs nothing either.
    clipped: true,
  },
  {
    region: B.STAGE,
    reach: 0,
    parts: [{ duty: 1, body: [el('ellipse', { ...B.STAGE_GLOW })] }],
  },
  ...B.PLANTS.map((p, i) => ({
    region: B.PLANT_REGIONS[i],
    // the sway is a rotation, so the reach is already inside the region's own
    // margin — see `live-regions.ts`
    reach: 0,
    parts: [
      {
        duty: 1,
        body: [
          el('g', {
            transform: `translate(${p.x} ${p.y}) scale(${p.s})`,
            children: [B.PlantFoliage({ kind: p.kind }), B.PlantPot({})],
          }),
        ],
      },
    ],
  })),
];

/* ── measure ──────────────────────────────────────────────────────────── */

// one measured group per part, so a part's shape count and the layer's overall
// extent both come out of the same render
const PARTS = LAYERS.flatMap((l, i) => l.parts.map((p, j) => ({ l, i, j, p })));
const cells = PARTS.map(
  ({ p }, k) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-200 -200 900 1000" width="900" height="1000">` +
    `<g id="C${k}">${render(p.body)}</g></svg>`,
).join('');
const html = path.join(dir, 'b.html');
writeFileSync(html, `<body style="margin:0">${cells}</body>`);

/**
 * The other half of the check: does a region canvas land on exactly the pixels
 * the full-screen canvas did?
 *
 * Splitting is only free if `LiveLayer`'s arithmetic reproduces the parent
 * stack's `xMidYMin slice` mapping exactly, and it very nearly does not.
 * `region · k` is almost never a whole number, so a canvas laid out at 118.65pt
 * rasterises against a grid half a pixel off the one the whole-room canvas
 * used: 4,940 of 48,000 inked pixels differed, all of them a hairline along
 * every edge in the room. Snapping the view to whole points and solving the
 * viewBox back out of it takes that to one pixel, at a difference of 7.
 *
 * So this draws the same layers both ways at a real device width and counts.
 */
const SW = 361; // an iPhone 15 less the page's 32pt of padding
const kk = SW / B.STUDIO_W;
const HH = Math.round((SW * B.SCENE_BOTTOM) / B.STUDIO_W);
const drawn = LAYERS.map((l) => [l.region, l.parts.map((p) => render(p.body)).join('')]);
const whole =
  `<svg width="${SW}" height="${HH}" viewBox="0 0 ${B.STUDIO_W} 844" ` +
  `preserveAspectRatio="xMidYMin slice" style="position:absolute;left:0;top:0">` +
  drawn.map(([, b]) => b).join('') + `</svg>`;
const split = drawn
  .map(([r, body]) => {
    const left = Math.floor(r.x * kk);
    const top = Math.floor(r.y * kk);
    const w = Math.ceil((r.x + r.w) * kk) - left;
    const h = Math.ceil((r.y + r.h) * kk) - top;
    return (
      `<div style="position:absolute;left:${left}px;top:${top}px;width:${w}px;height:${h}px;overflow:hidden">` +
      `<svg width="${w}" height="${h}" viewBox="${left / kk} ${top / kk} ${w / kk} ${h / kk}">${body}</svg></div>`
    );
  })
  .join('');
const frame = (inner) =>
  `<body style="margin:0"><div style="position:relative;width:${SW}px;height:${HH}px;background:#000">${inner}</div></body>`;
writeFileSync(path.join(dir, 'whole.html'), frame(whole));
writeFileSync(path.join(dir, 'split.html'), frame(split));

const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(pathToFileURL(html).href);
const boxes = await page.evaluate(() =>
  [...document.querySelectorAll('[id^="C"]')].map((g) => {
    const b = g.getBBox();
    return [b.x, b.y, b.x + b.width, b.y + b.height, g.querySelectorAll('circle,ellipse,path,line,rect').length];
  }),
);
const shots = [];
for (const f of ['whole.html', 'split.html']) {
  const pg = await browser.newPage({ viewport: { width: SW, height: HH }, deviceScaleFactor: 2 });
  await pg.goto(pathToFileURL(path.join(dir, f)).href);
  await pg.waitForTimeout(120);
  shots.push((await pg.screenshot()).toString('base64'));
  await pg.close();
}
const same = await page.evaluate(async ([a, b]) => {
  const load = (u) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = u; });
  const [ia, ib] = await Promise.all([load(a), load(b)]);
  const px = (im) => { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
    const x = c.getContext('2d'); x.drawImage(im, 0, 0); return x.getImageData(0, 0, c.width, c.height).data; };
  const A = px(ia), B2 = px(ib);
  let diff = 0, ink = 0, worst = 0;
  for (let i = 0; i < A.length; i += 4) {
    const d = Math.max(Math.abs(A[i]-B2[i]), Math.abs(A[i+1]-B2[i+1]), Math.abs(A[i+2]-B2[i+2]));
    if (A[i]+A[i+1]+A[i+2] > 12) ink++;
    if (d > 6) diff++;
    if (d > worst) worst = d;
  }
  return { diff, ink, worst };
}, shots.map((s) => 'data:image/png;base64,' + s));
await browser.close();

/* ── report ───────────────────────────────────────────────────────────── */

const pct = (v) => `${(v * 100).toFixed(1)}%`;
let after = 0;
let beforeCost = 0;
let peak = 0;
let bad = 0;

console.log('canvas   vùng                  phủ    hình  lúc nào   giá  chứa hết?');
LAYERS.forEach((l) => {
  const r = l.region;
  const a = B.areaOf(r);
  const mine = PARTS.map((p, k) => ({ ...p, box: boxes[k] })).filter((p) => p.l === l);
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const { p, box } of mine) {
    const [bx0, by0, bx1, by1, n] = box;
    x0 = Math.min(x0, bx0);
    y0 = Math.min(y0, by0);
    x1 = Math.max(x1, bx1);
    y1 = Math.max(y1, by1);
    after += a * n * p.duty;
    // what the same shapes cost on a canvas the size of the screen, mounted
    // whatever the weather — which is what they were
    beforeCost += n;
    peak += n;
    console.log(
      `${(p === mine[0].p ? r.id : '').padEnd(8)} ` +
      `${(p === mine[0].p ? `${r.w}×${r.h} @${r.x},${r.y}` : '').padEnd(20)} ` +
      `${(p === mine[0].p ? pct(a) : '').padStart(6)} ${String(n).padStart(6)} ` +
      `${pct(p.duty).padStart(7)} ${(a * n * p.duty).toFixed(2).padStart(6)}`,
    );
  }
  const fits =
    l.clipped ||
    (x0 - l.reach >= r.x - 0.5 &&
      y0 - l.reach >= r.y - 0.5 &&
      x1 + l.reach <= r.x + r.w + 0.5 &&
      y1 + l.reach <= r.y + r.h + 0.5);
  if (!fits) {
    bad++;
    console.log(
      `         THIẾU — nội dung (${x0.toFixed(1)}, ${y0.toFixed(1)}) → (${x1.toFixed(1)}, ${y1.toFixed(1)})` +
      ` cộng ${l.reach} biên độ`,
    );
  }
});

console.log(
  `\ntrước — 2 canvas cả màn hình, ${peak} hình luôn có mặt:  giá ${beforeCost.toFixed(1)}` +
  `\nsau   — ${LAYERS.length} canvas theo vùng, dựng khi cần:      giá ${after.toFixed(1)}` +
  `   (còn ${pct(after / beforeCost)}, nhẹ hơn ${(beforeCost / after).toFixed(0)}×)`,
);

console.log(
  `\nvẽ tách có trùng khớp vẽ liền không (${SW}pt, k=${kk.toFixed(4)}):` +
  `\n  ${same.diff}/${same.ink} pixel có mực lệch quá 6, đỉnh lệch ${same.worst}`,
);

const off = same.diff > same.ink * 0.001;
console.log(
  bad === 0 && !off
    ? '\nkhông lớp nào bị cắt, và tách canvas không xê dịch gì'
    : `\n${bad} lớp tràn khỏi canvas${off ? ', và vẽ tách lệch khỏi vẽ liền' : ''}`,
);
process.exit(bad === 0 && !off ? 0 : 1);
