import { HERO_W, KOA_ASPECT } from '@/components/ascnd/koa/koa-frame';
import { BAY, SHOP_H, SHOP_W, STAGE_MARK } from '@/components/ascnd/shop/shop-plan';

/**
 * One room, three shots — the camera the shop's tabs move.
 *
 * The tabs stop being three screens and become three places to stand in one
 * fitting room: pick "Sân khấu" and the camera pushes in on the podium and the
 * curtain behind it, "Cửa hàng" and it comes down to Koa standing on it, "Tủ
 * đồ" and it pans down the wall to the wardrobe. Nothing unmounts and nothing
 * cross-fades; the room is continuous and you are moving through it, which is
 * the entire idea and the only reason it is worth more than three grids.
 *
 * ── the artboard ──
 *
 * `shop-plan.ts` is the floor plan and this file only frames it. Every shot is
 * derived from a landmark in there — the podium's mark, the fitting bay's own
 * rectangle — so moving a prop moves the camera that was pointed at it. A shot
 * written as four literals is a shot that silently stops framing what it was
 * named after.
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
 * The band's height as a fraction of its width. `shop.tsx` lays the band out
 * from this and every shot takes its own height from it, which is the point:
 * they cannot disagree.
 *
 * They did disagree, and it cost Koa his feet. The shots used to carry
 * hand-written heights — the close one was 208×244, portrait, on a band that is
 * 361×282, landscape. `cameraAt` **covers**, so the larger of the two scales
 * wins and only a shot's *width* is ever honoured: 244 declared units of height
 * came out as 162 visible ones, the missing 82 were cropped evenly off the top
 * and bottom, and the bottom crop landed 17 units above the soles of a
 * character the shot exists to show. Nothing in the code was wrong; the framing
 * simply described a rectangle that could not be displayed.
 *
 * So heights stopped being written down. `shot()` derives every one, and
 * `tools/shop-camera.mjs` asserts against this same constant at the real band
 * size — the check used to run 329×270, a viewport no phone has, and passed a
 * framing that was visibly broken.
 */
export const BAND_ASPECT = 0.78;

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
 * Every one is derived from `STAGE_MARK` or from `BAY` in the floor plan rather
 * than typed, so moving the podium or the wardrobe moves the camera that was
 * pointed at it. A shot written as four literals is a shot that silently stops
 * framing what it was named after — the same failure `stage.mjs` was built to
 * catch.
 */
export const SHOTS = {
  /**
   * The podium, the curtain behind it, and the beam standing on it.
   *
   * Not the lamp itself — its shade sits at y 52 and the podium's base reaches
   * 455, so a frame holding both would be 405 units tall and, at this band's
   * aspect, 519 wide inside a bay that is 390. It would have to start 64 units
   * left of the room's own wall and show 64 units of nothing. The beam's cone
   * is in frame from the top edge down, which is what actually lights the
   * podium; the fixture it hangs from is not.
   */
  stage: shot({
    x: STAGE_MARK.x - 190,
    y: STAGE_MARK.y - 250,
    w: 380,
  }),
  /**
   * Koa, standing on it — close enough to read an outfit.
   *
   * Wide enough to hold `FIGURE_BOX` whole with room over his head and the
   * podium under his feet. He is 172.5 units tall, so at this band's aspect no
   * frame narrower than 221 can contain him at all, whatever its stated height.
   */
  shop: shot({
    x: STAGE_MARK.x - 133,
    y: STAGE_MARK.y - 180.5,
    w: 266,
  }),
  /** the fitting bay: wardrobe, mirror, stool and rug, exactly as planned */
  wardrobe: shot({
    x: BAY.x,
    y: BAY.y,
    w: BAY.w,
  }),
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
