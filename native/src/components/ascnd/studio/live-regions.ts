import { MOTE_REACH, MOTES } from '@/components/ascnd/studio/motes';
import { SCENE_BOTTOM, STUDIO_W } from '@/components/ascnd/studio/palette';
import { plantBounds } from '@/components/ascnd/studio/plant';
import { PLANTS } from '@/components/ascnd/studio/plants';
import { STAGE_GLOW } from '@/components/ascnd/studio/platform';
import { CX, MOUTH_R, MOUTH_Y } from '@/components/ascnd/studio/spotlight';
import { GLASS } from '@/components/ascnd/studio/window';

/**
 * Where each moving thing lives, so it can be given a canvas that size.
 *
 * ── why this file exists ──
 *
 * `react-native-svg` rasterises a whole `<Svg>` again whenever any child prop
 * changes, and **the cost of that is the canvas's area times what is in it**.
 * The room had two full-screen canvases redrawing sixty times a second — one
 * for the plants and one for everything else — and by the time the weather and
 * the insects had been added, the second one held about a hundred and ninety
 * shapes. Every one of them was being redrawn across the whole screen so that
 * six stars could blink inside a window occupying five percent of it.
 *
 * The fix is not to animate less. It is to stop redrawing the parts that are
 * not moving: give each idea a canvas the size of the thing it draws. The sky
 * carries most of the shapes and covers 4.7% of the room; the stage glow is one
 * ellipse over 6.9%. Split apart, the same picture costs a fraction to draw and
 * nothing about it changes on screen.
 *
 * ── why they are derived, not typed ──
 *
 * Every region below is computed from the geometry it has to contain, with a
 * margin. A hand-written box is a number that silently stops being true the
 * first time a mote moves — and a region that no longer contains its content
 * does not warn you, it **clips it**, which is the same class of bug as the
 * mascot losing its ears to its own viewBox. `tools/koa-studio/budget.mjs`
 * checks containment and prints what each canvas costs.
 */

export interface Region {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** the visible room; anything outside it is app content, not scene */
const ROOM: Region = { id: 'room', x: 0, y: 0, w: STUDIO_W, h: SCENE_BOTTOM };

function box(id: string, xs: number[], ys: number[], pad: number): Region {
  const x = Math.max(0, Math.floor(Math.min(...xs) - pad));
  const y = Math.max(0, Math.floor(Math.min(...ys) - pad));
  return {
    id,
    x,
    y,
    w: Math.min(STUDIO_W - x, Math.ceil(Math.max(...xs) + pad) - x),
    h: Math.min(SCENE_BOTTOM - y, Math.ceil(Math.max(...ys) + pad) - y),
  };
}

/**
 * The window's sky: stars, the shooting star, the clouds and the rain.
 *
 * All of it is clipped to the glass already — `LiveSky` draws a `clipPath` for
 * exactly that reason — so the glass *is* the region, and the margin is only
 * for the rounded corner's antialiasing.
 */
export const SKY = box('sky', [GLASS.x, GLASS.x + GLASS.w], [GLASS.y, GLASS.y + GLASS.h], 2);

/**
 * The lamp's mouth and the motes in its beam.
 *
 * One canvas rather than two because they overlap: the motes start eighteen
 * units under the mouth. The margin is `MOTE_REACH`, the furthest any band
 * travels, taken from the sway table itself — a region that forgets the
 * animation is a region that clips the top of the drift once a cycle.
 */
export const BEAM = box(
  'beam',
  [
    CX - MOUTH_R - 6,
    CX + MOUTH_R + 6,
    ...MOTES.map((m) => m[0] - m[2]),
    ...MOTES.map((m) => m[0] + m[2]),
  ],
  [MOUTH_Y - 8, MOUTH_Y + 9, ...MOTES.map((m) => m[1] - m[2]), ...MOTES.map((m) => m[1] + m[2])],
  MOTE_REACH + 1,
);

/** the pool the stage gives back — one ellipse, and it does not move */
export const STAGE = box(
  'stage',
  [STAGE_GLOW.cx - STAGE_GLOW.rx, STAGE_GLOW.cx + STAGE_GLOW.rx],
  [STAGE_GLOW.cy - STAGE_GLOW.ry, STAGE_GLOW.cy + STAGE_GLOW.ry],
  3,
);

/**
 * The insects, which genuinely do cross the whole room.
 *
 * There is no smaller box to give them — that is what a route from one wall to
 * the other means — so this one is the room, and the saving has to come from
 * somewhere else: they are **unmounted while they are away**, which is about
 * two thirds of the cycle for the set and nearly nine tenths for any one of
 * them. A canvas holding nothing costs nothing to redraw, because it is not
 * redrawn.
 */
export const BUGS = ROOM;

/**
 * The plants, one canvas each.
 *
 * They are at opposite corners — (41, 250) and (316, 397) — so a single canvas
 * for the pair is the whole room over again, which is what it was.
 *
 * The reach comes from `plantBounds`, computed from the leaf table itself, and
 * the margin covers the sway: the widest is 2.6° about the pot's rim, and a
 * tip 48 units up from that pivot travels `48 · sin(2.6°)` ≈ 2.2 before scale.
 * Rounded up to four, then scaled with the plant.
 */
const SWAY_REACH = 4;
export const PLANT_REGIONS: Region[] = PLANTS.map((p, i) => {
  const b = plantBounds(p.kind);
  return box(
    `plant${i}`,
    [p.x - (b.x + SWAY_REACH) * p.s, p.x + (b.x + SWAY_REACH) * p.s],
    [p.y + (b.top - SWAY_REACH) * p.s, p.y + b.bottom * p.s],
    2,
  );
});

export const LIVE_REGIONS: Region[] = [SKY, BEAM, BUGS, STAGE, ...PLANT_REGIONS];

/** how much of the room a region covers, 0..1 — what a redraw of it costs */
export function areaOf(r: Region): number {
  return (r.w * r.h) / (ROOM.w * ROOM.h);
}
