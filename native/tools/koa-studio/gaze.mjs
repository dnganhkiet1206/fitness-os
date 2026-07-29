/**
 * Koa noticing the insects.
 *
 * The glance is three transforms and a cross-fade driven by one clock, and all
 * four are things you can be wrong about in a way a screenshot of the room
 * will not show: the head can lean *away* from what it is looking at, the eyes
 * can go the wrong way, the smile can arrive a beat after the butterfly has
 * left. So this bundles `koa-gaze.ts` and `bugs.tsx` — the real ones — steps
 * the same clock the phone runs, and draws the room, the insect and the
 * character together at the moments something is actually perched.
 *
 * Then it measures, because "the head is tilted" is not something to judge by
 * eye at 0.5 scale: it reads the pupils' rendered centres out of the browser
 * and checks they moved toward the insect, not away from it.
 *
 *   node tools/koa-studio/gaze.mjs <out.png>
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const OUT = process.argv[2] ?? 'gaze.png';
const dir = mkdtempSync(path.join(tmpdir(), 'koa-gaze-'));

execFileSync('node', ['tools/koa-studio/preview.mjs', path.join(dir, 's.png')], { stdio: 'ignore' });

/* ── the real modules ─────────────────────────────────────────────────── */

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
  `export * as GZ from '@/components/ascnd/koa/koa-gaze';
   export * as BUG from '@/components/ascnd/studio/bugs';
   export * as L from '@/components/ascnd/koa/koa-light';
   export { REST_MAT, restsAt } from '@/components/ascnd/koa/koa-pose';
   export { NODES } from '@/components/ascnd/koa/koa-scene';
   export { koaFlags } from '@/components/ascnd/koa/koa-flags';
   export { STAGE_MARK, SCENE_BOTTOM } from '@/components/ascnd/studio/palette';
   export { HERO_W, KOA_ASPECT, KOA_INSET_MAT } from '@/components/ascnd/koa/koa-frame';
`,
);
execFileSync(
  'npx',
  ['esbuild', entry, '--bundle', '--format=esm', `--alias:react-native-svg=${stub}`,
   '--tsconfig=tsconfig.json', '--jsx=transform', '--jsx-factory=h', '--jsx-fragment=FRAG',
   `--banner:js=${BANNER}`, `--outfile=${path.join(dir, 'g.js')}`],
  { stdio: 'inherit' },
);
const B = await import(pathToFileURL(path.join(dir, 'g.js')));
const { GZ, BUG, L, NODES, koaFlags, REST_MAT, restsAt, STAGE_MARK, SCENE_BOTTOM } = B;
const { HERO_W, KOA_ASPECT, KOA_INSET_MAT } = B;

/* ── the figure, statically, with the glance composed on ──────────────── */

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
const show = (o) => Object.entries(o).map(([k, v]) => `${k}="${v}"`).join(' ');

/** the same three tests `koa-figure.tsx` applies, restated once each */
const isEyeGroup = (n) => !!n.kids && n.kids.some((k) => k.id === 'pupil_left');
const isSwapMouth = (n) => n.if && GZ.SWAP_MOUTHS.includes(n.if);

/** `koaBob` at the extreme of its cycle — rotate(-0.8) about (120,180), up 2.5 */
const BOB_WORST = mul(opsMat([['t', 0, -2.5]]), opsMat([['r', -0.8, 120, 180]]));

function render(n, flags, t, bob = false) {
  if (n.if && !flags[n.if]) return '';
  let kids = (n.kids || []).map((k) => render(k, flags, t, bob)).join('');
  if (n.id === 'FACE' && flags.mouthSmile) {
    kids += `<path d="${GZ.SMILE}" stroke="${GZ.SMILE_COLOUR}" stroke-width="${GZ.SMILE_WIDTH}" stroke-linecap="round" fill="none" opacity="${GZ.lookK(t).toFixed(3)}"/>`;
  }
  if (n.t === 'defs') return `<defs>${kids}</defs>`;
  if (n.t === 'clipPath') return `<clipPath id="${n.id}">${kids}</clipPath>`;
  // the component drops ids — `n.id` is a field, not an attribute — but the
  // probe below has to find the pupils in the rendered tree, so they go in
  // here. The first run of this tool reported "đúng cả 3 lần" having measured
  // nothing at all, because `querySelector('#pupil_left')` matched nothing.
  const a = L.litProps(n, { ...(n.id ? { id: n.id } : {}), ...(n.a || {}) });
  const attr = show(a);
  const isShape = n.t !== 'g';
  const pass = (extra) => `<${n.t} ${show({ ...a, ...extra })}/>`;
  const glow = L.hasGlow(n);
  const extras =
    (glow ? pass({ fill: `url(#${glow})`, stroke: 'none' }) : '') +
    (L.hasForm(n) ? pass({ fill: `url(#${L.FORM_GRADIENT})`, stroke: 'none' }) : '') +
    (L.hasBody(n) ? pass({ fill: `url(#${L.BODY_GRADIENT})`, stroke: 'none' }) : '') +
    (L.hasRim(n) ? pass({ fill: 'none', stroke: `url(#${L.RIM_GRADIENT})`, 'stroke-width': L.RIM_WIDTH }) : '');
  const body = isShape ? `<${n.t} ${attr}/>${extras}` : kids;
  const m = opsMat([...(n.tr ? [['t', n.tr[0], n.tr[1]]] : []), ...(n.tf || [])],
                   n.o ? n.o[0] : 0, n.o ? n.o[1] : 0);
  const g = isShape ? '' : attr;
  let out = m ? `<g ${g} transform="matrix(${m.join(' ')})">${body}</g>` : g ? `<g ${g}>${body}</g>` : body;

  // the resting lean, then the glance on top — the order the component uses
  if (RESTS && n.id && REST_MAT[n.id]) out = `<g transform="${REST_MAT[n.id]}">${out}</g>`;

  // …and the glance on top, exactly where the component puts it
  if (n.id === 'HEADRIG') {
    // The glance is not the only thing moving the head. `koaBob` is running
    // underneath it the whole time — a −0.8° roll about (120, 180) and 2.5 up
    // — and at 90 units from that pivot the roll alone carries the ears 1.3
    // sideways. A clearance check against the rest pose would have signed off
    // on a margin the idle animation eats on its own. So the worst case is
    // measured with the bob at its extreme, composed the way the component
    // composes it: the glance's group *around* the rig, the bob inside it.
    const m = mul(GZ.headMat(t), bob ? BOB_WORST : I);
    out = `<g transform="matrix(${m.join(' ')})">${out}</g>`;
  }
  else if (isEyeGroup(n)) out = `<g id="EYES" transform="matrix(${GZ.eyeMat(t).join(' ')})">${out}</g>`;
  else if (isSwapMouth(n)) out = `<g opacity="${(1 - GZ.lookK(t)).toFixed(3)}">${out}</g>`;
  return out;
}

const flags = koaFlags('happy', 'idle', undefined);
const RESTS = restsAt(flags);
const defs =
  '<defs>' + L.rampsFor(flags).map((r) =>
    `<linearGradient id="${r.id}" gradientUnits="userSpaceOnUse" x1="${r.x1}" y1="${r.y1}" x2="${r.x2}" y2="${r.y2}">` +
    r.stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('') + '</linearGradient>').join('') +
  L.glowsFor(flags).map((g) =>
    `<radialGradient id="${g.id}" gradientUnits="userSpaceOnUse" cx="${g.cx}" cy="${g.cy}" r="${g.r}">` +
    L.GLOW_STOPS.map(([o, al]) => `<stop offset="${o}" stop-color="${L.GLOW_COLOUR}" stop-opacity="${al}"/>`).join('') +
    '</radialGradient>').join('') +
  `<linearGradient id="${L.FORM_GRADIENT}" x1="0" y1="0" x2="0" y2="1">` +
  L.FORM_STOPS.map(([o, c, al]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${al}"/>`).join('') +
  '</linearGradient>' +
  `<linearGradient id="${L.BODY_GRADIENT}" x1="0" y1="0" x2="0" y2="1">` +
  L.BODY_STOPS.map(([o, c, al]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${al}"/>`).join('') +
  '</linearGradient>' +
  `<radialGradient id="${L.SHADOW_GRADIENT}">` +
  L.SHADOW_STOPS.map(([o, al]) => `<stop offset="${o}" stop-color="${L.SHADOW_COLOUR}" stop-opacity="${al}"/>`).join('') +
  '</radialGradient>' +
  `<linearGradient id="${L.RIM_GRADIENT}" x1="0" y1="0" x2="0" y2="1">` +
  L.RIM_STOPS.map(([o, al]) => `<stop offset="${o}" stop-color="${L.RIM_COLOUR}" stop-opacity="${al}"/>`).join('') +
  '</linearGradient></defs>';

/**
 * Where the figure stands, from the same three numbers `stage-renderer.tsx`
 * places it with — never from a measured pixel. Getting this from a screenshot
 * is how a preview ends up drawing a character standing in front of its own
 * podium.
 */
const SCALE = HERO_W / 240;
const FIG = [1, 0, 0, 1, STAGE_MARK.x - HERO_W / 2, STAGE_MARK.y - HERO_W * KOA_ASPECT + 6];

/* ── the insects, from their own module ───────────────────────────────── */

const KEBAB = { strokeWidth: 'stroke-width', strokeLinecap: 'stroke-linecap' };
function jsx(node) {
  if (node == null || node === false || node === true) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(jsx).join('');
  const { type, props } = node;
  if (typeof type === 'function') return jsx(type(props ?? {}));
  if (type === '#fragment' || typeof type !== 'string') return jsx(props?.children);
  const attrs = Object.entries(props ?? {})
    .filter(([k]) => k !== 'children' && k !== 'key')
    .map(([k, v]) => `${KEBAB[k] ?? k}="${v}"`)
    .join(' ');
  const kids = jsx(props?.children);
  return kids ? `<${type} ${attrs}>${kids}</${type}>` : `<${type} ${attrs}/>`;
}
const BODIES = [jsx(BUG.Bee({})), jsx(BUG.Butterfly({})), jsx(BUG.Butterfly({ tint: '#FFFFFF', alpha: 0.5 }))];
const insects = (t) =>
  BUG.ROUTES.map((r, i) => {
    const f = BUG.flightAt(r, t);
    if (f.opacity <= 0.01) return '';
    return `<g transform="matrix(${f.matrix.join(' ')})" opacity="${f.opacity.toFixed(2)}">${BODIES[i]}</g>`;
  }).join('');

/* ── when is anything perched? ────────────────────────────────────────── */

const STEPS = 4000;
const windows = [];
let open = null;
for (let i = 0; i <= STEPS; i++) {
  const t = i / STEPS;
  const on = GZ.lookK(t) > 0.001;
  if (on && !open) open = { from: t, peak: 0, at: t };
  if (on && open) {
    const k = GZ.lookK(t);
    if (k > open.peak) { open.peak = k; open.at = t; }
  }
  if (!on && open) { open.to = t; windows.push(open); open = null; }
}
if (open) { open.to = 1; windows.push(open); }

const SEC = BUG.BUG_PERIOD / 1000;
console.log(`chu kỳ ${SEC}s — ${windows.length} lần đậu\n`);
const NAMES = ['ong', 'bướm', 'ngài'];
const rows = [];
for (const w of windows) {
  const p = BUG.perchAt(w.at);
  const g = GZ.gazeAt(w.at);
  const head = GZ.headMat(w.at);
  const eye = GZ.eyeMat(w.at);
  // which insect is up: the one whose window contains this instant
  const who = BUG.ROUTES.findIndex((r) => ((w.at + 1 - r.phase) % 1) <= r.span);
  const tilt = (Math.atan2(head[1], head[0]) * 180) / Math.PI;
  // the head's *displacement*, not the matrix's e/f — those carry the rotation
  // about the neck as well and read four times larger than anything moves
  const HEAD = [120, 112];
  const hx = head[0] * HEAD[0] + head[2] * HEAD[1] + head[4] - HEAD[0];
  const hy = head[1] * HEAD[0] + head[3] * HEAD[1] + head[5] - HEAD[1];
  rows.push({ w, p, g, eye, tilt, who });
  console.log(
    `  ${NAMES[who].padEnd(5)} đậu ở (${p.x.toFixed(0)}, ${p.y.toFixed(0)})  ` +
    `${(w.from * SEC).toFixed(1)}s → ${(w.to * SEC).toFixed(1)}s (${((w.to - w.from) * SEC).toFixed(1)}s)\n` +
    `        nhìn (${g.x.toFixed(2)}, ${g.y.toFixed(2)})  ` +
    `đầu nghiêng ${tilt.toFixed(1)}° dịch (${hx.toFixed(1)}, ${hy.toFixed(1)})  ` +
    `mắt (${eye[4].toFixed(1)}, ${eye[5].toFixed(1)})  miệng khép ${(w.peak * 100).toFixed(0)}%`,
  );
}

/* ── draw it ──────────────────────────────────────────────────────────── */

const studio = readFileSync(path.join(dir, 's.svg'), 'utf8').replace(/height="844"/, `height="${SCENE_BOTTOM}"`);
const frame = (t, bob = false) =>
  studio.replace(
    '</svg>',
    `${defs}<g id="FIGURE" transform="matrix(${FIG.join(' ')}) scale(${SCALE})">` +
      // the artwork is inset in its box — `koa-frame.ts`, and `koa-figure.tsx`
      // wraps the same group round the same tree
      `<g transform="${KOA_INSET_MAT}">${NODES.map((n) => render(n, flags, t, bob)).join('')}</g>` +
      `</g>${insects(t)}</svg>`,
  );

/**
 * Two crops, because one cannot answer both questions.
 *
 * The wide shot is the whole room: it is the only place you can see that the
 * character is looking at *where the insect actually is*, which is the thing
 * this feature is for. At that size a four-degree tilt is two pixels, so the
 * head gets its own crop beside it — and that one has to be tight enough to
 * read an eye. The first version of this tool had a single crop that framed
 * neither and showed an empty wall.
 */
const WIDE = 0.52;
const HEAD = 1.45;
const cell = (label, colour, inner) =>
  `<div><div style="color:${colour};font:11px system-ui;padding:3px">${label}</div>${inner}</div>`;
const wide = (t) =>
  `<div style="width:203px;height:248px;overflow:hidden">
     <div style="transform:scale(${WIDE});transform-origin:0 0">${frame(t)}</div></div>`;
const head = (t) =>
  `<div style="width:203px;height:232px;overflow:hidden">
     <div style="transform:scale(${HEAD});transform-origin:0 0;margin-left:${-130 * HEAD}px;margin-top:${-240 * HEAD}px">${frame(t, true)}</div></div>`;

// three instants per landing: arriving, settled, leaving — a glance that only
// works at its peak is a glance that snaps on, which is the thing to catch
const cells = [];
for (const r of rows) {
  const { w } = r;
  const at = [
    ['đến', w.from + (w.at - w.from) * 0.5],
    ['đậu', w.at],
    ['đi', w.at + (w.to - w.at) * 0.55],
  ];
  cells.push(cell(`${NAMES[r.who]} · cả phòng · đậu ở (${r.p.x.toFixed(0)}, ${r.p.y.toFixed(0)})`, '#8a8', wide(w.at)));
  for (const [tag, t] of at) {
    cells.push(cell(`${NAMES[r.who]} · ${tag} · k=${GZ.lookK(t).toFixed(2)}`, '#8a8', head(t)));
  }
}
// and one with nothing perched, as the baseline
cells.push(cell('không có gì · k=0', '#666', head(0.99)));

const html = path.join(dir, 'g.html');
writeFileSync(
  html,
  `<body style="margin:0;background:#000;display:flex;flex-wrap:wrap;gap:6px;padding:10px;width:868px">${cells.join('')}</body>`,
);
const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 868, height: 1100 }, deviceScaleFactor: 2 });
await page.goto(pathToFileURL(html).href);
await page.waitForTimeout(300);
await page.screenshot({ path: OUT, fullPage: true });

/**
 * The check the picture cannot make: did the eyes go **toward** the insect?
 *
 * Read out of the browser rather than out of the matrix, so it is the rendered
 * position after every transform above it — the head's roll included. A sign
 * error in the tilt would move the pupils the wrong way even with the eye
 * matrix right, and that is exactly the bug that is invisible at this scale.
 *
 * It is the **midpoint of the two pupils**, not one of them. A head that rolls
 * left drops its left eye and lifts its right one — that is what a roll is —
 * so a single pupil mixes the tilt into the vertical reading and reports the
 * eyes going *down* toward an insect that is up. The first run of this tool
 * called two of the three landings wrong for exactly that reason. Between the
 * two eyes the roll cancels vertically and adds horizontally, which leaves the
 * two numbers this is actually asking about.
 */
const probe = await page.evaluate(() => {
  const out = [];
  for (const svg of document.querySelectorAll('svg')) {
    const l = svg.querySelector('#pupil_left');
    const r = svg.querySelector('#pupil_right');
    if (!l || !r) { out.push(null); continue; }
    const o = svg.getBoundingClientRect();
    const c = (e) => {
      const b = e.getBoundingClientRect();
      return [b.x + b.width / 2 - o.x, b.y + b.height / 2 - o.y];
    };
    const a = c(l);
    const b = c(r);
    out.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
  }
  return out;
});

/**
 * Does the figure still fit inside its own viewBox?
 *
 * `KoaFigure` draws into `viewBox="0 0 240 300"`, and **an SVG viewport clips**
 * — anything the glance pushes past an edge is simply cut off, with a straight
 * line where the ear used to be. Rolling the head about the neck moves the ears
 * further than anything else on the figure and moves them *up*, which is the
 * edge with the least room. The user saw this before this check existed.
 *
 * `getBBox()` on the placement group reports in the figure's own units, before
 * that group's transform, so the numbers below compare directly against
 * 0 → 240 and 0 → 300 with no scaling to get wrong.
 */
const box = await page.evaluate(() =>
  [...document.querySelectorAll('#FIGURE')].map((g) => {
    const b = g.getBBox();
    return [b.x, b.y, b.x + b.width, b.y + b.height];
  }),
);
const still = box[box.length - 1];
console.log(
  `\nkhung hình 240 × 300 — lúc đứng yên nhân vật chiếm ` +
  `(${still[0].toFixed(1)}, ${still[1].toFixed(1)}) → (${still[2].toFixed(1)}, ${still[3].toFixed(1)}), ` +
  `chừa trái ${still[0].toFixed(1)} phải ${(240 - still[2]).toFixed(1)} trên ${still[1].toFixed(1)}`,
);
console.log('tràn ra bao nhiêu:');
let cut = 0;
box.forEach((b, i) => {
  const over = [-b[0], -b[1], b[2] - 240, b[3] - 300].map((v) => (v > 0.05 ? v : 0));
  if (over.some((v) => v > 0)) {
    cut++;
    console.log(
      `  ô ${String(i).padStart(2)}  trái ${over[0].toFixed(1)}  trên ${over[1].toFixed(1)}  ` +
      `phải ${over[2].toFixed(1)}  dưới ${over[3].toFixed(1)}  ← BỊ CẮT`,
    );
  }
});
const room = box.reduce(
  (a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])],
  [999, 999, -999, -999],
);
console.log(
  `  chỗ trống ít nhất: trái ${room[0].toFixed(1)}  trên ${room[1].toFixed(1)}  ` +
  `phải ${(240 - room[2]).toFixed(1)}  dưới ${(300 - room[3]).toFixed(1)}` +
  (cut ? `\n  ${cut}/${box.length} khung bị cắt` : '\n  không khung nào bị cắt'),
);
await browser.close();

const base = probe[probe.length - 1];
if (!base || probe.some((p) => !p)) throw new Error('không tìm thấy đồng tử trong bản vẽ — đo được gì đâu');
let bad = 0;
console.log('\nđồng tử dịch bao nhiêu (so với lúc không nhìn gì):');
rows.forEach((r, i) => {
  // four cells per landing — the wide shot, then đến / đậu / đi
  const at = probe[i * 4 + 2];
  const dx = at[0] - base[0];
  const dy = at[1] - base[1];
  const okx = Math.sign(dx) === Math.sign(r.g.x) || Math.abs(r.g.x) < 0.05;
  const oky = Math.sign(dy) === Math.sign(r.g.y) || Math.abs(r.g.y) < 0.05;
  if (!okx || !oky) bad++;
  console.log(
    `  ${NAMES[r.who].padEnd(5)} ${dx > 0 ? '→' : '←'} ${Math.abs(dx).toFixed(1)}px  ` +
    `${dy > 0 ? '↓' : '↑'} ${Math.abs(dy).toFixed(1)}px   ` +
    `(bọ ở ${r.g.x < 0 ? 'trái' : 'phải'}, ${r.g.y < 0 ? 'trên' : 'dưới'}) ${okx && oky ? 'ĐÚNG' : 'SAI HƯỚNG'}`,
  );
});
console.log(bad === 0 ? '\nmắt nhìn đúng hướng cả 3 lần' : `\n${bad} lần nhìn sai hướng`);
console.log(`\n${OUT}`);
