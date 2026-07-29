/**
 * The figure's box, and the one number that stops it being a cage.
 *
 * ── the problem ──
 *
 * The design export is drawn to the very edge of its own 240 × 300 artboard:
 * the ears sit 8.6 units from the left and right walls, `koaBob` eats 2.2 of
 * that on its own, and **an SVG viewport clips**. Every subsequent idea that
 * moves the head has had to be paid for out of the six units left over.
 *
 * The glance was cut from 5° to 3.6° for it, and its pivot moved from the neck
 * to the middle of the skull. Then the resting lean arrived and the head had
 * 0.6° of room — not enough to read as a cocked head at all. A constraint that
 * has now bent two features out of shape is not a constraint, it is a bug.
 *
 * ── the fix ──
 *
 * Draw the figure at `KOA_INSET` of its box, anchored at its feet, and make the
 * stage ask for a proportionally larger box. The character comes out **exactly
 * the same size on screen** — 128 artboard units, as before — and gains eight
 * units of margin on each side to move in. Nothing about the artwork changes;
 * only the amount of air around it.
 *
 * The anchor is the bottom centre, so the feet stay where they stand and the
 * air is added above and to the sides — which is where the head is.
 *
 * ── why these live in one file ──
 *
 * `HERO_W` was copied into four places: the stage that lays the buddy out, the
 * gaze that has to know where the head ended up, and two tools. One of them
 * even documented itself as importing it. With an inset in the mix a fifth
 * number would have to agree with all of them, and the failure mode is a
 * character that stands in front of its own podium — which has happened here.
 * So they are all here, and everything reads them from here.
 */

export const KOA_VIEWBOX = '0 0 240 300';
export const KOA_W = 240;
export const KOA_H = 300;
export const KOA_ASPECT = KOA_H / KOA_W;

/**
 * How much of its box the figure is drawn at.
 *
 * 0.93 takes the ears from 8.6 units off the wall to 16.4, which covers the
 * glance's 5.6 at full stretch, `koaBob`'s 2.2, and a couple of degrees of
 * resting lean, with room left. Going further starts to waste resolution on
 * empty artboard for no one's benefit.
 */
export const KOA_INSET = 0.93;

/** anchored at the feet: the bottom centre of the artboard */
const AX = KOA_W / 2;
const AY = KOA_H;

export const KOA_INSET_MAT = `matrix(${KOA_INSET} 0 0 ${KOA_INSET} ${AX * (1 - KOA_INSET)} ${AY * (1 - KOA_INSET)})`;

/** where a point of the artwork ends up once the inset is applied */
export const inset = (x: number, y: number): [number, number] => [
  AX + KOA_INSET * (x - AX),
  AY + KOA_INSET * (y - AY),
];

/**
 * Koa's box on the stage, in the room's artboard units.
 *
 * The *drawn* character is `HERO_W · KOA_INSET` ≈ 128 wide — a third of the
 * room, which is the number the stage was composed around. The box is larger
 * than the character by exactly the inset, and that is the whole point.
 *
 * The podium's top face is 274 wide and the gap up to the lamp is 346, so a
 * character much past this stops being something standing in a room and starts
 * being the room.
 */
export const HERO_W = Math.round(128 / KOA_INSET);
