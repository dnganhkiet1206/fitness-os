import { perchAt } from '@/components/ascnd/studio/bugs';
import { STAGE_MARK } from '@/components/ascnd/studio/palette';

/**
 * Koa noticing the insects.
 *
 * When the bee settles on the shelf's plant or a butterfly on the neon sign,
 * the head turns a little that way, the eyes go further, and the open grin
 * closes into a small pleased smile. When they leave, it comes back.
 *
 * The whole thing is one number in, three out, and it hangs off the **same
 * clock the insects use** — `StageRenderer` owns it and hands it to both. On
 * separate clocks the mascot would be looking at where a butterfly used to be
 * within about a minute.
 *
 * ── the geometry ──
 *
 * The insects live in the room's 390-wide artboard and the figure in its own
 * 240 × 300 box, so the two have to be brought together somewhere. It is done
 * here, once, from the same constants the stage places the buddy with: the
 * figure's box is `HERO_W` wide with its feet on `STAGE_MARK`, and the head
 * sits at (120, 112) inside it. Restating either of those in a second place is
 * how a preview ends up drawing a character that stands in front of its own
 * podium, which has happened here before.
 */

/** the figure's rendered width in artboard units — `stage-renderer.tsx`'s */
const HERO_W = 128;
const FIG_W = 240;
const FIG_H = 300;
/** the head's centre inside the figure's own viewBox */
const HEAD = [120, 112];

/** the head's centre, in artboard units */
const HEAD_X = STAGE_MARK.x - HERO_W / 2 + (HEAD[0] / FIG_W) * HERO_W;
const HEAD_Y = STAGE_MARK.y - HERO_W * 1.25 + 6 + (HEAD[1] / FIG_H) * (HERO_W * 1.25);

/**
 * How far away a thing has to be to pull the eyes all the way over.
 *
 * Generous on purpose: the shelf's plant is about 150 units off and the neon
 * sign 120, so both should read as "all the way", and only something almost
 * underfoot should read as less.
 */
const REACH = 150;

export interface Gaze {
  /** −1..1, where it is looking */
  x: number;
  y: number;
  /** 0..1, how much it is looking at all */
  k: number;
}

/**
 * Where Koa is looking at clock position `t`, 0..1.
 *
 * `k` comes straight from the insect's own settle, so the glance eases in as
 * it lands and out as it takes off, and is zero the two thirds of the time
 * nothing is perched. No state, no timers: the same `t` always gives the same
 * look, which is what lets this run on the UI thread beside everything else.
 *
 * The clamping is written out rather than being a `clamp()` helper, and that is
 * not a style choice. **A worklet may only call other worklets.** A plain
 * module-level arrow function called from here is a *remote function*, and the
 * UI runtime throws the moment it reaches one — which is what happened the
 * first time this shipped. `Math.min`/`Math.max` would have been fine; a
 * three-line helper of our own was not, unless it carries its own `'worklet'`.
 */
export function gazeAt(t: number): Gaze {
  'worklet';
  const p = perchAt(t);
  if (p.k <= 0) return { x: 0, y: 0, k: 0 };
  const x = (p.x - HEAD_X) / REACH;
  const y = (p.y - HEAD_Y) / REACH;
  return {
    x: x < -1 ? -1 : x > 1 ? 1 : x,
    y: y < -1 ? -1 : y > 1 ? 1 : y,
    k: p.k,
  };
}

/* ── what the look moves ──────────────────────────────────────────────── */

/**
 * How far each part goes, in the figure's own units and degrees.
 *
 * The eyes go furthest and the head least, which is the order that reads as
 * *noticing* rather than as turning to face something: an animal glances with
 * its eyes first and brings its head after. The head also tilts — a small roll
 * into the direction of the look — and that roll is most of what makes it read
 * as interest rather than as tracking.
 *
 * `HEAD_TURN` is a sideways shift, not a yaw. The figure is flat and has no far
 * side to bring round; shifting the whole head a couple of units toward what it
 * is looking at is the closest a drawing like this gets. It is small because
 * there is nowhere to put it — see `HEAD_PIVOT` — and because it is the one
 * part of the glance that does not have to be seen to be felt.
 */
export const HEAD_TILT = 3.6;
export const HEAD_TURN = 0.9;
export const HEAD_LIFT = 3;
export const PUPIL_SHIFT = 4.4;

/**
 * Where the head pivots: the middle of the skull, not the neck.
 *
 * The neck is the anatomically honest answer and it was the first one here.
 * It is also unusable, because **the export draws the ears to the very edge of
 * the viewBox** — 8.6 units of clearance either side — and `KoaFigure`'s
 * viewport clips. A roll about a point 110 units below the ears sweeps them
 * sideways by ten; a roll about a point level with them barely moves them at
 * all, because the sideways cost of a rotation is `−Δy · sin θ` and Δy is what
 * changes. Same angle, same read, a quarter of the travel.
 *
 * The user saw the first version as the mascot "losing its frame" when it
 * tilted. `tools/koa-studio/gaze.mjs` now measures the figure's bounding box
 * against the viewBox on every run, and this number is why.
 */
export const HEAD_PIVOT: [number, number] = [120, 105];

const IDENTITY = [1, 0, 0, 1, 0, 0];

/** rotate `deg` about (cx, cy) and then translate, straight to an SVG matrix */
function place(deg: number, cx: number, cy: number, tx: number, ty: number): number[] {
  'worklet';
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [c, s, -s, c, cx - (c * cx - s * cy) + tx, cy - (s * cx + c * cy) + ty];
}

/**
 * The head's own matrix at clock `t` — a roll into the look, plus a small shift
 * after it.
 *
 * Signs: looking left is `x < 0`, and a negative rotation on a y-down board
 * takes the top of the head left, so the crown leans **toward** what it has
 * noticed. Leaning away would read as recoiling from it.
 *
 * This composes on top of whatever `koaBob` is doing rather than replacing it,
 * which is why it goes on a group of its own around `#HEADRIG` instead of into
 * the rig's own matrix.
 */
export function headMatOf(g: Gaze): number[] {
  'worklet';
  if (g.k <= 0) return IDENTITY;
  return place(
    HEAD_TILT * g.x * g.k,
    HEAD_PIVOT[0],
    HEAD_PIVOT[1],
    HEAD_TURN * g.x * g.k,
    HEAD_LIFT * g.y * g.k,
  );
}

/** the pupils' matrix — a plain shift, further than the head goes */
export function eyeMatOf(g: Gaze): number[] {
  'worklet';
  if (g.k <= 0) return IDENTITY;
  // less vertically than horizontally: an eye that slides its full travel up
  // shows white under the iris, which reads as alarm rather than as interest
  return [1, 0, 0, 1, PUPIL_SHIFT * g.x * g.k, PUPIL_SHIFT * 0.7 * g.y * g.k];
}

/**
 * The same three, from a clock position instead of a look.
 *
 * `koa-figure.tsx` does not use these: it resolves `gazeAt` **once** per frame
 * into a derived value and hands that to all four of the things the glance
 * moves, because four wrappers each calling `gazeAt` is four walks of every
 * insect's route for one answer. These exist for the tools, which step a clock
 * rather than hold a shared value.
 */
export function headMat(t: number): number[] {
  'worklet';
  return headMatOf(gazeAt(t));
}

export function eyeMat(t: number): number[] {
  'worklet';
  return eyeMatOf(gazeAt(t));
}

/** how far into the look it is, 0..1 — what the mouths cross-fade on */
export function lookK(t: number): number {
  'worklet';
  return gazeAt(t).k;
}

/**
 * The closed smile that replaces the open one.
 *
 * Both of the calm mouths in the export are open, with a tongue in them. A
 * creature that has just noticed something does not grin at it — it closes its
 * mouth and the corners go up. So the whole open-mouth group fades out as the
 * look comes on and this fades in: one stroked arc, no fill, in the mouth's own
 * colour, sitting where the mouth's top edge was.
 *
 * `mouthSmile` spans 106 → 134 and `mouthGrin` 104 → 136, and this splits the
 * difference, so the swap does not move the face under either one.
 */
export const SMILE = 'M106.5 129 Q120 141.5 133.5 129';
export const SMILE_WIDTH = 4.6;
export const SMILE_COLOUR = '#20242A';

/**
 * The mouths this may replace, by the export's own flag.
 *
 * Only the two calm ones. `mouthBreath` is a koala mid-workout and `mouthGrit`
 * one straining under a bar — neither is a state in which something glances at
 * a butterfly, and swapping either for a pleased little smile would read as the
 * character losing the plot. Under those expressions the glance is the head and
 * the eyes and nothing else.
 */
export const SWAP_MOUTHS = ['mouthSmile', 'mouthGrin'];
