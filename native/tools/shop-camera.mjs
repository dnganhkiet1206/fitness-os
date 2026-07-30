/**
 * The shop's three shots, checked rather than eyeballed.
 *
 *   node tools/shop-camera.mjs
 *
 * Three invariants, each tied to a decision that would fail silently:
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
writeFileSync(entry, `export * from '@/components/ascnd/shop/shop-camera';`);
execFileSync('npx', ['esbuild', entry, '--bundle', '--format=esm', '--tsconfig=tsconfig.json',
  `--outfile=${path.join(dir, 'c.js')}`], { stdio: 'inherit' });
const B = await import(pathToFileURL(path.join(dir, 'c.js')));

/** the band as `mascot-room.tsx` sizes it: sheet width, 0.82 of it tall */
const VW = 361 - 32;
const VH = Math.round(VW * 0.82);
/** `SS` in shop-scene.tsx */
const SS = 2;

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
  if (!inside || !sharp) bad++;
  console.log(
    `  ${n.padEnd(9)} (${s.x}, ${s.y}) ${s.w}×${s.h}  zoom ${z.toFixed(2)}×  ` +
    `${inside ? 'trong cảnh' : 'RA NGOÀI CẢNH'}  ${sharp ? 'nét' : `MỜ (quá ${SS}×)`}`,
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

console.log(bad === 0 ? '\nba khung đều hợp lệ' : `\n${bad} lỗi`);
process.exit(bad === 0 ? 0 : 1);
