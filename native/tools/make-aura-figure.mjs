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
 * ── why the paper has to come off, whichever paper it is ──
 *
 * The app's background is `#070708`. The artwork has arrived on **white** and
 * on **black**, and both need removing — white because it drops a bright
 * rectangle into a near-black screen, black because `#000` is not `#070708` and
 * a not-quite-black rectangle has visible straight edges down its sides.
 *
 * So the paper is measured at the corners, not assumed. Getting it wrong is not
 * a subtle failure: keying white out of a black-backed picture erases the
 * picture and keeps the background.
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
 * Wide enough, and no wider — and 512 is where "wide enough" turned out to be.
 *
 * This was going to be a smaller number. The layer is dim, still, and never the
 * thing being looked at, so the instinct is that almost any resolution does.
 *
 * That instinct is wrong here, and it took rendering it to see why. The figure
 * draws about 349pt wide, which is **1047px** on a 3× screen, so every candidate
 * was compared at that size rather than at 1:1. Compared honestly, the artwork's
 * whole character is its particle texture — thousands of individual dots — and
 * texture is exactly what upscaling destroys first. At 360 the dots smear into a
 * blur and the figure stops being made of particles at all; at 420 it is still
 * visibly soft. At 512 the dots hold.
 *
 * So this is a quality floor discovered by looking, not a size budget picked in
 * advance. Lowering it is not a free trade against file size — it changes what
 * the picture *is*.
 */
const WIDTH = 512;

/**
 * The ceiling, and why it is this high.
 *
 * It started at 150 KB, which was a number chosen before anybody had seen the
 * real artwork. The real artwork is thousands of discrete bright dots on black —
 * close to worst case for deflate, which has nothing to predict from — and at
 * the width the picture needs it lands near 390 KB.
 *
 * Everything cheaper was measured and rejected on evidence:
 *
 *   · **posterize(16)** saves 127 KB and *measurably alters the artwork*: the
 *     faint outer haze comes out 23% darker. That is a change in the picture's
 *     falloff, and worse, it is a second thing dimming the layer behind the
 *     screen's single `FIGURE_PEAK` knob. One number in two places is the drift
 *     this repository keeps fixing.
 *   · **png filter strategies** — all five, since they are lossless and free if
 *     one wins. `AUTO` was already best; `NONE` was 546 KB.
 *   · **cropping the empty margin** — only 17% of the pixels, and the space
 *     above the figure is the composition, not waste.
 *
 * So the ceiling is set above what the picture actually costs, to catch a
 * *regression* — an uncompressed drop-in, a source swapped for something twice
 * the size — rather than to force a quality decision that has already been made
 * by looking at it. For scale: the source is 2074 KB and what ships is 390 KB,
 * so the ceiling has room for the artwork to grow without leaving room for
 * somebody to drop the raw file in.
 *
 * (This paragraph used to point at `logo-glow.png`, 331 KB, as evidence that the
 * repository already carried an asset this size. That file was deleted a commit
 * later with the rest of the Expo template artwork, and the justification went
 * on reading as true while pointing at nothing. Numbers measured from the files
 * this script actually writes cannot rot that way.)
 */
const MAX_BYTES = 420 * 1024;

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

/*
  Which paper is it on?

  The artwork has arrived both ways — a glow on white, and the same glow on
  black — so the paper is measured rather than assumed. Guessing wrong is not a
  subtle failure: keying white out of a black-backed image erases the entire
  picture and leaves the background, which is as wrong as an image can be.

  The corners are the sample for the same reason as above: they are where the
  paper is, and no version of this artwork puts the figure in a corner.
*/
const corner = corners.reduce((sum, c) => sum + (c.r + c.g + c.b) / 3, 0) / corners.length;
const onWhite = corner > 127;

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
    /*
      Distance from the paper, and the two papers are mirror images.

      On white, the surviving channel is the SMALLEST — white is the one colour
      with no small channel, so a saturated speck always keeps one.
      On black it is the LARGEST, for the mirror reason: black is the one colour
      with no large channel, and any glow has one.
    */
    const a = onWhite
      ? (255 - Math.min(d[idx], d[idx + 1], d[idx + 2])) / 255
      : Math.max(d[idx], d[idx + 1], d[idx + 2]) / 255;
    if (a <= 0) {
      d[idx + 3] = 0;
      cleared++;
      return;
    }
    /*
      Unmix the paper, so the colour is the one that was drawn rather than the
      one that was drawn plus paper:

        on white   C = F·a + 255·(1−a)  ⇒  F = (C − 255·(1−a)) / a
        on black   C = F·a +   0·(1−a)  ⇒  F = C / a

      The black case matters more than it looks. A dim outer speck of
      `(10,30,40)` is a *faint cyan*, not a dark grey-blue: leaving it
      premultiplied would composite it at 16% of an already-dark colour and the
      whole outer haze would go dead. Dividing restores it to the cyan it is,
      seen faintly.
    */
    const paper = onWhite ? 255 * (1 - a) : 0;
    for (let k = 0; k < 3; k++) {
      d[idx + k] = Math.max(0, Math.min(255, Math.round((d[idx + k] - paper) / a)));
    }
    /* Multiplied into whatever alpha the file already had rather than
       overwriting it: a source that is partly transparent already stays that
       way instead of being handed a fresh opaque background. */
    d[idx + 3] = Math.round((d[idx + 3] / 255) * a * 255);
    if (d[idx + 3] < 8) cleared++;
  });
  const pct = ((cleared / (w * h)) * 100).toFixed(1);
  console.log(`khử nền ${onWhite ? 'TRẮNG' : 'ĐEN'} (đo ở 4 góc): ${pct}% số điểm ảnh trở thành trong suốt`);
  if (cleared === 0) {
    console.log('CẢNH BÁO: không điểm nào bị xoá — 4 góc có thể không phải nền');
  }
}
/*
  Flatten the colour of everything fully transparent.

  Sixty percent of this image is invisible, and the RGB sitting under that
  invisibility is still whatever the exporter happened to leave there — noise
  that nobody can see and that deflate must still encode. Setting it to a single
  constant costs nothing visually, by construction: these are pixels with zero
  alpha. Measured, it takes about 20% off the file.
*/
let flattened = 0;
image.scan(0, 0, image.bitmap.width, image.bitmap.height, function (_x, _y, idx) {
  const d = this.bitmap.data;
  if (d[idx + 3] < 8) {
    d[idx] = 0;
    d[idx + 1] = 0;
    d[idx + 2] = 0;
    d[idx + 3] = 0;
    flattened++;
  }
});
console.log(
  `dọn màu ở vùng trong suốt: ${((flattened / (image.bitmap.width * image.bitmap.height)) * 100).toFixed(0)}% điểm ảnh`,
);

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
