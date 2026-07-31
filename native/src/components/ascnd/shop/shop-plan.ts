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
 * The stage is on the left and the wardrobe on the right, which is the layout
 * asked for and is also the only one that stops them colliding. The podium is
 * 274 across; centred, it left the character standing at x 126–264 with the
 * wardrobe unavoidably behind him. Pushed left to 150 he stands at 81–219 and
 * the wardrobe starts at 236 — they clear each other by seventeen units, and
 * the camera gets two genuinely separate places to point at instead of two
 * crops of the same pile.
 *
 * Everything else stands *against the wall* above y 360, with the podium
 * downstage in front of it, because the podium's floor shadow is 338 across and
 * there is no floor left to put anything on.
 *
 * The drape runs the full width rather than occupying part of it. It is the one
 * prop that says "changing room", and hung as a wall it costs no horizontal
 * budget at all, because every other prop stands in front of it. That is the
 * only reason a wardrobe, a mirror and a stool all fit in a room this narrow.
 */

/** the room — the Mascot Room's footprint, refurnished */
export const SHOP_W = STUDIO_W;
/**
 * Where the podium stands in *this* room, and how far that is from where it
 * stands in the Mascot Room.
 *
 * `STAGE_MARK` is the Mascot Room's own and is not moved — `Platform`,
 * `Spotlight` and `FloorLight` are the same components drawing the same
 * geometry in both rooms, and moving the mark would move the room next door.
 * The shop shifts the whole stage group by `STAGE_DX` instead, which is one
 * translate on one group and leaves every one of those components untouched.
 */
export const STAGE_X = 150;
export const STAGE_DX = STAGE_X - STAGE_MARK.x;
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
 * The wardrobe, against the right-hand wall.
 *
 * Six units off it, which puts its left edge at 236 — seventeen clear of the
 * character at 219. That gap is the whole reason the stage moved left, and it
 * is what lets the "Tủ đồ" shot hold Koa *and* the wardrobe in one frame
 * without either being a crop of the other.
 *
 * It is scaled down a little. At full size it is 168 of the room's 390, and
 * with a 274-wide podium already in the room there was no width left for the
 * mirror to be more than a sliver.
 */
export const CLOSET_SCALE = 0.88;
export const CLOSET = {
  x: SHOP_W - WARDROBE_W * CLOSET_SCALE - 6,
  y: SHOP_FLOOR - WARDROBE_H * CLOSET_SCALE,
  w: WARDROBE_W * CLOSET_SCALE,
  h: WARDROBE_H * CLOSET_SCALE,
};

/**
 * The full-length mirror, at the far left.
 *
 * Behind the stage rather than beside it: the podium's rim starts at y 381 and
 * the mirror ends at 360, so they share x without ever touching. It is the one
 * prop in the room that can be put *behind* something, which in a room this
 * full is worth a lot.
 */
export const MIRROR = { x: 6, w: 58, h: 142, y: SHOP_FLOOR - 142 };

/** the stool, in the gap between the stage and the wardrobe */
export const STOOL_X = 226;

/** re-exported so the camera has one import for the room's landmarks */
export { STAGE_MARK };
