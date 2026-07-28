/**
 * Render Koa on its own, with the studio's lamp applied and without it, and
 * report how much light each part is getting.
 *
 * The shading lives in `koa-light.ts` and is folded into the fills, so it is
 * not something a screenshot of the room can isolate — this bundles the real
 * module and asks it directly, then draws both figures side by side.
 *
 *   node tools/koa-import/figure.mjs <out.png>
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const OUT = process.argv[2] ?? 'koa.png';
const dir = mkdtempSync(path.join(tmpdir(), 'koa-figure-'));

const entry = path.join(dir, 'entry.ts');
writeFileSync(
  entry,
  `export { NODES, KEYFRAMES } from '@/components/ascnd/koa/koa-scene';
   export { koaFlags } from '@/components/ascnd/koa/koa-flags';
   export { litProps, shadeAt, rampsFor } from '@/components/ascnd/koa/koa-light';
`,
);
execFileSync(
  'npx',
  ['esbuild', entry, '--bundle', '--format=esm', '--tsconfig=tsconfig.json', `--outfile=${path.join(dir, 'koa.js')}`],
  { stdio: 'inherit' },
);
const { NODES, koaFlags, litProps, shadeAt, rampsFor } = await import(pathToFileURL(path.join(dir, 'koa.js')));

/* ── the same static render `verify.mjs` uses, minus the animation ────── */

const I = [1, 0, 0, 1, 0, 0];
const mul = (m, n) => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];
function opMat(op) {
  if (op[0] === 'r') {
    const r = (op[1] * Math.PI) / 180;
    const c = Math.cos(r);
    const s = Math.sin(r);
    const m = [c, s, -s, c, 0, 0];
    return op.length === 4
      ? mul(mul([1, 0, 0, 1, op[2], op[3]], m), [1, 0, 0, 1, -op[2], -op[3]])
      : m;
  }
  if (op[0] === 't') return [1, 0, 0, 1, op[1], op[2]];
  return [op[1], 0, 0, op[2], 0, 0];
}
function opsMat(ops, ox = 0, oy = 0) {
  if (!ops || !ops.length) return null;
  let m = I;
  for (const o of ops) m = mul(m, opMat(o));
  return ox || oy ? mul(mul([1, 0, 0, 1, ox, oy], m), [1, 0, 0, 1, -ox, -oy]) : m;
}

function render(n, flags, lit) {
  if (n.if && !flags[n.if]) return '';
  const kids = (n.kids || []).map((k) => render(k, flags, lit)).join('');
  if (n.t === 'defs') return `<defs>${kids}</defs>`;
  if (n.t === 'clipPath') return `<clipPath id="${n.id}">${kids}</clipPath>`;
  const a = lit ? litProps(n, { ...(n.a || {}) }) : n.a || {};
  const attr = Object.entries(a).map(([k, v]) => `${k}="${v}"`).join(' ');
  const isShape = n.t !== 'g';
  const body = isShape ? `<${n.t} ${attr}/>` : kids;
  const m = opsMat([...(n.tr ? [['t', n.tr[0], n.tr[1]]] : []), ...(n.tf || [])],
                   n.o ? n.o[0] : 0, n.o ? n.o[1] : 0);
  const g = isShape ? '' : attr;
  if (m) return `<g ${g} transform="matrix(${m.join(' ')})">${body}</g>`;
  return g ? `<g ${g}>${body}</g>` : body;
}

const flags = koaFlags('happy', 'idle', undefined);
const RAMPS = rampsFor(koaFlags('happy', 'idle', undefined));
const defs =
  '<defs>' + RAMPS.map((r) =>
    `<linearGradient id="${r.id}" gradientUnits="userSpaceOnUse" x1="${r.x1}" y1="${r.y1}" x2="${r.x2}" y2="${r.y2}">` +
    r.stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('') + '</linearGradient>').join('') + '</defs>';
const svg = (lit) =>
  `<svg viewBox="0 0 240 300" width="240" height="300" xmlns="http://www.w3.org/2000/svg">` +
  (lit ? defs : '') +
  NODES.map((n) => render(n, flags, lit)).join('') +
  `</svg>`;

/* ── what the lamp gives each part ────────────────────────────────────── */

// the ramp at the heights the parts actually occupy, as a % of the artwork
const BANDS = [
  ['đỉnh tai', 40], ['chân tai', 110], ['đỉnh đầu', 34], ['cằm', 168],
  ['vai', 180], ['bụng', 215], ['chân', 255], ['bàn chân', 275],
];
console.log(`${RAMPS.length} dải sáng — ánh sáng theo chiều cao`);
for (const [label, y] of BANDS) {
  console.log(`  ${label.padEnd(10)} ${Math.round(shadeAt(y) * 100)}%`);
}

const { chromium } = createRequire(import.meta.url)('playwright');
const html = path.join(dir, 'koa.html');
writeFileSync(
  html,
  `<body style="margin:0;background:#1b1730;display:flex;gap:24px;padding:20px;color:#888;font:12px system-ui">
     <div><div style="padding-bottom:6px">KHÔNG ĐÈN</div>${svg(false)}</div>
     <div><div style="padding-bottom:6px">CÓ ĐÈN</div>${svg(true)}</div>
   </body>`,
);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 570, height: 360 }, deviceScaleFactor: 2 });
await page.goto(pathToFileURL(html).href);
await page.waitForTimeout(200);
await page.screenshot({ path: OUT });
await browser.close();
console.log(`\n${OUT}`);
