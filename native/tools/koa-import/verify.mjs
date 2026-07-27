/**
 * Check the generated scene against the design export, element by element.
 *
 * Renders the export in a real browser with its animations frozen at a given
 * clock, renders `koa-scene.ts` + `koa-flags.ts` at the same clock through
 * the same maths `koa-figure.tsx` uses, and compares every shape's screen
 * box, effective opacity, fill, stroke and clip. A pose or an item that
 * drifts shows up as a named shape and a pixel distance instead of as
 * "something looks off".
 *
 * This exists because eyeballing screenshots got the running pose rebuilt
 * from scratch once, wrongly, and because four separate CSS rules were being
 * broken at the same time with no way to see it.
 *
 *   npm i -D playwright esbuild && npx playwright install chromium
 *   node tools/koa-import/verify.mjs path/to/Koa.dc.html [--quick]
 *
 * Exits non-zero if anything differs.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SRC = process.argv[2];
const QUICK = process.argv.includes('--quick');
if (!SRC) {
  console.error('usage: node tools/koa-import/verify.mjs <Koa.dc.html> [--quick]');
  process.exit(2);
}

// `require` so a globally installed playwright is found too
const { chromium } = createRequire(import.meta.url)('playwright');
const out = mkdtempSync(path.join(tmpdir(), 'koa-verify-'));
execFileSync(
  'npx',
  ['esbuild', 'src/components/ascnd/koa/koa-scene.ts', 'src/components/ascnd/koa/koa-flags.ts',
   '--format=esm', `--outdir=${out}`],
  { stdio: 'ignore' },
);
const { KEYFRAMES, NODES } = await import(pathToFileURL(path.join(out, 'koa-scene.js')));
const { koaFlags, KOA_EXPRESSIONS, KOA_POSES, KOA_SLOTS, KOA_ITEMS } = await import(
  pathToFileURL(path.join(out, 'koa-flags.js'))
);

/* ── the export, with its bindings resolved ───────────────────────────── */

const raw = readFileSync(SRC, 'utf8');
const STYLE = raw.slice(raw.indexOf('<style>') + 7, raw.indexOf('</style>'));
const SVG = raw.slice(raw.indexOf('<svg'), raw.indexOf('</svg>') + 6);

function truth(flags) {
  let s = SVG;
  for (;;) {
    const i = s.indexOf('<sc-if');
    if (i < 0) break;
    const gt = s.indexOf('>', i);
    const flag = /value="\{\{\s*(\w+)\s*\}\}"/.exec(s.slice(i, gt + 1))[1];
    const end = s.indexOf('</sc-if>', gt);
    s = s.slice(0, i) + (flags[flag] ? s.slice(gt + 1, end) : '') + s.slice(end + 8);
  }
  return s
    .replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (flags[k] == null ? '' : String(flags[k])))
    .replace('<svg ', '<svg width="240" height="300" ');
}

/* ── the port: koa-figure.tsx's maths, to static SVG ──────────────────── */

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
    if (op.length === 4) return mul(mul([1, 0, 0, 1, op[2], op[3]], m), [1, 0, 0, 1, -op[2], -op[3]]);
    return m;
  }
  if (op[0] === 't') return [1, 0, 0, 1, op[1], op[2]];
  return [op[1], 0, 0, op[2], 0, 0];
}
function opsMat(ops, ox = 0, oy = 0) {
  if (!ops || !ops.length) return I;
  let m = I;
  for (const o of ops) m = mul(m, opMat(o));
  return ox || oy ? mul(mul([1, 0, 0, 1, ox, oy], m), [1, 0, 0, 1, -ox, -oy]) : m;
}
function bezier(t, ax, bx, cx, ay, by, cy) {
  let s = t;
  for (let i = 0; i < 5; i++) {
    const d = (3 * ax * s + 2 * bx) * s + cx;
    if (d < 1e-6 && d > -1e-6) break;
    s -= (((ax * s + bx) * s + cx) * s - t) / d;
  }
  return ((ay * s + by) * s + cy) * s;
}
const ease = (t, k) =>
  k === 'lin' ? t : k === 'out' ? bezier(t, -0.74, 1.74, 0, -2, 3, 0) : bezier(t, 0.52, -0.78, 1.26, -2, 3, 0);
function span(fr, t, k) {
  let i = 0;
  let j = fr.length - 1;
  for (let n = 0; n < fr.length - 1; n++)
    if (t >= fr[n].o && t <= fr[n + 1].o) { i = n; j = n + 1; break; }
  const w = fr[j].o - fr[i].o;
  return [i, j, w > 0 ? ease((t - fr[i].o) / w, k) : 0];
}
function sampleOps(fr, t, k) {
  const [i, , f] = span(fr, t, k);
  const a = fr[i];
  const b = a.to || a.ops;
  return a.ops.map((pa, n) => {
    const pb = b[n];
    const o = [pa[0]];
    for (let q = 1; q < pa.length; q++) o.push(pa[q] + ((pb.length > q ? pb[q] : pa[q]) - pa[q]) * f);
    return o;
  });
}
function sampleOp(fr, t, k) {
  const [i, j, f] = span(fr, t, k);
  return fr[i].v + (fr[j].v - fr[i].v) * f;
}
const parseOps = (css) => {
  const ops = [];
  const re = /(rotate|translate|translateX|translateY|scale|scaleX|scaleY)\(([^)]*)\)/g;
  let m;
  while ((m = re.exec(css))) {
    const n = (m[2].match(/-?\d*\.?\d+/g) || []).map(Number);
    if (m[1] === 'rotate') ops.push(n.length === 3 ? ['r', n[0], n[1], n[2]] : ['r', n[0]]);
    else if (m[1] === 'translate') ops.push(['t', n[0], n.length > 1 ? n[1] : 0]);
    else if (m[1] === 'translateX') ops.push(['t', n[0], 0]);
    else if (m[1] === 'translateY') ops.push(['t', 0, n[0]]);
    else if (m[1] === 'scale') ops.push(['s', n[0], n.length > 1 ? n[1] : n[0]]);
    else if (m[1] === 'scaleX') ops.push(['s', n[0], 1]);
    else ops.push(['s', 1, n[0]]);
  }
  return ops;
};
function parseAnim(css) {
  const m = /(\w+)\s+([\d.]+)s\s+([\w-]+)(?:\s+([\d.]+)s)?\s+infinite/.exec(css);
  if (!m) return null;
  const o = /transform-origin:\s*([\d.]+)px\s+([\d.]+)px/.exec(css);
  const tr = /(?:^|;)\s*translate:\s*(-?[\d.]+)(?:px)?(?:\s+(-?[\d.]+)(?:px)?)?/.exec(css);
  return {
    anim: { k: m[1], dur: +m[2] * 1000, delay: m[4] ? +m[4] * 1000 : 0,
            ease: m[3] === 'linear' ? 'lin' : m[3] === 'ease-out' ? 'out' : 'io' },
    origin: o ? [+o[1], +o[2]] : null,
    tr: tr ? [['t', +tr[1], tr[2] ? +tr[2] : 0]] : null,
  };
}

function render(n, flags, clock) {
  if (n.if && !flags[n.if]) return '';
  const kids = (n.kids || []).map((k) => render(k, flags, clock)).join('');
  if (n.t === 'defs') return `<defs>${kids}</defs>`;
  if (n.t === 'clipPath') return `<clipPath id="${n.id}">${kids}</clipPath>`;
  const bound = n.animBind ? String(flags[n.animBind] || '') : '';
  if (/opacity:\s*0/.test(bound)) return '';
  const ba = bound ? parseAnim(bound) : null;
  const anim = n.anim || (ba && ba.anim);
  const origin = n.o || (ba && ba.origin);
  const track = anim ? KEYFRAMES[anim.k] : null;
  const drivesTf = !!(track && track.tf && track.tf.length);
  const drivesOp = !!(track && track.op && track.op.length);
  const ownTf = n.tf ? n.tf : n.bind ? parseOps(String(flags[n.bind] || '')) : [];
  const base = [...(n.tr ? [['t', n.tr[0], n.tr[1]]] : []), ...(ba && ba.tr ? ba.tr : []),
                ...(drivesTf ? [] : ownTf)];
  const over = drivesTf ? ownTf : [];
  const isShape = n.t !== 'g';
  const ownOp = drivesOp && n.a && n.a.opacity != null ? Number(n.a.opacity) : 1;
  const attr = Object.entries(n.a || {})
    .filter(([k]) => !(drivesOp && k === 'opacity'))
    .map(([k, v]) => `${k}="${v}"`)
    .join(' ');
  const body = isShape ? `<${n.t} ${attr}/>` : kids;
  const gattr = isShape ? '' : attr;
  const ox = origin ? origin[0] : 0;
  const oy = origin ? origin[1] : 0;
  if (anim) {
    const before = clock < anim.delay;
    const el = clock - anim.delay;
    const r = el % anim.dur;
    const t = before ? 0 : r === 0 && el > 0 ? 1 : r / anim.dur;
    const m = mul(opsMat(base),
      before ? opsMat(over, ox, oy) : drivesTf ? opsMat(sampleOps(track.tf, t, anim.ease), ox, oy) : I);
    const op = drivesOp ? ` opacity="${before ? ownOp : sampleOp(track.op, t, anim.ease)}"` : '';
    return `<g ${gattr} transform="matrix(${m.join(' ')})"${op}>${body}</g>`;
  }
  const m = base.length ? opsMat(base, ox, oy) : null;
  if (m) return `<g ${gattr} transform="matrix(${m.join(' ')})">${body}</g>`;
  return gattr ? `<g ${gattr}>${body}</g>` : body;
}

const port = (flags, clock) =>
  `<svg viewBox="0 0 240 300" width="240" height="300" xmlns="http://www.w3.org/2000/svg">` +
  NODES.map((n) => render(n, flags, clock)).join('') +
  `</svg>`;

/* ── compare ──────────────────────────────────────────────────────────── */

const COLLECT = `(() => {
  const key = (el) => el.tagName + '|' + (el.getAttribute('d') ||
    ['cx','cy','rx','ry','r','x','y','width','height'].map(a=>el.getAttribute(a)??'').join(','));
  const out = [];
  document.querySelectorAll('svg path, svg ellipse, svg circle, svg rect, svg line').forEach((el) => {
    if (el.closest('defs') || el.closest('clipPath')) return;
    const b = el.getBoundingClientRect();
    let op = 1;
    for (let n = el; n && n.tagName !== 'BODY'; n = n.parentElement) op *= +getComputedStyle(n).opacity;
    if (+op.toFixed(2) <= 0) return;            // invisible either way
    const cs = getComputedStyle(el);
    out.push([key(el), +b.x.toFixed(1), +b.y.toFixed(1), +b.width.toFixed(1), +b.height.toFixed(1),
              +op.toFixed(2), cs.fill, cs.stroke, cs.strokeWidth, cs.clipPath]);
  });
  return out;
})()`;

const TIMES = QUICK ? [0, 4700, 20000] : [0, 137, 620, 1100, 2600, 4700, 8300, 12900, 17500, 20000, 23300, 31000, 44444];
const cases = [];
for (const p of KOA_POSES.map((x) => x.key))
  for (const e of KOA_EXPRESSIONS.map((x) => x.key)) for (const t of TIMES) cases.push([e, p, {}, t]);
const POSES = KOA_POSES.map((x) => x.key);
let k = 0;
for (const slot of KOA_SLOTS)
  for (const id of KOA_ITEMS[slot])
    for (const t of QUICK ? [12900] : [0, 3300, 12900, 26000])
      cases.push(['happy', POSES[k++ % POSES.length], { [slot]: id }, t]);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 240, height: 300 } });
let bad = 0;
for (const [e, p, worn, T] of cases) {
  const flags = koaFlags(e, p, worn);
  await page.setContent(`<html><head><style>${STYLE}</style></head><body style="margin:0">${truth(flags)}
    <script>document.querySelectorAll('*').forEach(el=>(el.getAnimations?el.getAnimations():[])
      .forEach(an=>{an.currentTime=${T};an.pause();}));</script></body></html>`);
  const A = await page.evaluate(COLLECT);
  await page.setContent(`<html><body style="margin:0">${port(flags, T)}</body></html>`);
  const B = await page.evaluate(COLLECT);
  const label = `${p}/${e}/${JSON.stringify(worn)}@${T}`;
  if (A.length !== B.length) {
    console.log(`${label}: shape count ${A.length} vs ${B.length}`);
    bad++;
    continue;
  }
  const issues = [];
  for (let i = 0; i < A.length; i++) {
    const a = A[i];
    const b = B[i];
    if (a[0] !== b[0]) { issues.push(`order: ${a[0].slice(0, 40)} vs ${b[0].slice(0, 40)}`); break; }
    const d = Math.max(...[1, 2, 3, 4].map((n) => Math.abs(a[n] - b[n])));
    if (d > 0.6) issues.push(`${d.toFixed(1)}px ${a[0].slice(0, 34)}`);
    else if (Math.abs(a[5] - b[5]) > 0.04) issues.push(`opacity ${a[5]}→${b[5]} ${a[0].slice(0, 30)}`);
    else for (const n of [6, 7, 8, 9]) if (a[n] !== b[n]) issues.push(`${a[n]}→${b[n]} ${a[0].slice(0, 28)}`);
  }
  if (issues.length) { bad++; console.log(`${label}: ${issues.slice(0, 4).join(' | ')}`); }
}
await browser.close();
console.log(`\n${cases.length} trường hợp, ${bad} lệch`);
process.exit(bad ? 1 : 0);
