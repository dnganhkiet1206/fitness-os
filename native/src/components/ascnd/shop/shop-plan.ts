import { STAGE_MARK } from '@/components/ascnd/studio/palette';
import { WARDROBE_H, WARDROBE_W } from '@/components/ascnd/studio/wardrobe-box';

/**
 * The fitting room, as a floor plan.
 *
 * Numbers only — no React, no `react-native-svg`. `shop-room.tsx` draws from
 * this and `shop-camera.ts` frames from it, so where a thing *is* and where the
 * camera *looks* are the same fact stated once. It also keeps `shop-camera.ts`
 * bundleable on its own, which `tools/shop-camera.mjs` depends on.
 *
 * ── why the room was rebuilt ──
 *
 * The first version was the Mascot Room with a dressing annex bolted to its
 * right edge, and it read as exactly that: two drawings sharing a floor line.
 * Two wall gradients meeting at x 390, the studio's radial vignette ending dead
 * on that seam, the left half furnished as a gym — poster, neon sign, window,
 * equipment shelf, yoga ball — and the right half furnished as a wardrobe. No
 * amount of matching the skirting hides that the two halves are about different
 * things.
 *
 * So this is one room. One wall gradient across the whole width, one floor, one
 * vignette that knows where both lit areas are, and one subject: a place you
 * try clothes on. What came over from the Mascot Room is what the user asked
 * for and nothing else — the podium, the lamp above it, and Koa standing on it.
 * `STAGE_MARK` is still the Mascot Room's own, unmoved, so `Platform`,
 * `Spotlight` and `FloorLight` are the same components drawing the same
 * geometry in both places rather than a copy that has to be kept in step.
 *
 * ── the two bays ──
 *
 * The podium is at x 195 and its floor shadow reaches x 364, which settles the
 * layout: there is no usable room to its left, so the fitting bay goes to its
 * right and the camera's long move is a pan across the room. The curtain hangs
 * behind the podium — the one prop that says "changing room" at a glance and
 * the reason the stage bay does not need a gym's worth of furniture to stop
 * looking bare.
 */

/** the room */
export const SHOP_W = 750;
export const SHOP_H = 476;
/** where the wall meets the floor — the Mascot Room's own horizon */
export const SHOP_FLOOR = 360;

/**
 * The drape behind the podium: rod, hem, and how wide it hangs.
 *
 * The hem is eight units *past* the floor line, not on it. Stopped dead on the
 * horizon the cloth read as a painted backdrop with the floor starting under
 * it — a hard horizontal edge running the width of the stage bay. Curtains
 * break on the floor; those eight units and the shadow in front of them are
 * the whole difference between hanging cloth and a flat.
 */
export const CURTAIN = { x0: 22, x1: 352, rod: 104, hem: SHOP_FLOOR + 8 };

/**
 * The fitting bay — everything you change in front of.
 *
 * `x → x + w` is also what the "Tủ đồ" shot frames, so a prop moved out of the
 * bay moves out of the tab that exists to show it. `tools/shop-camera.mjs`
 * checks that the wardrobe and the mirror are both inside what the camera can
 * actually see of it.
 *
 * Two constraints fix where it starts and how tall it is, and the first render
 * broke both:
 *
 * - **It begins clear of the podium.** The podium's floor shadow reaches x 364,
 *   and the "Sân khấu" shot runs out to 385 — so anything in the bay left of
 *   385 appears in the *stage* tab as an unexplained shape at the frame's edge.
 *   The rug's left rim did exactly that.
 * - **It is tall enough for the things hanging above the wardrobe.** The wall
 *   rail's hooks and the two pucks sit above the carcass, and a bay top of 148
 *   sliced through both: a rail with no bar and two cones of light with no
 *   fixtures, which reads as smudges rather than as lamps.
 */
export const BAY = { x: 380, y: 122, w: 366 };

/** the wardrobe, standing on the floor at the bay's left */
export const CLOSET = {
  x: 404,
  y: SHOP_FLOOR - WARDROBE_H,
  w: WARDROBE_W,
  h: WARDROBE_H,
};

/** the full-length mirror, at the bay's right */
export const MIRROR = { x: 660, w: 66, h: 150, y: SHOP_FLOOR - 150 };

/** the wall rail above the mirror, and the stool between the two */
export const WALL_RAIL = { x: 648, y: 154, w: 88 };
export const STOOL_X = 620;

/** what they all stand on */
export const RUG = { cx: 545, cy: SHOP_FLOOR + 20, rx: 150, ry: 20 };

/** the two pucks that light the wardrobe — the podium's lamp is far away */
export const PUCKS = [CLOSET.x + 44, CLOSET.x + WARDROBE_W - 44];
export const PUCK_Y = 138;

/** re-exported so the camera has one import for the room's landmarks */
export { STAGE_MARK };
