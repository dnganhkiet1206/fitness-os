import { SCENE_BOTTOM, STAGE_MARK, STUDIO_W } from '@/components/ascnd/studio/palette';

/**
 * One room, three shots — the camera the shop's tabs move.
 *
 * The tabs stop being three screens and become three places to stand in one
 * scene: pick "Sân khấu" and the camera pushes in on the podium, "Cửa hàng" and
 * it comes down to Koa standing on it, "Tủ đồ" and it pulls back across the
 * whole dressing room. Nothing unmounts and nothing cross-fades; the room is
 * continuous and you are moving through it, which is the entire idea and the
 * only reason it is worth more than three grids.
 *
 * ── the artboard ──
 *
 * The Mascot Room is 390 wide and 476 tall to the floor, and it is kept exactly
 * as it is: `x 0 → 390` of this scene **is** that room, unchanged, so the stage
 * shots frame the real thing rather than a copy of it. The dressing annex is
 * built to the right of it, from 390 to `SCENE_W`, sharing the same floor line
 * and the same wall.
 *
 * That is what makes this cheap. There is no second stage to keep in step with
 * the first, and `STAGE_MARK` still means what it has always meant.
 *
 * ── the camera is a matrix, not a viewBox ──
 *
 * `viewBox` is a string on the root `<Svg>` and Reanimated cannot drive it;
 * `matrix` on a group is the one transform `RNSVGGroup` takes natively, which
 * every moving thing in this project already rides on. So the whole scene sits
 * inside one group and the shot is that group's matrix. A camera move is then a
 * single animated prop — no unmount, no re-render, nothing crossing to JS.
 */

/** the dressing annex begins where the Mascot Room ends */
export const ROOM_W = STUDIO_W;
export const ANNEX_W = 268;
export const SCENE_W = ROOM_W + ANNEX_W;
export const SCENE_H = SCENE_BOTTOM;

export interface Shot {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Where each tab stands.
 *
 * Every one is derived from `STAGE_MARK` or from the annex's own width rather
 * than typed, so moving the podium moves the camera with it. A shot written as
 * four literals is a shot that silently stops framing what it was named after —
 * which is the same failure `stage.mjs` was built to catch.
 *
 * The heights are what the aspect is taken from; `cameraAt` covers, so a shot
 * wider than the viewport is cropped at the sides rather than letterboxed.
 */
export const SHOTS = {
  /** the podium and the light coming down onto it */
  stage: {
    x: STAGE_MARK.x - 190,
    y: STAGE_MARK.y - 250,
    w: 380,
    h: 300,
  },
  /** Koa, standing on it — close enough to read an outfit */
  shop: {
    x: STAGE_MARK.x - 104,
    y: STAGE_MARK.y - 214,
    w: 208,
    h: 244,
  },
  /** the whole dressing room, wardrobe and all */
  wardrobe: {
    x: ROOM_W - 16,
    y: 138,
    w: ANNEX_W + 16,
    h: 268,
  },
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
