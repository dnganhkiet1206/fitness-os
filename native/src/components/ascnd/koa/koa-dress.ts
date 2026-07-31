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
 * 2200ms, which is `koaHeart`'s own duration — the hearts and the bounce share
 * a beat rather than drifting against each other.
 *
 * It went 2400 → 3400 → 2200. 3400 was for "nhẹ nhàng thôi", and slowing it did
 * make it calm; it also made it placid, which is not the same as pleased. The
 * gentleness now comes from small amplitudes rather than from a long period,
 * which leaves room for the bounce to be quick.
 */
export const DRESS_PERIOD = 2200;

/** how far the body leans at the end of a sway, in degrees */
const SWAY_BODY = 1.6;
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
const SWAY_HEAD = 2.4;
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
const ARM_FLUTTER = 10;

/**
 * The hop, and the legs tucking under it.
 *
 * Twice per cycle — `max(0, sin 2a)` gives two rises with a beat of rest
 * between them, which is a bounce; a plain sine is a float. The feet come up a
 * little further than the body at the top, so the legs read as tucking rather
 * than as the whole figure being lifted by a wire.
 */
const HOP = 5;
const FOOT_TUCK = 2.2;

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
export type DressPart = 'hop' | 'body' | 'head' | 'armL' | 'armR' | 'footL' | 'footR' | 'eyes';

/**
 * The matrix for one part at time `t`.
 *
 * One entry point rather than six, so `koa-figure.tsx` has a single call at the
 * one place it wraps a node, and so the phase relationships between the parts
 * live together where they can be read as a single piece of movement.
 */
export function dressMat(part: DressPart, t: number, k = 1): number[] {
  'worklet';
  const a = ((t % DRESS_PERIOD) / DRESS_PERIOD) * Math.PI * 2;
  const sway = Math.sin(a);
  const bounce = Math.max(0, Math.sin(a * 2));

  if (part === 'hop') return [1, 0, 0, 1, 0, -k * HOP * bounce];
  if (part === 'body') return mat(k * SWAY_BODY * sway, PIVOT.body[0], PIVOT.body[1], 0, 0);
  if (part === 'head') {
    return mat(k * SWAY_HEAD * Math.sin(a - HEAD_LAG), PIVOT.head[0], PIVOT.head[1], 0, k * HEAD_BOW);
  }
  if (part === 'eyes') return [1, 0, 0, 1, 0, k * EYES_DOWN];
  // The paws flick on the bounce rather than on a rhythm of their own — one
  // beat through the whole figure is what stops it reading as several loops
  // that happen to be playing at once.
  if (part === 'armL') {
    return mat(k * (ARM_RAISE + ARM_FLUTTER * bounce), PIVOT.armL[0], PIVOT.armL[1], 0, 0);
  }
  if (part === 'armR') {
    return mat(-k * (ARM_RAISE + ARM_FLUTTER * bounce), PIVOT.armR[0], PIVOT.armR[1], 0, 0);
  }
  return [1, 0, 0, 1, 0, -k * FOOT_TUCK * bounce];
}

/** how long the blend in and out takes */
export const DRESS_BLEND = 400;

/**
 * Which part a node is, by `id` — everything except the arms.
 *
 * The arms are not here because they cannot be: their shading has no id. See
 * the header; `koa-figure.tsx` resolves those two by their position inside
 * `ARMS`.
 */
export const DRESS_BY_ID: Record<string, DressPart> = {
  POSERIG: 'hop',
  BODYRIG: 'body',
  HEADRIG: 'head',
  leg_left_lower: 'footL',
  leg_right_lower: 'footR',
};

/**
 * Which child of `ARMS` is which arm.
 *
 * Only the two arm paths. 2 and 3 are the export's zero-width, zero-opacity
 * strokes — moving something invisible is work for nothing.
 */
export const DRESS_ARM_AT: Record<number, DressPart> = {
  0: 'armL',
  1: 'armR',
};

/**
 * The two arm-shading slivers, which this pose **hides** rather than moves.
 *
 * They are creases drawn down the outside of an arm that is hanging straight
 * down. Rotated up with the arm they came out as a hard line lying across it —
 * shading for a shape that is no longer in that shape. There is no id on either
 * of them and no version of them that is right at 34°, so for as long as the
 * arms are raised they are simply not drawn.
 *
 * This is why the pose is a wrapper and not an edit to the rig: nothing here
 * touches the Mascot Room, where the arms hang and the creases are correct.
 */
export const DRESS_ARM_HIDE = [4, 5];
