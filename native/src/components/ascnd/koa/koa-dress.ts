/**
 * Trying clothes on — the shop's own pose.
 *
 * Head dipped and eyes down over his own body, a slow sway left and right, both
 * arms up beside the head, and the feet lifting alternately as he shifts his weight.
 * It is what somebody does in front of a mirror, and it is the "Tủ đồ" tab's
 * whole reason for pointing at the character instead of at the wardrobe.
 *
 * ── why it is here and not in `koa-flags.ts` ──
 *
 * That file is the design export's `renderVals()`, ported line for line, and it
 * is kept that way on purpose so a re-import stays a diff rather than a merge.
 * A pose invented for this app does not belong in it.
 *
 * It also does not need to be there. Everything below drives *named nodes that
 * already exist* — `HEADRIG`, `BODYRIG`, the two arm paths, the two feet — the
 * same way `koa-pose.ts` applies the resting lean, only from the clock instead
 * of from a constant. No new artwork, no new keyframes in the generated scene,
 * nothing for the next export to collide with.
 *
 * ── the arm shading ──
 *
 * The two arms are paths with their own pivots, which makes raising them a
 * rotation. But the `ARMS` group also holds **two shading slivers down the
 * outside of each arm, at opacity 0.55, with no `id` on either**. Rotate the
 * arms and leave those behind and two grey streaks hang in the air where the
 * arms used to be.
 *
 * There is no id to reach them by, so they are reached by position: inside
 * `ARMS`, children 0 and 4 are the left arm and its shading, 1 and 5 the right.
 * That is a fact about a generated file, so `tools/koa-studio/dress.mjs` asserts it —
 * if a re-import reorders that group the check fails loudly instead of the pose
 * quietly coming apart.
 *
 * ── it animates where the rest of the figure animates ──
 *
 * Through `matrix` on an animated group, like every other moving part of Koa.
 * That is native-only — `react-native-svg`'s web renderer drops the prop — so
 * on web this draws its t=0 frame and holds it, exactly as the breathing, the
 * blink and the ear flick already do. The motion is checked by sampling these
 * worklets in Node rather than by looking at a browser.
 */

/**
 * One full sway, there and back.
 *
 * 3400ms, up from 2400. The brief for this pose ended up being "nhẹ nhàng thôi,
 * giống như nó đang nhìn xem mình đang mặc gì" — gentle, like somebody checking
 * what they have on — and gentle is mostly a matter of time. The same
 * amplitudes over a longer period read as calm; over a short one they read as
 * fidgeting.
 */
export const DRESS_PERIOD = 3400;

/** how far the body leans at the end of a sway, in degrees */
const SWAY_BODY = 1.8;
/**
 * The head leans further than the body and slightly later — a head follows a
 * body.
 *
 * It was cut to 3.2 for a while because `dress.mjs` reported the head's
 * artwork coming within 0.9 units of the frame. That number was the tool's, not
 * the pose's: it read every pair of digits in a path's `d` as a point, and the
 * export uses `A` commands whose parameters are `rx ry rot large-arc sweep x y`
 * — so two radii became a coordinate and a flag became another, and it placed
 * head artwork at x ≈ −6 on a figure whose frame starts at 0. Measured against
 * the points the paths actually visit, the clearance at 4.2° is twelve units.
 *
 * The pose was fine. The instrument was not, and tuning artwork to satisfy a
 * broken instrument would have quietly cost a degree of the movement asked for.
 */
const SWAY_HEAD = 2.6;
const HEAD_LAG = 0.34;
/** how far the head dips to look down at what it is wearing */
const HEAD_BOW = 3.5;
/** and how far the pupils go with it */
const EYES_DOWN = 3.4;

/**
 * How far the arms come up, in degrees, and how much they flutter.
 *
 * **The left arm rotates positive and the right arm negative**, which is the
 * opposite of what it looks like it should be and was wrong in the first
 * render. SVG's y axis points down, so a positive rotation is clockwise on
 * screen; the left arm hangs down-and-left of its shoulder, and swinging it
 * clockwise is what carries the hand up and out. Negative took both hands
 * *across the body* instead — Koa came out hugging his own belly, which reads
 * as shy rather than as pleased, and is a sign error you can only see in a
 * picture.
 *
 * 34, and this number moved twice before it got there. It was 88 — the angle at
 * which the paws are furthest from the body — and then 112, which is worse
 * rather than higher: the export draws `ARMS` **behind** the torso and the
 * head, so past about ninety degrees the arm swings back inward over the skull
 * and vanishes behind it. At 112 the left paw was a bump above one ear and the
 * right arm was gone altogether. Raising them further does not raise them.
 *
 * 34 is where it landed once the pose was asked to be gentle. It lifts the paws
 * clear of the sides so they can be seen without throwing them in the air,
 * which is what somebody turning an arm over to look at a sleeve actually does.
 * Raising it back is one number, and the frame clearance is checked either way.
 * The flutter runs at twice the sway so the arms are never still at the moment
 * the body is, which is what stops the whole thing reading as one rigid object
 * being rocked.
 */
const ARM_RAISE = 34;
const ARM_FLUTTER = 5;

/** how far a foot comes off the podium — barely, a weight shift and no more */
const FOOT_LIFT = 1.6;

/** the pivots, matching `koa-pose.ts` — the export's own `o` values */
const PIVOT = {
  body: [120, 279],
  head: [120, 115],
  armL: [80, 178],
  armR: [160, 178],
} as const;

/**
 * A rotation about a point, plus an optional translate, as an SVG matrix.
 *
 * Written out rather than composed from helpers because every caller is a
 * worklet, and a worklet may only call other worklets — the rule this project
 * learned the hard way when a three-line `clamp()` crashed the UI runtime.
 */
function mat(deg: number, px: number, py: number, tx: number, ty: number): number[] {
  'worklet';
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [c, s, -s, c, px - px * c + py * s + tx, py - px * s - py * c + ty];
}

/** which parts this pose drives */
export type DressPart = 'body' | 'head' | 'armL' | 'armR' | 'footL' | 'footR' | 'eyes';

/**
 * The matrix for one part at time `t`.
 *
 * One entry point rather than six, so `koa-figure.tsx` has a single call at the
 * one place it wraps a node, and so the phase relationships between the parts
 * live together where they can be read as a single piece of movement.
 */
export function dressMat(part: DressPart, t: number): number[] {
  'worklet';
  const a = ((t % DRESS_PERIOD) / DRESS_PERIOD) * Math.PI * 2;
  const sway = Math.sin(a);

  if (part === 'body') return mat(SWAY_BODY * sway, PIVOT.body[0], PIVOT.body[1], 0, 0);
  if (part === 'head') {
    return mat(SWAY_HEAD * Math.sin(a - HEAD_LAG), PIVOT.head[0], PIVOT.head[1], 0, HEAD_BOW);
  }
  if (part === 'eyes') return [1, 0, 0, 1, 0, EYES_DOWN];
  if (part === 'armL') {
    return mat(ARM_RAISE + ARM_FLUTTER * Math.sin(a * 2), PIVOT.armL[0], PIVOT.armL[1], 0, 0);
  }
  if (part === 'armR') {
    return mat(-(ARM_RAISE + ARM_FLUTTER * Math.sin(a * 2)), PIVOT.armR[0], PIVOT.armR[1], 0, 0);
  }
  // The feet alternate: the one on the side he is leaning *away* from comes up,
  // which is what a weight shift looks like. `max(0, ±sway)` gives each foot
  // half the cycle down flat and half of it rising, rather than both bobbing.
  const lift = part === 'footL' ? Math.max(0, sway) : Math.max(0, -sway);
  return [1, 0, 0, 1, 0, -FOOT_LIFT * lift];
}

/**
 * Which part a node is, by `id` — everything except the arms.
 *
 * The arms are not here because they cannot be: their shading has no id. See
 * the header; `koa-figure.tsx` resolves those two by their position inside
 * `ARMS`.
 */
export const DRESS_BY_ID: Record<string, DressPart> = {
  BODYRIG: 'body',
  HEADRIG: 'head',
  leg_left_lower: 'footL',
  leg_right_lower: 'footR',
};

/**
 * Where the arm parts sit inside the `ARMS` group.
 *
 * Index → which arm. 2 and 3 are the export's two zero-width, zero-opacity
 * stroke paths and are left alone; moving something invisible is work for
 * nothing, and listing them would suggest they mattered.
 */
export const DRESS_ARM_AT: Record<number, DressPart> = {
  0: 'armL',
  1: 'armR',
  4: 'armL',
  5: 'armR',
};
