/**
 * Render the stage exactly as the app composes it: the studio cropped to the
 * room, with Koa standing on the mark.
 *
 * It imports `STAGE_MARK`, `SCENE_BOTTOM` and `HERO_W` rather than copying
 * them. A throwaway version of this script hard-coded the mark, kept the old
 * value when the podium moved, and drew the character standing in front of
 * the podium instead of on it — the app was right and the preview was lying.
 *
 *   node tools/koa-studio/stage.mjs <out.png>
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const OUT = process.argv[2] ?? 'stage.png';
const dir = mkdtempSync(path.join(tmpdir(), 'koa-stage-'));

execFileSync('node', ['tools/koa-studio/preview.mjs', path.join(dir, 'studio.png')], { stdio: 'ignore' });
const entry = path.join(dir, 'e.ts');
writeFileSync(
  entry,
  `export { STAGE_MARK, SCENE_BOTTOM, STUDIO_W } from '@/components/ascnd/studio/palette';
   export { HERO_W, KOA_ASPECT } from '@/components/ascnd/koa/koa-frame';`,
);
execFileSync(
  'npx',
  ['esbuild', entry, '--bundle', '--format=esm', '--tsconfig=tsconfig.json',
   `--outfile=${path.join(dir, 'c.js')}`],
  { stdio: 'ignore' },
);
// `HERO_W` used to be copied here, with a comment saying it was imported. It is
// imported now — the stage, the gaze and this tool all read `koa-frame.ts`.
const { STAGE_MARK, SCENE_BOTTOM, STUDIO_W, HERO_W, KOA_ASPECT } =
  await import(pathToFileURL(path.join(dir, 'c.js')));

const studio = readFileSync(path.join(dir, 'studio.svg'), 'utf8');

const size = HERO_W;
const left = STAGE_MARK.x - size / 2;
const top = STAGE_MARK.y - size * KOA_ASPECT + 6;

const require_ = createRequire(import.meta.url);
const { chromium } = require_('playwright');

// Koa is optional: without the scene mirror this still renders the empty room
let koa = '';
try {
  const { figure } = require_(path.resolve('../koa-figure-mirror.js'));
  koa = figure('happy', 'idle', {}, 20000);
} catch {
  /* the room alone is the point */
}
if (koa) {
  koa = koa
    .replace('<svg ', `<svg x="${left}" y="${top}" width="${size}" height="${size * 1.25}" preserveAspectRatio="xMidYMax meet" `)
    .replace(' width="200" height="250"', '');
}

const svg = studio.replace(/height="844"/, `height="${SCENE_BOTTOM}"`).replace('</svg>', koa + '</svg>');
const html = path.join(dir, 'stage.html');
writeFileSync(
  html,
  `<body style="margin:0;background:#070708;font-family:-apple-system,Inter,system-ui,sans-serif">
     <div style="width:${STUDIO_W}px;height:${SCENE_BOTTOM}px;overflow:hidden">${svg}</div>
   </body>`,
);

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: STUDIO_W, height: SCENE_BOTTOM },
  deviceScaleFactor: 2,
});
await page.goto(pathToFileURL(html).href);
await page.waitForTimeout(250);
await page.screenshot({ path: OUT });
await browser.close();
console.log(
  `${OUT} — ${STUDIO_W}×${SCENE_BOTTOM}, mốc đứng (${STAGE_MARK.x}, ${STAGE_MARK.y}), ` +
    (koa ? `Koa rộng ${size}` : 'phòng trống — không thấy koa-figure-mirror.js'),
);
