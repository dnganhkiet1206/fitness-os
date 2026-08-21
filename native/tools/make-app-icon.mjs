/**
 * Turns the brand artwork into every icon the app ships.
 *
 * Run it when the artwork changes:
 *
 *     node tools/make-app-icon.mjs
 *
 * Reads `assets/brand/app-icon-source.png` and writes the five files `app.json`
 * points at. The source stays in the repository so a later pass starts from
 * something lossless.
 *
 * ── the corners are the whole problem ──
 *
 * The artwork is a rounded black square drawn on a white page. Measured, it is
 * already **full-bleed** — the black reaches the edge at the middle of every
 * side — and the only white left is the four corner fillets, 3.3% of the image.
 *
 * That 3.3% cannot ship. Expo's own guidance for the iOS icon is blunt: *"Make
 * sure the icon fills the whole square, with no rounded corners or other
 * transparent pixels… The operating system will mask your icon."* Hand iOS an
 * already-rounded picture and it rounds it a **second** time, leaving four
 * white slivers poking out of the corners of the mask. Nothing errors; the icon
 * just looks broken on the home screen.
 *
 * ── why the fill is a flood and not a colour replace ──
 *
 * The obvious version — "replace white with the icon's black" — destroys the
 * icon. The A and the koala **are white**, and they are the entire mark.
 *
 * The corners are reachable and the mark is not: the black square lies between
 * them, so a flood fill starting at the four corners can only ever reach the
 * paper. It follows the real arc rather than a radius somebody typed, and it
 * cannot touch the mark without first crossing the square.
 *
 * The flood is bounded as a check, not as a hope: the fillets of a rounded
 * square of radius R cover `4R²(1 − π/4)`, which for this artwork is about 3%
 * — and the measured flood is 3.33%. A flood outside 1–8% means it leaked
 * somewhere it should not have, and an icon that has quietly eaten its own
 * logo is not something anybody notices until it is on a phone.
 *
 * ── the background is noisy, and that is not cosmetic ──
 *
 * The artwork is a render, not a flat fill: its "black" wanders between 11 and
 * 23. Measured over the whole image the luminance is two clean populations —
 * 83% under 30, 16% over 230, and almost nothing between — so the noise is
 * invisible to a person and enormous to everything else.
 *
 * It broke two things. `deflate` has nothing to predict from, so a flat black
 * icon came out **788 KB**. And extracting the mark by luminance handed the
 * background an alpha of ~15/255: the splash would have shown a faint ghost of
 * the entire square floating behind the logo, which is the exact thing a
 * transparent mark was chosen to avoid.
 *
 * So the background is snapped to one colour below 30, and the mark's alpha is
 * rescaled from that floor rather than from zero. Both use the gap the
 * histogram already shows; neither invents a threshold.
 *
 * ── and why filling comes before extracting the mark ──
 *
 * After the fill, **everything bright is the mark**. That is what makes the
 * splash and Android layers a one-line extraction (`alpha = luminance`) instead
 * of a second piece of geometry. The two steps do not commute.
 */
import { createRequire } from 'node:module';
import { statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const Jimp = require('jimp-compact');

const SRC = path.join(NATIVE, 'assets/brand/app-icon-source.png');
const IMG = (f) => path.join(NATIVE, 'assets/images', f);

/** Bright enough to be paper or mark rather than background. */
const BRIGHT = 128;

/**
 * The Android safe zone is a CIRCLE, and that is the whole subtlety here.
 *
 * An adaptive icon is 108dp of canvas of which only the middle 72dp survives
 * the launcher's mask — but that 72dp is a *diameter*, not a side. The stock
 * Pixel launcher masks to a circle; others use squircles and rounded squares.
 * Only what fits inside the inscribed circle is safe everywhere.
 *
 * Fitting the mark to 60% of the frame's **width** looked right and was not:
 * rendered with the safe circle drawn over it, the two legs of the A crossed
 * clearly outside it. Wide artwork passes a width test and fails a radius test,
 * because the corners are further from the centre than the edges are.
 *
 * So the mark is scaled by the furthest **opaque pixel** from its centre, not
 * by its bounding box — the box corners of an A are empty, and using them would
 * shrink the logo for no reason. 0.90 of the radius keeps a little air between
 * the legs and the mask edge.
 */
const SAFE_DIAMETER = 2 / 3;
const SAFE_USED = 0.9;

const read = (p) => new Promise((res, rej) => Jimp.read(p, (e, i) => (e ? rej(e) : res(i))));
const write = (img, p) => new Promise((res, rej) => img.write(p, (e) => (e ? rej(e) : res())));
const kb = (p) => `${(statSync(p).size / 1024).toFixed(0)} KB`;

const source = await read(SRC);
const W = source.bitmap.width;
const H = source.bitmap.height;
if (W !== H) {
  console.log(`ảnh gốc ${W}×${H} KHÔNG vuông — icon phải vuông tuyệt đối`);
  process.exit(1);
}

const lumAt = (img, x, y) => {
  const d = img.bitmap.data;
  const k = (y * img.bitmap.width + x) * 4;
  return (d[k] + d[k + 1] + d[k + 2]) / 3;
};

/**
 * The two populations the histogram shows, and the only thresholds in this file.
 *
 * 83% of the image sits under 30 and 16% over 230, with the span between them
 * essentially empty — those are the background and the mark, and everything
 * between is the antialiasing along their border.
 */
const BG_MAX = 30;
const MARK_MIN = 230;

/* The icon's own background colour, taken as the MEDIAN of the dark population
   rather than from one sampled pixel — the background is a noisy render, and a
   single sample would make the colour that `app.json` has to match depend on
   which speck of noise happened to be at those coordinates. */
const bg = (() => {
  const d = source.bitmap.data;
  const rs = [];
  const gs = [];
  const bs = [];
  for (let i = 0; i < d.length; i += 4) {
    if ((d[i] + d[i + 1] + d[i + 2]) / 3 < BG_MAX) {
      rs.push(d[i]);
      gs.push(d[i + 1]);
      bs.push(d[i + 2]);
    }
  }
  const mid = (a) => a.sort((x, y) => x - y)[a.length >> 1];
  return { r: mid(rs), g: mid(gs), b: mid(bs) };
})();
const BG_HEX = `#${[bg.r, bg.g, bg.b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;

/* ── 1. flood the four corner fillets with the icon's own background ── */
{
  const seen = new Uint8Array(W * H);
  const stack = [];
  for (const [sx, sy] of [[0, 0], [W - 1, 0], [0, H - 1], [W - 1, H - 1]]) {
    if (lumAt(source, sx, sy) > BRIGHT) {
      const p = sy * W + sx;
      seen[p] = 1;
      stack.push(p);
    }
  }
  let filled = 0;
  const d = source.bitmap.data;
  while (stack.length) {
    const p = stack.pop();
    const x = p % W;
    const y = (p - x) / W;
    const k = p * 4;
    d[k] = bg.r;
    d[k + 1] = bg.g;
    d[k + 2] = bg.b;
    d[k + 3] = 255;
    filled++;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const q = ny * W + nx;
      if (seen[q] || lumAt(source, nx, ny) <= BRIGHT) continue;
      seen[q] = 1;
      stack.push(q);
    }
  }
  const pct = (filled / (W * H)) * 100;
  console.log(`tô góc bo bằng ${BG_HEX}: ${pct.toFixed(2)}% điểm ảnh`);
  if (pct < 1 || pct > 8) {
    console.log(
      `\nDỪNG: vùng loang ${pct.toFixed(2)}% nằm ngoài dải 1–8%. Bốn fillet của một hình vuông bo bán ` +
        'kính R chiếm 4R²(1−π/4) ≈ 3%, nên ngoài dải này nghĩa là phép loang đã rò sang chỗ khác — ' +
        'nhiều khả năng đã ăn vào chính dấu hiệu. Một icon bị xoá mất logo không ai phát hiện cho tới ' +
        'khi nó lên máy thật.',
    );
    process.exit(1);
  }
}

/* ── 1b. flatten the background to one colour ──

   Invisible to a person: the noise spans 12 levels at a luminance of about 15.
   Not invisible to deflate, which had nothing to predict from and produced a
   788 KB icon for what is a flat black square with a logo on it. Only pixels
   already below the background threshold are touched, so the antialiased border
   of the mark keeps its gradient and nothing gains an edge. */
{
  const d = source.bitmap.data;
  let flat = 0;
  for (let i = 0; i < d.length; i += 4) {
    if ((d[i] + d[i + 1] + d[i + 2]) / 3 < BG_MAX) {
      d[i] = bg.r;
      d[i + 1] = bg.g;
      d[i + 2] = bg.b;
      flat++;
    }
  }
  console.log(`làm phẳng nền: ${((flat / (W * H)) * 100).toFixed(1)}% điểm ảnh về một màu`);
}

/* ── 2. the iOS / home-screen icon: full-bleed, and no alpha channel at all ── */
{
  const icon = source.clone().resize(1024, 1024);
  /* 2 = truecolour **without** alpha. Not a detail: App Store Connect rejects an
     icon carrying an alpha channel, and it does so at submission — long after
     every build has succeeded. Stated here so the file cannot round-trip into
     RGBA by accident. */
  icon.colorType(2);
  icon.deflateLevel(9);
  await write(icon, IMG('icon.png'));
  console.log(`icon.png            1024×1024  ${kb(IMG('icon.png'))}  (không kênh alpha)`);
}

/* ── 3. the mark alone, on nothing ──

   Everything bright is the mark now, so this is a luminance key: white where it
   was white, transparent where the square was. */
const mark = source.clone();
{
  const d = mark.bitmap.data;
  for (let i = 0; i < d.length; i += 4) {
    const lum = (d[i] + d[i + 1] + d[i + 2]) / 3;
    /* Rescaled between the two populations, not taken raw. Raw luminance gives
       the background an alpha of ~15/255 — a 6% ghost of the whole square,
       which on the splash is precisely the rectangle a transparent mark exists
       to avoid. */
    const a = Math.max(0, Math.min(1, (lum - BG_MAX) / (MARK_MIN - BG_MAX)));
    d[i] = 255;
    d[i + 1] = 255;
    d[i + 2] = 255;
    d[i + 3] = Math.round(a * 255);
  }
}

/*
  The mark's own bounds, measured once and reused by both the splash and the
  Android layers.
*/
const bounds = (() => {
  const d = mark.bitmap.data;
  let x0 = W;
  let y0 = H;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (d[(y * W + x) * 4 + 3] > BRIGHT) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
})();
console.log(`dấu hiệu trong ảnh gốc: ${bounds.w}×${bounds.h} (${((bounds.w / W) * 100).toFixed(0)}% rộng)`);

/* ── 4. splash: the mark floating on the splash colour ──

   Cropped to the mark, not left inside the icon's frame. `app.json` says
   `imageWidth: 120`, and that number should mean the logo is 120 points wide.
   Shipping the mark inside 33% of its own padding quietly made it 80 — the
   config would still read as if it had been chosen, and it would be describing
   something else. A small margin so nothing sits flush against the edge. */
{
  const MARGIN = 0.06;
  const side = Math.round(Math.max(bounds.w, bounds.h) * (1 + MARGIN * 2));
  const splash = await new Promise((res, rej) =>
    new Jimp(side, side, 0x00000000, (e, i) => (e ? rej(e) : res(i))),
  );
  splash.composite(
    mark.clone().crop(bounds.x0, bounds.y0, bounds.w, bounds.h),
    Math.round((side - bounds.w) / 2),
    Math.round((side - bounds.h) / 2),
  );
  /* Left at its natural crop size instead of forced up to 1024.
     `make-aura-figure.mjs` states the rule this was breaking — never upscale,
     the source is the better picture by definition — and 1024 was an arbitrary
     number anyway: Expo draws this at `imageWidth: 120`, so the crop is already
     nearly eight times the size it is ever seen at. */
  splash.colorType(6);
  splash.deflateLevel(9);
  await write(splash, IMG('splash-icon.png'));
  console.log(
    `splash-icon.png     ${side}×${side}    ${kb(IMG('splash-icon.png'))}  (dấu hiệu đã cắt sát, ` +
      `imageWidth trong app.json giờ đúng là bề rộng dấu hiệu)`,
  );
}

/* ── 5. Android foreground + monochrome: the same mark, inside the safe zone ── */
{
  /* Trim to the mark itself first, so "60% of the frame" means 60% of the
     *mark*, not 60% of a source that already had its own margins. */
  const d = mark.bitmap.data;
  const { x0, y0, w: mw, h: mh } = bounds;

  const SIZE = 512;

  /* The furthest opaque pixel from the mark's own centre, measured rather than
     assumed from the bounding box. */
  const cx = (mw - 1) / 2;
  const cy = (mh - 1) / 2;
  let rMax = 0;
  for (let y = 0; y < mh; y++) {
    for (let x = 0; x < mw; x++) {
      if (d[((y + y0) * W + (x + x0)) * 4 + 3] > BRIGHT) {
        const r = Math.hypot(x - cx, y - cy);
        if (r > rMax) rMax = r;
      }
    }
  }
  const safeR = (SIZE * SAFE_DIAMETER) / 2 * SAFE_USED;
  const scale = safeR / rMax;
  console.log(
    `  bán kính dấu hiệu ${rMax.toFixed(0)}px → thu ${(scale * 100).toFixed(0)}% để nằm trong ` +
      `vòng an toàn (bán kính ${safeR.toFixed(0)}px của khung ${SIZE})`,
  );

  const cropped = mark.clone().crop(x0, y0, mw, mh);
  cropped.resize(Math.round(mw * scale), Math.round(mh * scale));

  const layer = await new Promise((res, rej) =>
    new Jimp(SIZE, SIZE, 0x00000000, (e, i) => (e ? rej(e) : res(i))),
  );
  layer.composite(
    cropped,
    Math.round((SIZE - cropped.bitmap.width) / 2),
    Math.round((SIZE - cropped.bitmap.height) / 2),
  );
  layer.colorType(6);
  layer.deflateLevel(9);

  for (const f of ['android-icon-foreground.png', 'android-icon-monochrome.png']) {
    await write(layer, IMG(f));
    console.log(`${f.padEnd(20)}${SIZE}×${SIZE}    ${kb(IMG(f))}`);
  }
  /* Proof rather than intent: re-measure the finished layer against the circle
     it has to survive. */
  {
    const ld = layer.bitmap.data;
    const c = (SIZE - 1) / 2;
    let worst = 0;
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        if (ld[(y * SIZE + x) * 4 + 3] > BRIGHT) {
          const r = Math.hypot(x - c, y - c);
          if (r > worst) worst = r;
        }
      }
    }
    const limit = (SIZE * SAFE_DIAMETER) / 2;
    console.log(
      `  → điểm xa tâm nhất của lớp đã xuất: ${worst.toFixed(0)}px / ${limit.toFixed(0)}px cho phép ` +
        `(${((worst / limit) * 100).toFixed(0)}% vùng an toàn)`,
    );
    if (worst > limit) {
      console.log('\nDỪNG: dấu hiệu vẫn tràn khỏi vòng an toàn — launcher mặt nạ tròn sẽ cắt mất rìa');
      process.exit(1);
    }
  }
}

/* ── 6. favicon ── */
{
  const fav = source.clone().resize(196, 196);
  fav.colorType(2);
  fav.deflateLevel(9);
  await write(fav, IMG('favicon.png'));
  console.log(`favicon.png         196×196    ${kb(IMG('favicon.png'))}`);
}

console.log(`\nxong — màu nền icon là ${BG_HEX}, app.json phải dùng đúng màu này cho adaptiveIcon`);
