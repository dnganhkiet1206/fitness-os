/**
 * The muscle-group icons, rasterised so they can actually be looked at.
 *
 *   node tools/muscle-icons.mjs   →  /tmp/muscle-icons.png
 *
 * ── why this is not optional ──
 *
 * These are drawings of anatomy. A path list is not something anyone can read
 * as a shape, and "it looks right in the file" is not a statement that can be
 * made about artwork at all — the macro icons went in looking fine as source
 * and came out on the device as a spanner and a thermometer.
 *
 * So this renders the real components at the size they are used and at four
 * times that, on the app's own background, and writes a PNG. The point is to
 * open it.
 *
 * It reads the paths out of `muscle-icons.tsx` rather than restating them: a
 * preview built from a copy of the artwork is a preview of the copy.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(NATIVE, 'src/components/ascnd/muscle-icons.tsx');

/** Playwright is whatever the machine has; look in the global root too. */
function loadPlaywright() {
  const req = createRequire(import.meta.url);
  try {
    return req('playwright');
  } catch {
    const g = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
    return createRequire(path.join(g, 'x.js'))('playwright');
  }
}

const src = readFileSync(SRC, 'utf8');

/** every `export function XxxMuscle(` in the file, in source order */
const NAMES = [...src.matchAll(/export function (\w+Muscle)\b/g)].map((m) => m[1]);
if (NAMES.length === 0) throw new Error('không tìm thấy icon nào trong muscle-icons.tsx');

/** the source of one component, up to the next export or the end */
function bodyOf(name) {
  const from = src.indexOf(`export function ${name}`);
  const rest = src.slice(from + 1);
  const nextRel = rest.search(/\nexport (function|const) /);
  return nextRel < 0 ? src.slice(from) : src.slice(from, from + 1 + nextRel);
}

/**
 * One component's JSX as SVG markup.
 *
 * Only the elements these drawings use. Anything else throws rather than being
 * skipped — an element quietly dropped from a preview is the one you then
 * cannot see is missing.
 */
/**
 * Module-level `const NAME = '…'` path strings, so shared outlines can be
 * written once in the component and still reach the preview verbatim.
 */
const CONSTS = Object.fromEntries([
  ...[...src.matchAll(/^const ([A-Z][A-Z0-9_]*) =\s*\n?\s*'([^']*)'/gm)].map((m) => [m[1], m[2]]),
  // numbers too — opacities are shared the same way outlines are
  ...[...src.matchAll(/^const ([A-Z][A-Z0-9_]*) = ([\d.]+);/gm)].map((m) => [m[1], m[2]]),
]);

const ALLOWED = ['Path', 'Circle', 'Ellipse', 'Rect', 'G'];
function toSvg(body, color) {
  const out = [];
  const re = new RegExp(`<(${ALLOWED.join('|')})\\b([\\s\\S]*?)(/>|>)`, 'g');
  let m;
  while ((m = re.exec(body))) {
    const tag = m[1] === 'G' ? 'g' : m[1].toLowerCase();
    const attrs = m[2]
      .replace(/\{`([^`]*)`\}/g, '"$1"')
      .replace(/\{([\d.-]+)\}/g, '"$1"')
      .replace(/=\{color\}/g, `="${color}"`)
      .replace(/=\{cut\}/g, '="#0b0b0e"')
      .replace(/=\{([A-Z][A-Z0-9_]*)\}/g, (_, k) => {
        if (!(k in CONSTS)) throw new Error(`không biết hằng ${k}`);
        return `="${CONSTS[k]}"`;
      })
      .replace(/strokeWidth/g, 'stroke-width')
      .replace(/strokeLinecap/g, 'stroke-linecap')
      .replace(/strokeLinejoin/g, 'stroke-linejoin')
      .replace(/fillOpacity/g, 'fill-opacity')
      .replace(/strokeOpacity/g, 'stroke-opacity')
      .replace(/fillRule/g, 'fill-rule')
      .replace(/clipRule/g, 'clip-rule');
    if (/\{/.test(attrs)) throw new Error(`không dịch được thuộc tính trong <${m[1]}>: ${attrs.trim()}`);
    out.push(m[3] === '>' ? `<${tag}${attrs}>` : `<${tag}${attrs}/>`);
    if (m[3] === '>') out.push(`</${tag}>`);
  }
  if (out.length === 0) throw new Error('component không có hình nào — bộ trích hỏng');
  return out.join('\n');
}

const viewBox = /viewBox="([^"]+)"/.exec(src)?.[1] ?? '0 0 64 64';
const BIG = 132;
const SMALL = 34;

const cells = NAMES.map((n) => {
  const body = toSvg(bodyOf(n), '#a78bfa');
  const label = n.replace('Muscle', '');
  return `
    <figure>
      <div class="big"><svg viewBox="${viewBox}" width="${BIG}" height="${BIG}">${body}</svg></div>
      <div class="row">
        <svg viewBox="${viewBox}" width="${SMALL}" height="${SMALL}">${body}</svg>
        <figcaption>${label}</figcaption>
      </div>
    </figure>`;
}).join('');

const html = `<!doctype html><meta charset="utf-8">
<style>
  body { margin:0; padding:28px; background:#070708; color:#ededed;
         font:14px -apple-system,Segoe UI,Roboto,sans-serif; }
  .grid { display:grid; grid-template-columns:repeat(3,1fr); gap:18px; }
  figure { margin:0; background:rgba(255,255,255,.06); border:.5px solid rgba(255,255,255,.12);
           border-radius:20px; padding:16px; }
  .big { display:flex; justify-content:center; }
  .row { display:flex; align-items:center; gap:10px; margin-top:10px; }
  figcaption { color:#9aa0a6; }
</style>
<div class="grid">${cells}</div>`;

const htmlPath = '/tmp/muscle-icons.html';
const pngPath = '/tmp/muscle-icons.png';
writeFileSync(htmlPath, html);

const { chromium } = loadPlaywright();
const browser = await chromium.launch({
  executablePath: existsSync('/opt/pw-browsers/chromium') ? undefined : undefined,
});
const page = await browser.newPage({ viewport: { width: 760, height: 640 }, deviceScaleFactor: 2 });
await page.goto(`file://${htmlPath}`);
await page.screenshot({ path: pngPath, fullPage: true });
await browser.close();

console.log(`${NAMES.length} icon → ${pngPath}`);
