/**
 * The wardrobe, on its own and at the size it is actually shown.
 *
 * Props in this room are drawn at 168 units and displayed at a third of that,
 * and the failure mode is always the same: detail that reads on the artboard
 * and turns to mush on the phone. So this draws it three times — the artboard,
 * the size it sits at in the outfit view, and half that — against the room's
 * own wall colour rather than white.
 *
 *   node tools/koa-studio/wardrobe.mjs <out.png>
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const OUT = process.argv[2] ?? 'wardrobe.png';
const dir = mkdtempSync(path.join(tmpdir(), 'koa-wr-'));
const stub = path.join(dir, 'rnsvg.js');
writeFileSync(
  stub,
  ['Svg','G','Path','Rect','Circle','Ellipse','Line','Text','TSpan','Defs','ClipPath',
   'LinearGradient','RadialGradient','Stop','Polygon','Polyline']
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
  `export * from '@/components/ascnd/studio/wardrobe';
   export { C } from '@/components/ascnd/studio/palette';`,
);
execFileSync('npx', ['esbuild', entry, '--bundle', '--format=esm', `--alias:react-native-svg=${stub}`,
  '--tsconfig=tsconfig.json', '--jsx=transform', '--jsx-factory=h', '--jsx-fragment=FRAG',
  `--banner:js=${BANNER}`, `--outfile=${path.join(dir, 'w.js')}`], { stdio: 'inherit' });
const B = await import(pathToFileURL(path.join(dir, 'w.js')));

const KEBAB = { strokeWidth: 'stroke-width', strokeLinecap: 'stroke-linecap',
  strokeLinejoin: 'stroke-linejoin', strokeOpacity: 'stroke-opacity', clipPath: 'clip-path' };
function render(node) {
  if (node == null || node === false || node === true) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(render).join('');
  const { type, props } = node;
  if (typeof type === 'function') return render(type(props ?? {}));
  if (type === '#fragment' || typeof type !== 'string') return render(props?.children);
  const attrs = Object.entries(props ?? {})
    .filter(([k]) => k !== 'children' && k !== 'key')
    .map(([k, v]) => `${KEBAB[k] ?? k}="${v}"`).join(' ');
  const kids = render(props?.children);
  return kids ? `<${type} ${attrs}>${kids}</${type}>` : `<${type} ${attrs}/>`;
}

const body = render(B.Wardrobe({}));
const svg = (w) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${(w * B.WARDROBE_H) / B.WARDROBE_W}" viewBox="0 0 ${B.WARDROBE_W} ${B.WARDROBE_H}">${body}</svg>`;

const cell = (label, w) =>
  `<div style="color:#8a8;font:11px system-ui">${label}<div style="padding-top:6px">${svg(w)}</div></div>`;
const html = path.join(dir, 'w.html');
writeFileSync(
  html,
  `<body style="margin:0;background:${B.C.bgBottom};display:flex;align-items:flex-start;gap:26px;padding:18px">
     ${cell('artboard 168', 168)}${cell('trong app ~124pt', 124)}${cell('nửa 62pt', 62)}
   </body>`,
);
const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 460, height: 290 }, deviceScaleFactor: 3 });
await page.goto(pathToFileURL(html).href);
await page.waitForTimeout(200);
await page.screenshot({ path: OUT });
const n = await page.evaluate(() => document.querySelectorAll('svg:first-of-type *').length);
await browser.close();
console.log(`${n} hình · ${B.WARDROBE_W}×${B.WARDROBE_H}\n${OUT}`);
