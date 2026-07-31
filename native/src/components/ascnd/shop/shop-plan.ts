import { SCENE_BOTTOM, STAGE_MARK, STUDIO_W } from '@/components/ascnd/studio/palette';
import { WARDROBE_H, WARDROBE_W } from '@/components/ascnd/studio/wardrobe-box';

/**
 * The fitting room, as a floor plan.
 *
 * Numbers only — no React, no `react-native-svg`. `shop-room.tsx` draws from
 * this and `shop-camera.ts` frames from it, so where a thing *is* and where the
 * camera *looks* are the same fact stated once. It also keeps `shop-camera.ts`
 * bundleable on its own, which `tools/shop-camera.mjs` depends on.
 *
 * ── why the room is exactly the Mascot Room's footprint ──
 *
 * The shop opens on a full view of the whole room and the tabs push in from
 * there, and the scene sits in a band the same shape as the Mascot Room's
 * stage: `sw` wide by `sw × 476/390` tall, which is portrait.
 *
 * A portrait band shows a whole room only if the room is the same shape as the
 * band. The height is not free — the wall meets the floor at 360 and the podium
 * stands at 412, both inherited from the Mascot Room and both unmovable without
 * moving that room too — so 476 is fixed, and the width follows: 476 ÷ 1.2205 =
 * **390**. Any wider and "Toàn cảnh" is a lie: the first fitting room was 750
 * across, and a full-height view of it could only ever have shown two fifths of
 * its width.
 *
 * That the number is the Mascot Room's own width is not a coincidence and is
 * worth saying out loud — this is the same room shape, refurnished. Walking
 * into the shop should feel like walking into the room next door.
 *
 * ── what came over from the Mascot Room ──
 *
 * The podium, the lamp above it, and Koa. `STAGE_MARK` is the Mascot Room's
 * own, unmoved, so `Platform`, `Spotlight` and `FloorLight` are the same
 * components drawing the same geometry in both places rather than a copy that
 * has to be kept in step.
 *
 * ── how 390 units are spent ──
 *
 * The podium is 274 across and its floor shadow 338, so it takes nearly the
 * whole width and leaves only the wall above y 360 to furnish. Everything
 * therefore stands *against the wall*, with the podium downstage in front of
 * it — which is what a fitting room looks like anyway.
 *
 * The drape runs the full width rather than occupying part of it. It is the one
 * prop that says "changing room", and hung as a wall it costs no horizontal
 * budget at all, because every other prop stands in front of it. That is the
 * only reason a wardrobe, a mirror and a stool all fit in a room this narrow.
 */

/** the room — the Mascot Room's footprint, refurnished */
export const SHOP_W = STUDIO_W;
export const SHOP_H = SCENE_BOTTOM;
/** where the wall meets the floor — the Mascot Room's own horizon */
export const SHOP_FLOOR = 360;

/**
 * The drape, across the whole wall.
 *
 * The rod hangs at 72, which is behind the lamp — its shade runs 52 to 78, so
 * the two overlap and the lamp reads as hanging in front of the rail. That
 * overlap is the point. At 96 the rail cleared the lamp entirely and left the
 * top fifth of the overview as bare wall with a cord through it.
 *
 * The hem is eight units *past* the floor line, not on it. Stopped dead on the
 * horizon the cloth read as a painted backdrop with the floor starting under
 * it — a hard horizontal edge running the width of the room. Curtains break on
 * the floor; those eight units and the shadow in front of them are the whole
 * difference between hanging cloth and a flat.
 */
export const CURTAIN = { x0: 0, x1: SHOP_W, rod: 72, hem: SHOP_FLOOR + 8 };

/**
 * The wardrobe, and why it stands where it does.
 *
 * `x` is not a preference — it is what centres the wardrobe in its own shot.
 * "Tủ đồ" frames a 200-wide rectangle and no shot can start left of x 0, so the
 * furthest left the camera can centre is x 100. The wardrobe is 148 across at
 * this scale, so it sits at 100 − 74 = 26 and the tab opens with it dead
 * centre. Anywhere further left and the tab frames a wardrobe pinned against
 * one edge with empty room beside it.
 *
 * It is scaled down a little. At full size it is 168 of the room's 390, and
 * with a 274-wide podium already in front of it there was no width left for the
 * mirror to be more than a sliver.
 */
export const CLOSET_SCALE = 0.88;
export const CLOSET = {
  x: 26,
  y: SHOP_FLOOR - WARDROBE_H * CLOSET_SCALE,
  w: WARDROBE_W * CLOSET_SCALE,
  h: WARDROBE_H * CLOSET_SCALE,
};

/** the full-length mirror, against the wall at the other end */
export const MIRROR = { x: 302, w: 58, h: 142, y: SHOP_FLOOR - 142 };

/** the stool you sit on to put shoes on, in the gap between the two */
export const STOOL_X = 278;

/** re-exported so the camera has one import for the room's landmarks */
export { STAGE_MARK };
