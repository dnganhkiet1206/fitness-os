/**
 * Render Koa's real components in a browser, so a face can be looked at.
 *
 * ── why this exists as a module ──
 *
 * `peek.mjs` had all of this inline, and the moment a second tool needed the
 * same thing the choice was to copy eighty lines of platform stubs or to share
 * them. Copies of a stub set drift exactly like copies of anything else, and
 * these stubs decide what the picture *is* — a second copy with one different
 * default is a tool quietly drawing a different character.
 *
 * ── what it fakes, and what it must not ──
 *
 * `react-native` and `react-native-svg` become plain DOM tags; Reanimated
 * becomes the identity function, so an animated prop is whatever its own
 * worklet returns at rest. That is the platform, and only the platform. The
 * drawing — every path, every flag, every transform in `koa-flags` and the
 * generated scene — is the app's own code, imported, not restated. If a picture
 * from here is wrong, the app is wrong.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Bundle an entry that may import anything under `@/`, with the platform
 * stubbed, and return its exports.
 *
 * @param entrySource TSX source. It gets `react-dom/server.browser` for free —
 *   `server` proper reaches for `util` through a dynamic require an ESM bundle
 *   cannot satisfy, and one string is the whole output anyway.
 */
export async function bundleWithKoaStubs(entrySource) {
  /* Inside the project, and *beside* `node_modules` rather than in it: the
     stubs import `react`, so the entry needs a `node_modules` to walk up into —
     and esbuild ignores a tsconfig's `paths` for anything under
     `node_modules`, so the `@/` imports would stop resolving one level deeper. */
  const dir = mkdtempSync(path.join(NATIVE, '.koa-dom-'));
  process.on('exit', () => rmSync(dir, { recursive: true, force: true }));

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
        transform. That mapping is this module's only opinion about the drawing. */
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

  const entry = path.join(dir, 'entry.tsx');
  writeFileSync(entry, entrySource);

  const bundle = path.join(dir, 'entry.js');
  execFileSync(
    'npx',
    ['--yes', 'esbuild', entry, '--bundle', '--format=esm', '--platform=node',
     '--tsconfig=tsconfig.json', '--jsx=automatic',
     `--alias:react-native=${rn}`, `--alias:react-native-svg=${svg}`,
     `--alias:react-native-reanimated=${rea}`,
     `--outfile=${bundle}`],
    { cwd: NATIVE, stdio: 'inherit' },
  );

  return { mod: await import(pathToFileURL(bundle).href), dir };
}

/** The one entry every face tool wants: the figure, at a size, in a state. */
export const KOA_ART_ENTRY = `import { renderToStaticMarkup } from 'react-dom/server.browser';
  import { KoaFigure } from '@/components/ascnd/koa/koa-figure';
  import type { KoaExpression, KoaPose, Worn } from '@/components/ascnd/koa/koa-flags';
  export { KOA_EXPRESSIONS } from '@/components/ascnd/koa/koa-flags';
  export { KOA_ASPECT } from '@/components/ascnd/koa/koa-frame';
  export { koaStateFor } from '@/lib/koa-emotion';
  export const art = (size: number, expression: KoaExpression, pose: KoaPose, worn: Worn = {}) =>
    renderToStaticMarkup(
      <KoaFigure size={size} animated={false} expression={expression} pose={pose} worn={worn} />,
    );`;

const CHROME = [
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/opt/pw-browsers/chromium/chrome-linux/chrome',
  process.env.CHROME_PATH,
].find((p) => p && existsSync(p));

/** Screenshot a local HTML file at 2× into `out`. Returns false with no browser. */
export function shoot(htmlPath, out, width, height) {
  if (!CHROME) return false;
  execFileSync(
    CHROME,
    ['--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
     '--hide-scrollbars', '--force-device-scale-factor=2',
     /* Without a virtual clock headless keeps the process alive after writing
        the file, waiting on a page that is never going to do anything else. */
     '--virtual-time-budget=1500', `--window-size=${width},${height}`,
     `--screenshot=${out}`, pathToFileURL(htmlPath).href],
    { stdio: 'ignore', timeout: 60_000 },
  );
  return true;
}
