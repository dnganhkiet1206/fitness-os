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
 * shipping artwork, not a stand-in — and the geometry comes from
 * `lib/peek-frame.ts`, the same module the component animates from. Change a
 * number there and this picture changes; the tool has nothing of its own to
 * disagree with.
 *
 * The one thing it does restate is the band's CSS — `overflow: hidden`, the
 * figure hung from the top — because that is React Native layout and this is a
 * browser. Four lines, and the failure mode is a picture that looks wrong.
 *
 *   node tools/koa-studio/peek.mjs [out.png]
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
process.chdir(NATIVE);

const OUT = path.resolve(process.argv[2] ?? 'peek.png');
/* Inside the project, and *beside* `node_modules` rather than in it: the stubs
   import `react`, so the entry needs a `node_modules` to walk up into — and
   esbuild ignores a tsconfig's `paths` for anything under `node_modules`, so
   the `@/` imports would stop resolving one directory deeper. */
const dir = mkdtempSync(path.join(NATIVE, '.koa-peek-'));
process.on('exit', () => rmSync(dir, { recursive: true, force: true }));

/* ── stubs: the figure is React and SVG, and nothing else ──────────────────
   `react-native` and `react-native-svg` become plain DOM tags, so react-dom
   renders the same tree the phone does. Reanimated becomes the identity: a
   shared value is `{ value }`, an animated prop is its own function's result.
   Nothing here fakes the *drawing* — only the platform under it. */
const rn = path.join(dir, 'rn.js');
writeFileSync(
  rn,
  `export const View = 'div';
   export const Text = 'span';
   export const Platform = { OS: 'ios', select: (o) => o.ios ?? o.default };
   export const StyleSheet = { create: (s) => s, flatten: (s) => Object.assign({}, ...[s].flat(9)) };
   export const AppState = { currentState: 'active', addEventListener: () => ({ remove() {} }) };
   export const AccessibilityInfo = {
     isReduceMotionEnabled: () => Promise.resolve(false),
     addEventListener: () => ({ remove() {} }),
   };
   export const Pressable = 'div';
   export default {};`,
);

const svg = path.join(dir, 'svg.js');
writeFileSync(
  svg,
  ['G', 'Path', 'Rect', 'Circle', 'Ellipse', 'Line', 'Text', 'TSpan', 'Defs', 'ClipPath',
   'LinearGradient', 'RadialGradient', 'Stop', 'Polygon', 'Polyline', 'Mask', 'Use', 'Symbol']
    .map((n) => `export const ${n} = ${JSON.stringify(n[0].toLowerCase() + n.slice(1))};`)
    .join('\n') + `\nexport const Svg = 'svg';\nexport default 'svg';\n`,
);

const rea = path.join(dir, 'rea.js');
writeFileSync(
  rea,
  `import { createElement } from 'react';
   export const makeMutable = (v) => ({ value: v });
   export const useSharedValue = (v) => ({ value: v });
   export const useDerivedValue = (f) => ({ value: f() });
   export const useAnimatedProps = (f) => f();
   export const useAnimatedStyle = (f) => f();
   export const useAnimatedReaction = () => {};
   export const useFrameCallback = () => ({ setActive() {}, isActive: false });
   export const useReducedMotion = () => false;
   export const cancelAnimation = () => {};
   export const runOnJS = (f) => f;
   export const runOnUI = (f) => f;
   const pass = (v) => v;
   export const withTiming = pass;
   export const withSpring = pass;
   export const withDelay = (_, v) => v;
   export const withSequence = (...v) => v[0];
   export const withRepeat = pass;
   export const interpolate = (x) => x;
   export const interpolateColor = (_, __, out) => out[0];
   export const Extrapolation = { CLAMP: 'clamp' };
   export const Easing = new Proxy({}, { get: () => (t) => t });
   /* An animated SVG group takes its matrix as a prop; the DOM takes it as a
      transform. That mapping is this tool's only opinion about the artwork. */
   const asDom = ({ animatedProps, ...rest }) => {
     const p = { ...rest, ...(animatedProps || {}) };
     if (Array.isArray(p.matrix)) { p.transform = 'matrix(' + p.matrix.join(' ') + ')'; delete p.matrix; }
     if (typeof p.opacity === 'object' && p.opacity) p.opacity = p.opacity.value;
     return p;
   };
   export const createAnimatedComponent = (C) => (props) => createElement(C, asDom(props));
   const View = (props) => createElement('div', asDom(props));
   export default { createAnimatedComponent, View, Text: View };`,
);

/* ── bundle the entry ─────────────────────────────────────────────────── */
const entry = path.join(dir, 'entry.tsx');
writeFileSync(
  entry,
  /* `server.browser`, not `server`: the node build reaches for `util` through a
     dynamic `require` that an ESM bundle cannot satisfy, and nothing here needs
     a stream — one string is the whole output. */
  `import { renderToStaticMarkup } from 'react-dom/server.browser';
   import { KoaFigure } from '@/components/ascnd/koa/koa-figure';
   import { koaStateFor } from '@/lib/koa-emotion';
   export { PEEK, PEEK_FIGURE, LEAN_DEG, peekFrame } from '@/lib/peek-frame';
   export { KOA_ASPECT } from '@/components/ascnd/koa/koa-frame';
   /* The pose is not chosen here. \`card-peek\` asks for the 'celebrate'
      emotion and the Emotion Engine turns that into an expression and a pose;
      this asks the engine the same question, so the face in the picture is the
      face on the phone even after somebody re-tunes the mapping. */
   const state = koaStateFor('celebrate');
   export const art = (size: number) =>
     renderToStaticMarkup(
       <KoaFigure
         size={size}
         animated={false}
         expression={state.expression}
         pose={state.pose}
         worn={state.outfit ?? {}}
       />,
     );`,
);

const bundle = path.join(dir, 'entry.js');
execFileSync(
  'npx',
  ['--yes', 'esbuild', entry, '--bundle', '--format=esm', '--platform=node',
   '--tsconfig=tsconfig.json', '--jsx=automatic',
   `--alias:react-native=${rn}`, `--alias:react-native-svg=${svg}`,
   `--alias:react-native-reanimated=${rea}`,
   `--outfile=${bundle}`],
  { stdio: 'inherit' },
);

const { art, PEEK, PEEK_FIGURE, LEAN_DEG, peekFrame, KOA_ASPECT } =
  await import(pathToFileURL(bundle).href);

/* ── the scene ────────────────────────────────────────────────────────── */
const H = Math.round(PEEK_FIGURE * KOA_ASPECT);
const figure = art(PEEK_FIGURE);

/** rise, lean, and what the frame is meant to show */
const FRAMES = [
  [0, 0, 'nghỉ — phải trống trơn'],
  [0.5, 0, 'đang lên'],
  [1, 0, 'lên hết'],
  [1, 1, `nghiêng ${LEAN_DEG}°`],
  [1, -1, `nghiêng −${LEAN_DEG}°`],
];

const CARD_W = 220;
const CARD_H = 96;
const PAD = 28;

const cell = ([rise, lean, label]) => {
  const f = peekFrame(rise, lean);
  return `
  <div class="cell">
    <div class="stage">
      <div class="wrap">
        <div class="clip">
          <div class="fig" style="transform: translateY(${f.translateY}px) rotate(${f.rotate}deg) scaleY(${f.scaleY})">
            ${figure}
          </div>
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
  .row { display:flex; gap:${PAD}px; padding:${PAD}px }
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
  .card { height:${CARD_H}px; border-radius:20px; background:rgba(255,255,255,.06);
          border:1px solid rgba(255,255,255,.10); display:flex; flex-direction:column;
          justify-content:center; padding:0 16px; gap:4px }
  .card b { color:#f4f4f6; font-size:15px } .card span { color:#9a9aa4; font-size:13px }
</style>
<div class="row">${FRAMES.map(cell).join('')}</div>`,
);

const W = FRAMES.length * CARD_W + (FRAMES.length + 1) * PAD;
const TALL = PEEK + CARD_H + PAD * 2 + 34;

const CHROME = [
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/opt/pw-browsers/chromium/chrome-linux/chrome',
  process.env.CHROME_PATH,
].find((p) => p && existsSync(p));
if (!CHROME) {
  console.log(`Không tìm thấy Chromium — HTML ở ${html}`);
  process.exit(1);
}

execFileSync(
  CHROME,
  ['--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
   '--hide-scrollbars', '--force-device-scale-factor=2',
   /* Without a virtual clock headless keeps the process alive after writing the
      file, waiting on a page that is never going to do anything else. */
   '--virtual-time-budget=1500', `--window-size=${W},${TALL}`,
   `--screenshot=${OUT}`, pathToFileURL(html).href],
  // Headless Chrome has been known to linger after writing the file; the shot
  // is already on disk by then, so a bounded wait is the whole handling.
  { stdio: 'ignore', timeout: 60_000 },
);

console.log(
  `${OUT} — băng ${PEEK}pt, hình ${PEEK_FIGURE}×${H}pt ` +
    `(băng thấy ${Math.round((PEEK / H) * 100)}% chiều cao hình)`,
);
