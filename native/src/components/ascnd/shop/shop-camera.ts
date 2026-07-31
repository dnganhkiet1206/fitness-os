import { HERO_W, KOA_ASPECT } from '@/components/ascnd/koa/koa-frame';
import { SHOP_H, SHOP_W, STAGE_MARK } from '@/components/ascnd/shop/shop-plan';

/**
 * One room, four shots — the camera the shop's tabs move.
 *
 * The tabs stop being screens and become four places to stand in one fitting
 * room. "Toàn cảnh" is the doorway — the whole room, and where the shop opens.
 * "Sân khấu" pushes in on the podium, "Trang phục" comes down to Koa standing
 * on it, "Tủ đồ" pans across to the wardrobe. Nothing unmounts and nothing
 * cross-fades; the room is continuous and you are moving through it, which is
 * the entire idea and the only reason it is worth more than four grids.
 *
 * ── the artboard ──
 *
 * `shop-plan.ts` is the floor plan and this file only frames it. The room is
 * 390 × 476 — the Mascot Room's own footprint — for a reason that belongs to
 * the overview and is written down there.
 *
 * ── the camera is a transform, not a viewBox ──
 *
 * `viewBox` is a string on the root `<Svg>` and Reanimated cannot drive it. The
 * scene is drawn once at its own size inside a `<View>`, and the shot is that
 * view's transform: one animated style, no unmount, and — unlike a `matrix` on
 * a `<G>` — it both works on web and leaves the SVG canvas rasterised exactly
 * once. See the header of `shop-scene.tsx`.
 */

export const SCENE_W = SHOP_W;
export const SCENE_H = SHOP_H;

export interface Shot {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The band's height as a fraction of its width — and it is the room's own
 * shape, taken from the room rather than typed.
 *
 * `shop.tsx` lays the band out from this and every shot takes its height from
 * it, which is the point: they cannot disagree. It is also what makes "Toàn
 * cảnh" possible at all — a shot of the whole room is `SHOP_W × SHOP_H`, and
 * that fills a band only when the band has the same aspect. Written as a
 * literal, the two would drift the first time the room's proportions changed
 * and the overview would quietly start cropping.
 *
 * They did disagree once, and it cost Koa his feet. The shots used to carry
 * hand-written heights — the close one was 208×244, portrait, on a band that
 * was 361×282, landscape. `cameraAt` **covers**, so the larger of the two
 * scales wins and only a shot's *width* is ever honoured: 244 declared units of
 * height came out as 162 visible ones, the missing 82 were cropped evenly off
 * the top and bottom, and the bottom crop landed 17 units above the soles of a
 * character the shot exists to show. Nothing in the code was wrong; the framing
 * simply described a rectangle that could not be displayed.
 *
 * So heights stopped being written down. `shot()` derives every one, and
 * `tools/shop-camera.mjs` asserts against this same constant at the real band
 * size — the check used to run 329×270, a viewport no phone has, and passed a
 * framing that was visibly broken.
 */
export const BAND_ASPECT = SHOP_H / SHOP_W;

/** a shot, from the three numbers that are actually a choice */
const shot = (f: { x: number; y: number; w: number }): Shot => ({ ...f, h: f.w * BAND_ASPECT });

/**
 * Where Koa stands, in scene units.
 *
 * `shop-scene.tsx` places the figure from this and the camera frames it from
 * this, so "the shot contains the character" is checkable instead of hoped for.
 */
export const FIGURE_BOX: Shot = {
  x: STAGE_MARK.x - HERO_W / 2,
  y: STAGE_MARK.y + 6 - HERO_W * KOA_ASPECT,
  w: HERO_W,
  h: HERO_W * KOA_ASPECT,
};

/**
 * Where each tab stands.
 *
 * Derived from the floor plan rather than typed wherever the plan has the
 * number — the room's own size, the podium's mark — so moving the podium moves
 * the camera that was pointed at it. A shot written as four literals is a shot
 * that silently stops framing what it was named after, the same failure
 * `stage.mjs` was built to catch. Where a shot's own framing *is* the decision
 * (how much air over the podium, how far down the wardrobe's shot may reach)
 * the number is written here and `tools/shop-camera.mjs` checks it holds what
 * it is named after.
 */
export const SHOTS = {
  /**
   * The whole room, which is where the shop opens.
   *
   * Exactly `SHOP_W × SHOP_H`, and it fills the band exactly because the band
   * is `BAND_ASPECT` and `BAND_ASPECT` *is* the room's aspect. Nothing is
   * cropped and no wall runs off the edge — this is the one shot where the
   * scene's own boundary is the frame, and the only shot that has to be
   * written as the room rather than as a rectangle inside it.
   */
  overview: shot({ x: 0, y: 0, w: SHOP_W }),
  /**
   * The podium, the drape behind it, and the beam standing on it.
   *
   * Wide enough to clear the podium's 274 units with room at both sides, and
   * low enough to hold its base at 467. Not the lamp: its shade sits at y 52,
   * and a frame reaching both it and the podium's foot is 415 tall — which at
   * this aspect is 340 wide and would have to start 25 units outside the room.
   * The beam's cone is in frame from the top edge down, which is what actually
   * lights the podium; the fixture it hangs from is what "Toàn cảnh" is for.
   */
  stage: shot({ x: STAGE_MARK.x - 145, y: 114, w: 290 }),
  /**
   * Koa, standing on it — close enough to read an outfit.
   *
   * `FIGURE_BOX` with margin on all four sides. It is deliberately not tighter:
   * the character is drawn at `SS` times scene units and this shot's zoom has
   * to stay under `SS` or he is resampled *up* and goes soft exactly when he is
   * largest. At 210 wide that is 1.72× against a supersample of 2.
   */
  outfit: shot({ x: STAGE_MARK.x - 105, y: 218, w: 210 }),
  /**
   * The wardrobe.
   *
   * Its bottom edge stops above y 379 — not 381. The rim's *ellipse* tops out
   * at 381, but it is stroked, and the glow pass under it is four units wide,
   * so the topmost inked pixel of the podium is two units higher than its
   * geometry. A frame ending at 380 cleared the rim by a unit and still opened
   * with a gold smear along the bottom of the picture. Bounding boxes are not
   * where the ink stops.
   */
  closet: shot({ x: 0, y: 128, w: 200 }),
} satisfies Record<string, Shot>;

export type ShotName = keyof typeof SHOTS;

/**
 * The matrix that puts `shot` on a `vw × vh` viewport.
 *
 * Cover, not contain: the scene has no edges to show — the wall runs past every
 * shot — so scaling to fit would put bars on a picture that has more picture
 * behind them. The remainder is split evenly, which keeps the subject centred
 * whatever the phone's aspect.
 *
 * Marked `worklet` because the tab switch animates it on the UI thread.
 */
export function cameraAt(shot: Shot, vw: number, vh: number): number[] {
  'worklet';
  const s = Math.max(vw / shot.w, vh / shot.h);
  return [s, 0, 0, s, (vw - shot.w * s) / 2 - shot.x * s, (vh - shot.h * s) / 2 - shot.y * s];
}

/**
 * How far a shot's zoom is, on a `vw × vh` viewport.
 *
 * `shop-scene.tsx` draws the character at a fixed supersample and scales it
 * down; this is the number that says the supersample is enough.
 */
export function zoomOf(shot: Shot, vw: number, vh: number): number {
  return Math.max(vw / shot.w, vh / shot.h);
}
