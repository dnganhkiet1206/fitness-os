/**
 * The shop's four shots, checked rather than eyeballed.
 *
 *   node tools/shop-camera.mjs
 *
 * Each invariant is tied to a decision that would otherwise fail silently:
 *
 * - **Every shot is inside the scene.** `cameraAt` covers, so a shot that runs
 *   past the artboard shows nothing — not a black bar, just the last thing
 *   drawn there, which on this scene is wall and looks fine until it is the
 *   edge of the wardrobe. A shot cannot report that it is off the end.
 * - **No two shots differ in zoom by more than 2×.** A move that also doubles
 *   the magnification is a lurch however smoothly it is timed.
 *
 * An earlier version of this file also required consecutive shots to *overlap*,
 * on the grounds that two framings with nothing in common are a cut with a slow
 * wipe over it. That invariant was wrong and is gone: the camera interpolates
 * the rect, so it pans continuously through everything between two shots — a
 * travelling shot, which for Cửa hàng → Tủ đồ is the entire point. The distance
 * is reported instead of failed on.
 * - **The closest shot is within the figure's supersample.** `shop-scene.tsx`
 *   draws Koa at `SS` times scene units and scales down; if a shot zooms past
 *   `SS`, the character is being resampled *up* and goes soft exactly when it
 *   is largest.
 *
 * It also prints what the old camera did, because the fix is worth a number.
 * Interrupting a `withTiming` move meant restarting from the *previous target*
 * rather than from where the camera actually was, and that distance is the jump.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(path.join(tmpdir(), 'shopcam-'));
const entry = path.join(dir, 'e.ts');
writeFileSync(
  entry,
  `export * from '@/components/ascnd/shop/shop-camera';\n` +
    `export * as PLAN from '@/components/ascnd/shop/shop-plan';\n`,
);
execFileSync('npx', ['esbuild', entry, '--bundle', '--format=esm', '--tsconfig=tsconfig.json',
  `--outfile=${path.join(dir, 'c.js')}`], { stdio: 'inherit' });
const B = await import(pathToFileURL(path.join(dir, 'c.js')));

/**
 * The band as `shop.tsx` actually sizes it: the page's content width, and
 * `BAND_ASPECT` of it tall.
 *
 * These two used to be `361 - 32` and `× 0.82` — the old bottom sheet's
 * numbers, carried over when the shop became a page. That viewport exists on no
 * phone, and it is why this file reported three valid shots for a camera that
 * was cutting the character's feet off: the close shot is portrait, the band is
 * landscape, `cameraAt` covers, and at 329×270 the mismatch is small enough to
 * hide. A check fed the wrong input is worse than no check — it is a green
 * light on a broken screen.
 *
 * 393 is the iPhone 15/16 point width; `spacing.md` is 16.
 */
const VW = 393 - 16 * 2;
const VH = Math.round(VW * B.BAND_ASPECT);
/** `SS` in shop-scene.tsx */
const SS = 2;

/** what the band can actually show of a shot, once cover has cropped it */
const seen = (s, z) => ({
  x: s.x + (s.w - VW / z) / 2,
  y: s.y + (s.h - VH / z) / 2,
  w: VW / z,
  h: VH / z,
});

const NAMES = Object.keys(B.SHOTS);
const overlap = (a, b) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

let bad = 0;
console.log(`cảnh ${B.SCENE_W}×${B.SCENE_H}, khung nhìn ${VW}×${VH}\n`);
for (const n of NAMES) {
  const s = B.SHOTS[n];
  const z = B.zoomOf(s, VW, VH);
  const inside =
    s.x >= 0 && s.y >= 0 && s.x + s.w <= B.SCENE_W + 0.5 && s.y + s.h <= B.SCENE_H + 0.5;
  const sharp = z <= SS + 0.001;
  // a shot authored at an aspect the band does not have is a shot whose height
  // is decorative: cover honours the larger scale, so only its width survives
  const fits = Math.abs(s.w / s.h - 1 / B.BAND_ASPECT) < 0.01;
  if (!inside || !sharp || !fits) bad++;
  console.log(
    `  ${n.padEnd(9)} (${s.x.toFixed(0)}, ${s.y.toFixed(0)}) ${s.w.toFixed(0)}×${s.h.toFixed(0)}  zoom ${z.toFixed(2)}×  ` +
    `${inside ? 'trong cảnh' : 'RA NGOÀI CẢNH'}  ${sharp ? 'nét' : `MỜ (quá ${SS}×)`}` +
    `  ${fits ? 'vừa khung' : `LỆCH KHUNG (chỉ thấy ${seen(s, z).h.toFixed(0)}/${s.h.toFixed(0)} chiều cao)`}`,
  );
}

/**
 * The close shot has to hold the whole character.
 *
 * Measured against `FIGURE_BOX` — the same rectangle `shop-scene.tsx` places
 * him from — and against what is **visible** rather than what the shot
 * declares. That difference is the entire bug this exists to catch: the old
 * `shop` shot declared 244 units of height, showed 162, and the 41 units it
 * quietly cropped off the bottom took Koa's feet with them.
 */
{
  const s = B.SHOTS.outfit;
  const v = seen(s, B.zoomOf(s, VW, VH));
  const f = B.FIGURE_BOX;
  const pad = {
    trái: f.x - v.x,
    phải: v.x + v.w - (f.x + f.w),
    trên: f.y - v.y,
    dưới: v.y + v.h - (f.y + f.h),
  };
  const cut = Object.entries(pad).filter(([, n]) => n < 0);
  if (cut.length) bad++;
  console.log(
    `\n  khung "trang phục" thấy (${v.x.toFixed(0)}, ${v.y.toFixed(0)}) ${v.w.toFixed(0)}×${v.h.toFixed(0)}\n` +
    `  Koa (${f.x.toFixed(0)}, ${f.y.toFixed(0)}) ${f.w.toFixed(0)}×${f.h.toFixed(0)} — chừa ` +
    Object.entries(pad).map(([k, n]) => `${k} ${n.toFixed(1)}`).join(', ') +
    (cut.length ? `  CẮT MẤT ${cut.map(([k]) => k).join(', ')}` : '  đủ chỗ'),
  );
}

/**
 * "Toàn cảnh" has to be the whole room, exactly.
 *
 * This is the shot the shop opens on and the reason the room is 390 wide
 * rather than 750: a portrait band shows a whole room only if the room has the
 * band's aspect. If the two ever drift apart the overview starts cropping
 * silently — a wall running off the edge looks like a framing choice, not like
 * a bug — so it is asserted rather than trusted.
 */
{
  const P = B.PLAN;
  const s = B.SHOTS.overview;
  const v = seen(s, B.zoomOf(s, VW, VH));
  const off = [Math.abs(v.x), Math.abs(v.y), Math.abs(v.w - P.SHOP_W), Math.abs(v.h - P.SHOP_H)];
  const ok = off.every((n) => n < 1);
  if (!ok) bad++;
  console.log(
    `\n  "toàn cảnh" thấy (${v.x.toFixed(1)}, ${v.y.toFixed(1)}) ${v.w.toFixed(1)}×${v.h.toFixed(1)}` +
    `  — phòng là ${P.SHOP_W}×${P.SHOP_H}` +
    (ok ? '  trọn phòng' : `  LỆCH ${off.map((n) => n.toFixed(1)).join(', ')}`),
  );
}

/**
 * "Tủ đồ" is a shot of the character, and this checks the composition rather
 * than the contents.
 *
 * This has been rewritten twice as the tab's intent moved — first from "zoom
 * into the wardrobe" to "a shot of Koa with the wardrobe half in", then to the
 * two-shot it is now. Both times the old assertions were deleted rather than
 * loosened, because a check kept alive past the design it described is a check
 * that reports on something nobody is building any more.
 *
 * What it asserts now:
 *
 * - **Koa is in frame whole.** He is half the subject.
 * - **The wardrobe is in frame whole.** It is the other half, and the tab is
 *   named after it.
 * - **Koa is left of the frame's centre.** Centred, this is the outfit shot
 *   with more air around it, and there is no reason for two tabs to hold the
 *   same picture.
 */
{
  const P = B.PLAN;
  const s = B.SHOTS.closet;
  const v = seen(s, B.zoomOf(s, VW, VH));
  const f = B.FIGURE_BOX;
  const w = { x: P.CLOSET.x, w: P.CLOSET.w };

  const pad = [f.x - v.x, v.x + v.w - (f.x + f.w), f.y - v.y, v.y + v.h - (f.y + f.h)];
  const whole = pad.every((n) => n >= 0);
  const wPad = [w.x - v.x, v.x + v.w - (w.x + w.w), P.CLOSET.y - v.y, v.y + v.h - (P.CLOSET.y + P.CLOSET.h)];
  const wWhole = wPad.every((n) => n >= 0);
  const offCentre = f.x + f.w / 2 - (v.x + v.w / 2);
  const left = offCentre < -10;
  if (!whole || !wWhole || !left) bad++;

  console.log(
    `\n  khung "tủ đồ" thấy (${v.x.toFixed(0)}, ${v.y.toFixed(0)}) ${v.w.toFixed(0)}×${v.h.toFixed(0)}\n` +
    `  Koa — chừa ${pad.map((n) => n.toFixed(1)).join(', ')}` +
    (whole ? '  trọn người' : '  BỊ CẮT') + '\n' +
    `  tủ — chừa ${wPad.map((n) => n.toFixed(1)).join(', ')}` +
    (wWhole ? '  trọn tủ' : '  BỊ CẮT') + '\n' +
    `  Koa lệch trái ${(-offCentre).toFixed(0)} đv so với tâm khung` +
    (left ? '  lệch tâm' : '  QUÁ GIỮA'),
  );
}

const mid0 = (s) => [s.x + s.w / 2, s.y + s.h / 2];
console.log('\nmỗi cú chuyển cảnh:');
for (let i = 0; i < NAMES.length; i++) {
  for (let j = i + 1; j < NAMES.length; j++) {
    const a = B.SHOTS[NAMES[i]];
    const b = B.SHOTS[NAMES[j]];
    const [ax, ay] = mid0(a);
    const [bx, by] = mid0(b);
    const travel = Math.hypot(bx - ax, by - ay);
    const za = B.zoomOf(a, VW, VH);
    const zb = B.zoomOf(b, VW, VH);
    const ratio = Math.max(za, zb) / Math.min(za, zb);
    const share = overlap(a, b) / Math.min(a.w * a.h, b.w * b.h);
    if (ratio > 2.001) bad++;
    console.log(
      `  ${`${NAMES[i]} ↔ ${NAMES[j]}`.padEnd(22)} lia ${travel.toFixed(0).padStart(3)} đv  ` +
      `đổi zoom ${ratio.toFixed(2)}×  chung ${(share * 100).toFixed(0)}%` +
      (ratio > 2.001 ? '  ĐỔI ZOOM QUÁ GẮT' : ''),
    );
  }
}

/**
 * What the old camera did when you tapped mid-move.
 *
 * At progress `p` it was at `lerp(A, B, p)`; the next tap set the start to `B`,
 * so the frame teleported that far. Reported as how much the shot's centre
 * moved, in scene units.
 */
const lerp = (a, b, p) => ({ x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p, w: a.w + (b.w - a.w) * p, h: a.h + (b.h - a.h) * p });
const mid = (s) => [s.x + s.w / 2, s.y + s.h / 2];
console.log('\ncú nhảy của camera cũ khi bấm giữa chừng (nay bằng 0 — lò xo giữ nguyên vị trí):');
let worst = 0;
for (const a of NAMES) {
  for (const b of NAMES) {
    if (a === b) continue;
    for (const p of [0.25, 0.5, 0.75]) {
      const live = lerp(B.SHOTS[a], B.SHOTS[b], p);
      const [lx, ly] = mid(live);
      const [tx, ty] = mid(B.SHOTS[b]);
      worst = Math.max(worst, Math.hypot(tx - lx, ty - ly));
    }
  }
}
console.log(`  xa nhất ${worst.toFixed(0)} đơn vị cảnh — trên ${B.SCENE_W} đơn vị bề ngang`);

console.log(bad === 0 ? `\n${NAMES.length} khung đều hợp lệ` : `\n${bad} lỗi`);
process.exit(bad === 0 ? 0 : 1);
