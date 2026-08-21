/**
 * Turns the source artwork into the background figure the assistant screens use.
 *
 * Run it when the artwork changes:
 *
 *     node tools/make-aura-figure.mjs
 *
 * It reads `assets/aura/figure-source.png` and writes `assets/aura/figure.png`.
 * The source stays in the repository so a later pass starts from something
 * lossless rather than from the already-shrunk copy.
 *
 * ── why the white has to come off ──
 *
 * The app's background is `#070708`. The artwork is a glowing figure on
 * **white**. Dropped in as-is it is not a subtle backdrop, it is a bright white
 * rectangle in the middle of a near-black screen — the exact opposite of what
 * the layer is for.
 *
 * ── and why the key is `min(r, g, b)` ──
 *
 * The obvious two choices are both wrong here.
 *
 * A **hard threshold** ("anything above 240 is background") cuts a jagged edge
 * through a picture whose whole subject is a soft haze, and this artwork fades
 * into its background continuously — there is no edge to find.
 *
 * A **luminance key** (`alpha = 1 - brightness`) is worse, and it is worse in
 * the way that matters: the bright cyan and violet specks are the *subject*,
 * and they are bright. Keying on brightness deletes precisely them and keeps
 * the dark body — the picture inside out.
 *
 * Distance from white along the **smallest channel** does the right thing,
 * because white is the one colour with no small channel:
 *
 *     alpha = 1 − min(r, g, b) / 255
 *
 *     white (255,255,255)  → 0.00  gone
 *     pale smoke (230…)    → 0.10  almost gone
 *     cyan speck (34,230,255) → 0.87  kept, at full brightness
 *     navy body (10,10,42) → 0.96  kept, and it sinks into #070708 by itself
 *
 * Any saturated colour keeps at least one low channel however bright it is, so
 * the specks survive at full strength while the paper they were drawn on does
 * not. The falloff is continuous, so the haze stays a haze.
 *
 * ── the order is resize, then key — and then undo the white ──
 *
 * Keying first and resizing after looks equivalent and is not. Resampling mixes
 * neighbouring pixels, and after a key the neighbours of a speck are *white
 * pixels that happen to be invisible* — so their whiteness bleeds into the
 * speck's colour while their transparency bleeds into its alpha. Measured on a
 * fixture, a cyan speck of `(34,230,255)` came out `(152,243,255)`: the right
 * shape, milky. Over a near-black screen that reads as grey haze rather than as
 * neon.
 *
 * Resizing **first**, while the artwork still sits on its white paper, is the
 * blend the artwork was drawn for, and every intermediate pixel is a colour
 * that genuinely appears in the picture.
 *
 * What is left after keying is a colour still mixed with the paper, and that is
 * exactly invertible. Every pixel is `C = F·a + 255·(1−a)` for some true colour
 * `F`, so:
 *
 *     F = (C − 255·(1 − a)) / a
 *
 * Undoing it restores the speck to a clean cyan instead of a washed one. It is
 * arithmetic, not a taste adjustment: it recovers the colour the artist put
 * there, which white paper had been added to.
 *
 * ── why the brightness is not applied here ──
 *
 * It would be easy to dim the pixels on the way through, and that is the wrong
 * place for it. The screen already controls the layer's strength with one
 * constant (`FIGURE_PEAK` in `assistant-aura.tsx`), the way the dust layers have
 * always been controlled. Baking a second dimming into the file would put one
 * number in two places, which is the drift this repository has had to fix six
 * times. One knob, adjustable without re-encoding anything.
 */
import { createRequire } from 'node:module';
import { statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const Jimp = require('jimp-compact');

/* Paths are overridable so the key can be exercised on a fixture rather than
   only on the real artwork — `tools/aura-figure.mjs` does exactly that. */
const SRC = process.argv[2] ?? path.join(NATIVE, 'assets/aura/figure-source.png');
const OUT = process.argv[3] ?? path.join(NATIVE, 'assets/aura/figure.png');

/**
 * Wide enough, and no wider.
 *
 * This is a dim, still backdrop that nobody inspects — it is never the thing
 * being looked at, which is the entire design brief for the layer. Width is the
 * one lever that actually moves the file size, so it is the lever used: 512
 * still covers a 3× screen at the size the figure is drawn, and costs a
 * fraction of the source. If the result comes out over budget, drop this to 420
 * rather than reaching for heavier compression.
 */
const WIDTH = 512;

/** Refuse to ship something that is not a background's worth of bytes. */
const MAX_BYTES = 150 * 1024;

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

const image = await new Promise((res, rej) =>
  Jimp.read(SRC, (err, img) => (err ? rej(err) : res(img))),
);

const srcBytes = statSync(SRC).size;
const w0 = image.bitmap.width;
const h0 = image.bitmap.height;

/*
  Does it already have a background, or has one been removed for us?

  Checked at the four corners rather than by `hasAlpha()`, which reports the
  file's colour type and is true of any RGBA png including a fully opaque one.
  The question here is not "is there an alpha channel" but "is the paper still
  there", and the corners are where the paper is.
*/
const corners = [
  [0, 0],
  [w0 - 1, 0],
  [0, h0 - 1],
  [w0 - 1, h0 - 1],
].map(([x, y]) => Jimp.intToRGBA(image.getPixelColor(x, y)));
const alreadyKeyed = corners.every((c) => c.a < 8);

/* Never upscale. The source is the better picture by definition, and inventing
   pixels above it spends bytes on detail that was never drawn — on a layer
   whose whole purpose is to not be looked at closely. */
if (w0 > WIDTH) image.resize(WIDTH, Jimp.AUTO);
else console.log(`ảnh gốc chỉ rộng ${w0}px — giữ nguyên, không phóng to`);

const w = image.bitmap.width;
const h = image.bitmap.height;

if (alreadyKeyed) {
  console.log('nền đã trong suốt sẵn — bỏ qua bước khử nền');
} else {
  let cleared = 0;
  image.scan(0, 0, w, h, function (_x, _y, idx) {
    const d = this.bitmap.data;
    const a = (255 - Math.min(d[idx], d[idx + 1], d[idx + 2])) / 255;
    if (a <= 0) {
      d[idx + 3] = 0;
      cleared++;
      return;
    }
    /* Unmix the paper: C = F·a + 255·(1−a)  ⇒  F = (C − 255·(1−a)) / a */
    const white = 255 * (1 - a);
    for (let k = 0; k < 3; k++) {
      d[idx + k] = Math.max(0, Math.min(255, Math.round((d[idx + k] - white) / a)));
    }
    /* Multiplied into whatever alpha the file already had rather than
       overwriting it: a source that is partly transparent already stays that
       way instead of being handed a fresh opaque background. */
    d[idx + 3] = Math.round((d[idx + 3] / 255) * a * 255);
    if (d[idx + 3] < 8) cleared++;
  });
  const pct = ((cleared / (w * h)) * 100).toFixed(1);
  console.log(`khử nền trắng: ${pct}% số điểm ảnh trở thành trong suốt`);
  if (cleared === 0) {
    console.log('CẢNH BÁO: không điểm nào bị xoá — ảnh gốc có thể không có nền trắng');
  }
}
/* 6 = RGBA. Stated rather than inherited, because the whole layer depends on
   the alpha channel surviving the write; a source saved as palette or as RGB
   would otherwise round-trip without one and the screen would show paper. */
image.colorType(6);
image.deflateLevel(9);

await new Promise((res, rej) => image.write(OUT, (err) => (err ? rej(err) : res())));

const outBytes = statSync(OUT).size;
console.log(
  `${w0}×${h0} (${kb(srcBytes)})  →  ${image.bitmap.width}×${image.bitmap.height} (${kb(outBytes)})`,
);

if (outBytes > MAX_BYTES) {
  console.log(
    `\nQUÁ NGƯỠNG: ${kb(outBytes)} > ${kb(MAX_BYTES)}. Hạ WIDTH xuống 420 rồi chạy lại — ` +
      'bề rộng là đòn bẩy thật, nén mạnh hơn thì không.',
  );
  process.exit(1);
}
console.log(`\nxong — ${OUT.replace(NATIVE + '/', '')}`);
