/**
 * Render the studio scene to a PNG from the real components.
 *
 * It bundles the actual `.tsx` with `react-native-svg` swapped for a stub
 * whose exports are plain tag names, then walks the element tree those
 * components return and writes SVG. So the preview is the components, not a
 * hand-kept copy of them that can drift.
 *
 *   npm i -D playwright esbuild
 *   node tools/koa-studio/preview.mjs [out.png]
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const OUT = process.argv[2] ?? 'studio.png';
const dir = mkdtempSync(path.join(tmpdir(), 'koa-studio-'));

// react-native-svg → tag names; the components never look at anything else
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

execFileSync(
  'npx',
  ['esbuild', 'src/components/ascnd/studio/koa-studio.tsx', '--bundle', '--format=esm',
   `--alias:react-native-svg=${stub}`, '--tsconfig=tsconfig.json',
   // our own tiny JSX factory, so React never enters the preview
   '--jsx=transform', '--jsx-factory=h', '--jsx-fragment=FRAG',
   `--banner:js=${BANNER}`,
   `--outfile=${path.join(dir, 'studio.js')}`],
  { stdio: 'inherit' },
);

const { KoaStudio } = await import(pathToFileURL(path.join(dir, 'studio.js')));

/* ── element tree → SVG text ──────────────────────────────────────────── */

const KEBAB = {
  strokeWidth: 'stroke-width', strokeLinecap: 'stroke-linecap', strokeLinejoin: 'stroke-linejoin',
  strokeDasharray: 'stroke-dasharray', strokeOpacity: 'stroke-opacity', fillOpacity: 'fill-opacity',
  fillRule: 'fill-rule', clipPath: 'clip-path', clipRule: 'clip-rule', stopColor: 'stop-color',
  stopOpacity: 'stop-opacity', fontSize: 'font-size', fontWeight: 'font-weight',
  fontFamily: 'font-family', textAnchor: 'text-anchor', letterSpacing: 'letter-spacing',
  viewBox: 'viewBox', preserveAspectRatio: 'preserveAspectRatio', gradientUnits: 'gradientUnits',
};
const VOID_TEXT = new Set(['svg', 'g', 'defs', 'clipPath', 'linearGradient', 'radialGradient', 'text', 'tspan']);

function render(node) {
  if (node == null || node === false || node === true) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(render).join('');
  const { type, props } = node;
  if (typeof type === 'function') return render(type(props ?? {}));
  if (type === '#fragment' || typeof type !== 'string') return render(props?.children);

  const attrs = Object.entries(props ?? {})
    .filter(([k]) => k !== 'children' && k !== 'key')
    .map(([k, v]) => `${KEBAB[k] ?? k}="${String(v).replace(/\s+/g, ' ').trim()}"`)
    .join(' ');
  const kids = render(props?.children);
  return kids || VOID_TEXT.has(type)
    ? `<${type}${attrs ? ' ' + attrs : ''}>${kids}</${type}>`
    : `<${type}${attrs ? ' ' + attrs : ''}/>`;
}

// `label` is part of the scene now — the companion's name is set into the
// podium's front face rather than shown as the screen's header title
const svg = render(KoaStudio({ width: 390, height: 844, streak: 4, label: 'Koa' }))
  .replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');

// next to the PNG as well, so stage.mjs can find it without guessing
writeFileSync(OUT.replace(/\.png$/, '.svg'), svg);
writeFileSync(path.join(dir, 'studio.svg'), svg);
writeFileSync(
  path.join(dir, 'studio.html'),
  `<body style="margin:0;background:#000;font-family:-apple-system,Inter,system-ui,sans-serif">${svg}</body>`,
);

const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await page.goto(pathToFileURL(path.join(dir, 'studio.html')).href);
await page.screenshot({ path: OUT });
await browser.close();

const shapes = (svg.match(/<(rect|circle|ellipse|path|text)\b/g) ?? []).length;
console.log(`${OUT} — ${shapes} hình, ${(svg.length / 1024).toFixed(1)}KB SVG`);
