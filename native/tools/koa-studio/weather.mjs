/**
 * The window's weather: clear, a few clouds, overcast, and rain.
 *
 * `clouds.tsx` keeps the shapes, the drifts and `cloudAt` free of Reanimated,
 * so this steps the *same* arithmetic `sky-live.tsx` runs on the phone. Only
 * the cloud's colour is Reanimated's `interpolateColor`, and it is a plain
 * lerp between two hex values, restated here — the one thing in this tool that
 * can drift from the app.
 *
 *   node tools/koa-studio/weather.mjs <out.png>
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const OUT = process.argv[2] ?? 'weather.png';
const dir = mkdtempSync(path.join(tmpdir(), 'koa-wx-'));

execFileSync('node', ['tools/koa-studio/preview.mjs', path.join(dir, 's.png')], { stdio: 'ignore' });

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
writeFileSync(entry, `export * from '@/components/ascnd/studio/clouds';
export { GLASS, MULLIONS } from '@/components/ascnd/studio/window';
export { C, SCENE_BOTTOM, STUDIO_W } from '@/components/ascnd/studio/palette';\n`);
execFileSync(
  'npx',
  ['esbuild', entry, '--bundle', '--format=esm', `--alias:react-native-svg=${stub}`,
   '--tsconfig=tsconfig.json', '--jsx=transform', '--jsx-factory=h', '--jsx-fragment=FRAG',
   `--banner:js=${BANNER}`, `--outfile=${path.join(dir, 'c.js')}`],
  { stdio: 'inherit' },
);
const B = await import(pathToFileURL(path.join(dir, 'c.js')));

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

/** Reanimated's `interpolateColor` on two hex values is this */
const mix = (a, b, k) => {
  const ch = (h, i) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  return (
    '#' +
    [0, 1, 2]
      .map((i) => Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * k).toString(16).padStart(2, '0'))
      .join('')
  );
};

const studio = readFileSync(path.join(dir, 's.svg'), 'utf8')
  .replace(/height="844"/, `height="${B.SCENE_BOTTOM}"`);

const CLOUD_BODIES = B.DRIFTS.map((d) => render(B.Cloud({ w: d.w })));
const SHEET_BODIES = B.SHEETS.map((s) => render(B.RainSheet({ s })));

/**
 * The two numbers `sky-live.tsx` computes that are not in `clouds.tsx`, and so
 * have to be restated here: the cloud's wet colour and its wet weight. Keep
 * them in step with `RAIN_CLOUD` / `WET_BODY`.
 */
const RAIN_CLOUD = B.C.primary;
const WET_BODY = 2.8;

const sky = (t, cover, wet) => {
  const clip = `<defs><clipPath id="wxGlass"><rect x="${B.GLASS.x}" y="${B.GLASS.y}" width="${B.GLASS.w}" height="${B.GLASS.h}" rx="${B.GLASS.r}"/></clipPath></defs>`;
  const clouds = B.DRIFTS.map((d, i) => {
    const c = B.cloudAt(d, t, cover);
    const o = Math.min(0.92, c.opacity * (1 + wet * (WET_BODY - 1)));
    if (o <= 0.001) return '';
    return `<g transform="matrix(${c.matrix.join(' ')})" opacity="${o.toFixed(3)}" fill="${mix(B.C.soft, RAIN_CLOUD, wet)}">${CLOUD_BODIES[i]}</g>`;
  }).join('');
  const rain =
    wet > 0.01
      ? B.SHEETS.map(
          (s, i) =>
            `<g transform="matrix(1 0 0 1 0 ${(((t * s.speed) % 1) * s.tile).toFixed(2)})" opacity="${(wet * s.alpha).toFixed(3)}" stroke="${B.C.soft}">${SHEET_BODIES[i]}</g>`,
        ).join('')
      : '';
  const bars = B.MULLIONS.map(([x, y, w, h]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${B.C.primary}"/>`).join('');
  return `${clip}<g clip-path="url(#wxGlass)">${clouds}${rain}</g>${bars}`;
};

const SKIES = [
  ['trời quang', 0, 0],
  ['ít mây', 0.45, 0],
  ['nhiều mây', 0.85, 0],
  ['mưa', 1, 1],
];

/** how much of the glass each sky covers, so "a few" is not "overcast" */
const cells = [];
for (const [label, cover, wet] of SKIES) {
  for (const t of [0.1, 0.45, 0.8]) {
    const svg = studio.replace('</svg>', sky(t, cover, wet) + '</svg>');
    cells.push(`<div><div style="color:#888;font:11px system-ui;padding:3px">${label} · t=${t}</div>
      <div style="width:200px;height:190px;overflow:hidden">
        <div style="transform:scale(1.6);transform-origin:0 0;margin-left:-430px;margin-top:-140px">${svg}</div>
      </div></div>`);
  }
}

const html = path.join(dir, 'w.html');
writeFileSync(
  html,
  `<body style="margin:0;background:#000;display:flex;flex-wrap:wrap;gap:8px;padding:10px;width:680px">${cells.join('')}</body>`,
);
const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 680, height: 900 }, deviceScaleFactor: 2 });
await page.goto(pathToFileURL(html).href);
await page.waitForTimeout(300);
await page.screenshot({ path: OUT, fullPage: true });
await browser.close();

const SKY_PERIOD = 45; // sky-live.tsx's PERIOD, in seconds

for (const [label, cover, wet] of SKIES) {
  const on = B.DRIFTS.filter((d) => B.cloudAt(d, 0, cover).opacity > 0.01).length;
  const a = B.cloudAt(B.DRIFTS[0], 0, Math.max(cover, 0.4));
  const o = Math.min(0.92, a.opacity * (1 + wet * (WET_BODY - 1)));
  console.log(
    `  ${label.padEnd(11)} ${on} đám mây   màu ${mix(B.C.soft, RAIN_CLOUD, wet)}  đậm ${(o * 100).toFixed(0)}%`,
  );
}

/**
 * Whether the rain is still a comb.
 *
 * The complaint was that it fell too evenly, and the cause was structural: a
 * sheet that wraps by its own drop spacing forces every column to be identical
 * drops at identical intervals. So the thing to report is the gaps down a
 * single column — one distinct gap is a comb however the columns are jittered
 * against each other, and it is the number the previous version would have
 * printed.
 */
console.log('\nmưa — mỗi lớp một độ sâu:');
let combs = 0;
for (const s of B.SHEETS) {
  const speed = (s.tile * s.speed) / SKY_PERIOD;
  // the drop offsets within one tile, for one column, as `RainSheet` lays them
  const gaps = [];
  for (let c = 0; c < s.columns; c++) {
    const offs = [];
    for (let i = 0; i < s.per; i++) {
      const h = Math.abs(Math.sin((c * 7.3 + i * 31.7) * 12.9898) * 43758.5453) % 1;
      offs.push(((i + 0.35 + 0.5 * h) / s.per) * s.tile);
    }
    offs.sort((p, q) => p - q);
    for (let i = 0; i < offs.length; i++) {
      gaps.push(i === 0 ? offs[0] + s.tile - offs[offs.length - 1] : offs[i] - offs[i - 1]);
    }
  }
  const uniq = new Set(gaps.map((g) => g.toFixed(1))).size;
  if (uniq < 2) combs++;
  const lo = Math.min(...gaps);
  const hi = Math.max(...gaps);
  console.log(
    `  ô ${String(s.tile).padStart(2)}  rơi ${speed.toFixed(0)} đv/s  ` +
    `${(speed / 60).toFixed(1)} đv mỗi khung hình  ` +
    `khoảng cách giọt ${lo.toFixed(1)}–${hi.toFixed(1)} (${uniq} giá trị khác nhau)`,
  );
}
console.log(
  combs === 0
    ? '  không lớp nào rơi đều nhịp'
    : `  ${combs} lớp vẫn là lược — mọi giọt cách nhau như nhau`,
);

console.log(`\n${OUT}`);
