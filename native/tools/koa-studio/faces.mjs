/**
 * The expression sheet, drawn — every face Koa has, cropped to the head.
 *
 * ── why it is cropped ──
 *
 * Because that is how most of them are actually seen now. The peek over a card
 * shows the top 58 points of the figure and nothing else; the Today widget is
 * small; the room is the only place the whole animal is on screen. A face sheet
 * that renders full bodies is a sheet of the wrong thing — it would have said
 * the new `plead` face was fine while the part that carries it, the brow, sat
 * outside the crop.
 *
 * ── what it is for ──
 *
 * Adding an expression means combining layers the design sheet never combined,
 * and there is no way to know whether a combination reads as *asking* rather
 * than *sulking* except to look at it next to the others. This is that look.
 *
 *   node tools/koa-studio/faces.mjs [out.png]
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';

import { bundleWithKoaStubs, KOA_ART_ENTRY, NATIVE, shoot } from './koa-dom.mjs';

const OUT = path.resolve(process.argv[2] ?? 'faces.png');

const { mod, dir } = await bundleWithKoaStubs(KOA_ART_ENTRY);
const { art, KOA_EXPRESSIONS, KOA_ASPECT } = mod;

/** the peek's own window, so the sheet crops the way the app crops */
const W = 96;
const H = Math.round(W * KOA_ASPECT);
const CROP = 74;
const PAD = 20;
const PER_ROW = 6;

const cell = ({ key, label }) => `
  <div class="cell">
    <div class="crop">${art(W, key, 'idle', {})}</div>
    <p><b>${key}</b><br>${label}</p>
  </div>`;

const html = path.join(dir, 'faces.html');
writeFileSync(
  html,
  `<meta charset="utf-8">
<style>
  :root { color-scheme: dark }
  body { margin:0; background:#070708; color:#8b8b94;
         font:500 11px/1.35 -apple-system,Inter,system-ui,sans-serif }
  .grid { display:grid; grid-template-columns:repeat(${PER_ROW}, ${W}px); gap:${PAD}px; padding:${PAD}px }
  .cell { width:${W}px }
  .crop { width:${W}px; height:${CROP}px; overflow:hidden; border-radius:12px; background:#0d0d10 }
  .crop > div { width:${W}px; height:${H}px }
  .cell p { margin:8px 0 0; text-align:center }
  .cell b { color:#f4f4f6 }
</style>
<div class="grid">${KOA_EXPRESSIONS.map(cell).join('')}</div>`,
);

const rows = Math.ceil(KOA_EXPRESSIONS.length / PER_ROW);
const width = PER_ROW * W + (PER_ROW + 1) * PAD;
/* Generously: headless Chrome shoots the window, not the document, so anything
   past the bottom edge is simply gone — and two attempts at computing the exact
   caption height both came up short and sliced the last row. Spare black at the
   foot of a contact sheet costs nothing; a missing row costs a re-run. */
const height = rows * (CROP + 90) + PAD * 2;

if (!shoot(html, OUT, width, height)) {
  console.log(`không tìm thấy Chromium — HTML ở ${html}`);
  process.exit(1);
}
console.log(`${OUT} — ${KOA_EXPRESSIONS.length} biểu cảm, cắt ${CROP}pt tính từ đỉnh đầu`);
