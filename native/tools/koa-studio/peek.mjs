/**
 * Render the peek — the real art, at the real sizes, from the real numbers.
 *
 * ── why a picture and not a rule ──
 *
 * The peek shipped broken and every check in the suite was green, because
 * nothing in it is a *rule*: the band's height, the figure's height and the
 * parking distance were each defensible on their own, and only their sum was
 * absurd. `justifyContent: 'flex-end'` in a container shorter than its child
 * left Koa's head standing permanently over every widget on the dashboard, and
 * the celebration slid the window down to its stomach. Both are obvious in one
 * frame and invisible in a type checker.
 *
 * So this draws the frames. `KoaFigure` is imported and rendered — this is the
 * shipping artwork, not a stand-in — the geometry comes from `lib/peek-frame.ts`
 * and the faces from `PEEK_EMOTION` through the Emotion Engine's own mapping.
 * Change any of those and this picture changes; the tool has nothing of its own
 * to disagree with.
 *
 * The one thing it does restate is the band's CSS — `overflow: hidden`, the
 * figure hung from the top — because that is React Native layout and this is a
 * browser. Four lines, and the failure mode is a picture that looks wrong.
 *
 *   node tools/koa-studio/peek.mjs [out.png]
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';

import { bundleWithKoaStubs, KOA_ART_ENTRY, shoot } from './koa-dom.mjs';

const OUT = path.resolve(process.argv[2] ?? 'peek.png');

const { mod, dir } = await bundleWithKoaStubs(
  KOA_ART_ENTRY +
    /* From the pure module, not from the component: importing `card-peek.tsx`
       drags in expo-router and the whole navigator, and esbuild stops at the
       first `.png` in it. The face map lives beside the geometry for exactly
       this reason — the peek's facts are data, not a screen. */
    `\nexport { PEEK, PEEK_FIGURE, LEAN_DEG, peekFrame, PEEK_EMOTION } from '@/lib/peek-frame';`,
);
const { art, koaStateFor, PEEK, PEEK_FIGURE, LEAN_DEG, peekFrame, PEEK_EMOTION, KOA_ASPECT } = mod;

const H = Math.round(PEEK_FIGURE * KOA_ASPECT);

/** the figure in whatever face an emotion resolves to, through the app's map */
const faceFor = (emotion) => {
  const s = koaStateFor(emotion);
  return art(PEEK_FIGURE, s.expression, s.pose, s.outfit ?? {});
};

/** [rise, lean, emotion, coins, label] */
const FRAMES = [
  [0, 0, 'celebrate', 0, 'nghỉ — phải trống trơn'],
  [0.5, 0, 'celebrate', 0, 'đang lên'],
  [1, 1, 'celebrate', 0, `nghiêng ${LEAN_DEG}°`],
  ...Object.entries(PEEK_EMOTION).map(([quest, emotion]) => [
    1, 0, emotion, quest === 'meal' ? 15 : quest === 'workout' ? 20 : 10,
    `${quest} → ${emotion}`,
  ]),
];

const CARD_W = 200;
const CARD_H = 84;
const PAD = 24;
const PER_ROW = 4;

const cell = ([rise, lean, emotion, coins, label]) => {
  const f = peekFrame(rise, lean);
  const tf = `translateY(${f.translateY}px) rotate(${f.rotate}deg) scaleY(${f.scaleY})`;
  return `
  <div class="cell">
    <div class="stage">
      <div class="wrap">
        <div class="clip">
          <div class="fig" style="transform:${tf}">${faceFor(emotion)}</div>
          ${coins ? `<div class="coins" style="transform:${tf}">+${coins}</div>` : ''}
        </div>
        <div class="card"><b>Dinh dưỡng</b><span>1 842 kcal</span></div>
      </div>
    </div>
    <p>${label}</p>
  </div>`;
};

const html = path.join(dir, 'peek.html');
writeFileSync(
  html,
  `<meta charset="utf-8">
<style>
  :root { color-scheme: dark }
  body { margin:0; background:#070708; font:500 12px/1.4 -apple-system,Inter,system-ui,sans-serif; color:#8b8b94 }
  .grid { display:grid; grid-template-columns:repeat(${PER_ROW}, ${CARD_W}px); gap:${PAD}px; padding:${PAD}px }
  .cell { width:${CARD_W}px }
  .cell p { margin:10px 0 0; text-align:center }
  /* the band's own height of headroom, so a frame that leaks shows the leak */
  .stage { padding-top:${PEEK}px; background:#0d0d10; border-radius:18px }
  .wrap { position:relative }
  /* ── card-peek's StyleSheet, restated ──
     flex-direction:column is not decoration: React Native lays out in
     columns by default and CSS in rows, so leaving it off silently swaps the
     two alignments — the first run of this tool centred Koa *vertically* in the
     band and pinned it left, which is neither what the app does nor anything a
     phone would ever show. A mirror that gets the axis wrong is worse than no
     mirror, so the axis is written down. */
  .clip { position:absolute; left:0; right:0; top:${-PEEK}px; height:${PEEK}px;
          overflow:hidden; display:flex; flex-direction:column;
          align-items:center; justify-content:flex-start }
  .fig { flex-shrink:0; width:${PEEK_FIGURE}px; height:${H}px }
  .fig > div { width:${PEEK_FIGURE}px; height:${H}px }
  .coins { position:absolute; left:50%; margin-left:${PEEK_FIGURE / 2 - 2}px; bottom:8px; padding:3px 8px; border-radius:999px;
           background:rgba(255,209,102,.16); border:1px solid rgba(255,209,102,.34);
           color:#ffd166; font-size:12px; font-weight:800 }
  .card { height:${CARD_H}px; border-radius:20px; background:rgba(255,255,255,.06);
          border:1px solid rgba(255,255,255,.10); display:flex; flex-direction:column;
          justify-content:center; padding:0 16px; gap:4px }
  .card b { color:#f4f4f6; font-size:15px } .card span { color:#9a9aa4; font-size:13px }
</style>
<div class="grid">${FRAMES.map(cell).join('')}</div>`,
);

const rows = Math.ceil(FRAMES.length / PER_ROW);
const W = PER_ROW * CARD_W + (PER_ROW + 1) * PAD;
/* Generously: headless Chrome shoots the window, not the document, so anything
   past the bottom edge is simply gone. Spare black costs nothing. */
const TALL = rows * (PEEK + CARD_H + 70 + PAD) + PAD;

if (!shoot(html, OUT, W, TALL)) {
  console.log(`Không tìm thấy Chromium — HTML ở ${html}`);
  process.exit(1);
}

console.log(
  `${OUT} — băng ${PEEK}pt, hình ${PEEK_FIGURE}×${H}pt ` +
    `(băng thấy ${Math.round((PEEK / H) * 100)}% chiều cao hình), ` +
    `${Object.keys(PEEK_EMOTION).length} khuôn mặt theo nhiệm vụ`,
);
