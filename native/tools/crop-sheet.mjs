/**
 * Cut a grid sheet of icons into one file each, and compress them.
 *
 *   node tools/crop-sheet.mjs <sheet.png> <out-dir> [--cols 5] [--rows 2] \
 *        [--x0 52] [--y0 110] [--w 263] [--h 385] [--gx 292] [--gy 418] \
 *        [--keep 0.62] [--size 256] [--names chest,back,...]
 *
 *   node tools/crop-sheet.mjs <sheet.png> <out-dir> --contact
 *        → draws the crop rectangles over the sheet instead of cutting, so the
 *          numbers can be checked before 10 files are written from bad ones.
 *
 * ── why Chromium and not ImageMagick ──
 *
 * This machine has neither ImageMagick nor Pillow. It does have Playwright, and
 * a browser canvas crops, scales and re-encodes exactly as well — `drawImage`
 * with a source rectangle is the same operation, and the encoder is libwebp.
 *
 * ── `--keep` ──
 *
 * A sheet made for reading has a caption under every tile. The app draws its
 * own captions, in the reader's language, so the bottom of each tile is thrown
 * away rather than baked into a picture that then says "Chest" to somebody
 * reading Vietnamese. `keep` is the fraction of the tile height that is the
 * drawing.
 *
 * ── check before you cut ──
 *
 * `--contact` exists because a grid guessed off a screenshot is wrong the first
 * time. Ten files cut from the wrong rectangle look plausible one by one and
 * are only obviously wrong side by side.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

function loadPlaywright() {
  const req = createRequire(import.meta.url);
  try {
    return req('playwright');
  } catch {
    const g = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
    return createRequire(path.join(g, 'x.js'))('playwright');
  }
}

const [sheet, outDir, ...rest] = process.argv.slice(2);
if (!sheet || !outDir) {
  console.error('dùng: node tools/crop-sheet.mjs <sheet.png> <out-dir> [--cols N ...]');
  process.exit(2);
}
if (!existsSync(sheet)) {
  console.error(`không thấy ${sheet}`);
  process.exit(2);
}

const flag = (name, dflt) => {
  const i = rest.indexOf(`--${name}`);
  return i < 0 ? dflt : rest[i + 1];
};
const num = (name, dflt) => Number(flag(name, dflt));
const contact = rest.includes('--contact');

const cfg = {
  cols: num('cols', 5),
  rows: num('rows', 2),
  x0: num('x0', 52),
  y0: num('y0', 110),
  w: num('w', 263),
  h: num('h', 385),
  gx: num('gx', 292),
  gy: num('gy', 418),
  keep: num('keep', 0.62),
  size: num('size', 256),
};
const names = String(flag('names', '')).split(',').filter(Boolean);

const dataUrl = `data:image/png;base64,${readFileSync(sheet).toString('base64')}`;

const { chromium } = loadPlaywright();
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('about:blank');

const result = await page.evaluate(
  async ({ dataUrl, cfg, contact }) => {
    const img = new Image();
    img.src = dataUrl;
    await img.decode();

    const rects = [];
    for (let r = 0; r < cfg.rows; r++) {
      for (let c = 0; c < cfg.cols; c++) {
        rects.push({
          x: cfg.x0 + c * cfg.gx,
          y: cfg.y0 + r * cfg.gy,
          w: cfg.w,
          h: Math.round(cfg.h * cfg.keep),
        });
      }
    }

    if (contact) {
      const cv = document.createElement('canvas');
      cv.width = img.naturalWidth;
      cv.height = img.naturalHeight;
      const g = cv.getContext('2d');
      g.drawImage(img, 0, 0);
      g.strokeStyle = '#00ff88';
      g.lineWidth = 4;
      g.font = '28px sans-serif';
      g.fillStyle = '#00ff88';
      rects.forEach((t, i) => {
        g.strokeRect(t.x, t.y, t.w, t.h);
        g.fillText(String(i), t.x + 8, t.y + 34);
      });
      return { sheet: { w: img.naturalWidth, h: img.naturalHeight }, contact: cv.toDataURL('image/png'), rects };
    }

    const out = [];
    for (const t of rects) {
      const cv = document.createElement('canvas');
      // square output: the tallest side decides, the drawing is centred in it
      cv.width = cfg.size;
      cv.height = cfg.size;
      const g = cv.getContext('2d');
      g.imageSmoothingQuality = 'high';
      const scale = Math.min(cfg.size / t.w, cfg.size / t.h);
      const dw = t.w * scale;
      const dh = t.h * scale;
      g.drawImage(img, t.x, t.y, t.w, t.h, (cfg.size - dw) / 2, (cfg.size - dh) / 2, dw, dh);
      out.push(cv.toDataURL('image/webp', 0.9));
    }
    return { sheet: { w: img.naturalWidth, h: img.naturalHeight }, tiles: out, rects };
  },
  { dataUrl, cfg, contact },
);

await browser.close();

const write = (file, dataUri) => {
  const b64 = dataUri.slice(dataUri.indexOf(',') + 1);
  const buf = Buffer.from(b64, 'base64');
  writeFileSync(file, buf);
  return buf.length;
};

console.log(`ảnh nguồn ${result.sheet.w}×${result.sheet.h}`);

if (contact) {
  const p = '/tmp/crop-contact.png';
  write(p, result.contact);
  console.log(`đã vẽ ${result.rects.length} khung lên ${p} — mở ra xem có trùng ô không rồi mới cắt`);
} else {
  mkdirSync(outDir, { recursive: true });
  let total = 0;
  result.tiles.forEach((uri, i) => {
    const name = names[i] ?? `tile-${i}`;
    const file = path.join(outDir, `${name}.webp`);
    total += write(file, uri);
    console.log(`  ${name}.webp`);
  });
  console.log(`${result.tiles.length} ảnh, tổng ${(total / 1024).toFixed(1)} KB`);
}
