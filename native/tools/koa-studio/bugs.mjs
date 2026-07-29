/**
 * The bee and the butterflies, as a filmstrip over the real room.
 *
 * `bugs.tsx` keeps the routes and the flight maths out of `bugs-live.tsx` and
 * free of Reanimated, so this can bundle it and step the *same* `flightAt` the
 * phone runs rather than a copy of it that will drift.
 *
 *   node tools/koa-studio/bugs.mjs <out.png> [frames]
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const OUT = process.argv[2] ?? 'bugs.png';
const FRAMES = Number(process.argv[3] ?? 12);
const dir = mkdtempSync(path.join(tmpdir(), 'koa-bugs-'));

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
writeFileSync(entry, `export * from '@/components/ascnd/studio/bugs';
export { SCENE_BOTTOM, STUDIO_W, C } from '@/components/ascnd/studio/palette';\n`);
execFileSync(
  'npx',
  ['esbuild', entry, '--bundle', '--format=esm', `--alias:react-native-svg=${stub}`,
   '--tsconfig=tsconfig.json', '--jsx=transform', '--jsx-factory=h', '--jsx-fragment=FRAG',
   `--banner:js=${BANNER}`, `--outfile=${path.join(dir, 'b.js')}`],
  { stdio: 'inherit' },
);
const B = await import(pathToFileURL(path.join(dir, 'b.js')));

/* ── element tree → SVG text, the same walk preview.mjs uses ──────────── */

const KEBAB = { strokeWidth: 'stroke-width', strokeLinecap: 'stroke-linecap', fillOpacity: 'fill-opacity' };
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

const BODIES = [B.Bee({}), B.Butterfly({ tint: B.C.soft }), B.Butterfly({ tint: B.C.white, alpha: 0.5 })];
const studio = readFileSync(path.join(dir, 's.svg'), 'utf8')
  .replace(/height="844"/, `height="${B.SCENE_BOTTOM}"`);

/** every insect at clock position t, as one <g> each */
const at = (t) =>
  B.ROUTES.map((r, i) => {
    const f = B.flightAt(r, t);
    if (f.opacity <= 0) return '';
    return `<g transform="matrix(${f.matrix.join(' ')})" opacity="${f.opacity.toFixed(3)}">${render(BODIES[i])}</g>`;
  }).join('');

/* how much of the cycle has anything on screen at all */
let on = 0;
const STEPS = 2000;
for (let i = 0; i < STEPS; i++) {
  const t = i / STEPS;
  if (B.ROUTES.some((r) => B.flightAt(r, t).opacity > 0.02)) on += 1;
}
console.log(`chu kỳ ${B.BUG_PERIOD / 1000}s — có côn trùng trong ${Math.round((on / STEPS) * 100)}% thời gian`);
for (const [i, r] of B.ROUTES.entries()) {
  const secs = (r.span * B.BUG_PERIOD) / 1000;
  // the wingbeat, at 60fps: a wing faster than the frame rate is not fast, it
  // is noise, and the number that catches it is the step between frames
  let worst = 0;
  let prev = null;
  for (let f = 0; f <= secs * 60; f++) {
    const u = f / (secs * 60);
    const sx = 1 - r.fold * (0.5 - 0.5 * Math.cos(2 * Math.PI * u * r.beats));
    if (prev !== null) worst = Math.max(worst, Math.abs(sx - prev));
    prev = sx;
  }
  const holds = r.stops.filter((s) => s.hold > 0);
  const total = r.stops.reduce((n, s) => n + s.leg + s.hold, 0);
  const rest = holds.reduce((n, s) => n + (s.hold / total) * secs, 0);
  console.log(
    `  #${i} bay ${secs.toFixed(1)}s từ giây ${((r.phase * B.BUG_PERIOD) / 1000).toFixed(1)} — ` +
      `vỗ cánh ${(r.beats / secs).toFixed(1)}Hz, bước lớn nhất giữa 2 khung ${(worst * 100).toFixed(0)}%` +
      `, đậu ${holds.length} chỗ tổng ${rest.toFixed(1)}s`,
  );
}

/**
 * Frames are sampled *inside each insect's own window*, not evenly across the
 * cycle. Evenly is what the room actually looks like — mostly empty — and it
 * is useless for judging a flight: two thirds of the strip came out with
 * nothing in it.
 */
const cells = [];
for (const [i, r] of B.ROUTES.entries()) {
  for (let f = 0; f < FRAMES; f++) {
    const t = (r.phase + (r.span * (f + 0.5)) / FRAMES) % 1;
    const svg = studio.replace('</svg>', at(t) + '</svg>');
    cells.push(`<div><div style="color:#777;font:10px system-ui;padding:2px">#${i} ${(f / FRAMES * 100).toFixed(0)}%</div>
      <div style="width:${B.STUDIO_W / 2}px;height:${B.SCENE_BOTTOM / 2}px;overflow:hidden">
        <div style="transform:scale(0.5);transform-origin:0 0">${svg}</div></div></div>`);
  }
}

const html = path.join(dir, 'b.html');
writeFileSync(
  html,
  `<body style="margin:0;background:#000;display:flex;flex-wrap:wrap;gap:6px;padding:8px">${cells.join('')}</body>`,
);
const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: (B.STUDIO_W / 2 + 6) * 4 + 20, height: 1200 }, deviceScaleFactor: 2 });
await page.goto(pathToFileURL(html).href);
await page.waitForTimeout(300);
await page.screenshot({ path: OUT, fullPage: true });
await browser.close();
console.log(`\n${OUT}`);
