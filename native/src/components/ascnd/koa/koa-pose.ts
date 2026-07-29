import type { Flags } from '@/components/ascnd/koa/koa-flags';

/**
 * The resting asymmetry — why Koa does not stand to attention.
 *
 * The export is drawn on a mirror line and it is exact: `leg_left_lower` is
 * `leg_right_lower` reflected in x = 120 to the decimal, the arms likewise, and
 * `koaEarL` and `koaEarR` are −3.5° and +3.5° of the same animation. Everything
 * balances, and a figure in perfect balance reads as a **sticker** — a drawing
 * of a character rather than a character standing there.
 *
 * The fix is the oldest one in the trade: break the mirror, slightly, and never
 * in matched pairs. A few degrees is enough, and it has to be *static* — this is
 * a pose, not a motion. It costs one `<G>` per node it touches and nothing per
 * frame.
 *
 * ── how the numbers were chosen ──
 *
 * **The head and the body lean opposite ways.** That is the whole trick; a head
 * and body leaning together is a character falling over, and only the
 * counter-tilt reads as weight being carried. The body's turns about the hips,
 * which is `BODYRIG`'s own origin, so the feet stay planted and the shadow —
 * outside this rig — still lands where the character stands.
 *
 * **Nothing is mirrored.** Both arms drift the same way by different amounts,
 * and so do both legs, because equal-and-opposite is just a second kind of
 * symmetry. One leg further out than the other is what puts the weight on a
 * hip.
 *
 * **The head's tilt cost more than everything else put together.** Measured one
 * at a time, the arms, the legs and the body cost *nothing* — they are nowhere
 * near the walls. Rolling the head widens the ear block on both sides at once,
 * and at 8.6 units of clearance that left 0.6° of room, which is not a cocked
 * head, it is a rounding error. `koa-frame.ts` is the answer to that; this file
 * only has to keep the crown turning the *opposite* way to the glance's
 * furthest reach, so the two spend from different ends of what is left.
 * `tools/koa-studio/gaze.mjs` measures it every run.
 */

export interface Rest {
  /** degrees, positive is clockwise on a y-down board */
  deg: number;
  /** what it turns about, in the figure's own units */
  at: [number, number];
}

export const REST: Record<string, Rest> = {
  /** the body leans, from the hips */
  BODYRIG: { deg: -1, at: [120, 279] },
  /** and the head back the other way, about the middle of the skull */
  HEADRIG: { deg: 2.5, at: [120, 115] },
  /** both arms drift with the lean, the near one further */
  arm_left_upper: { deg: 2.2, at: [80, 178] },
  arm_right_upper: { deg: 0.8, at: [160, 178] },
  /** and the weight goes onto one leg */
  leg_left_lower: { deg: 1.5, at: [104, 254] },
  leg_right_lower: { deg: 0.5, at: [136, 254] },
};

/** rotate `deg` about `at`, as an SVG matrix */
function turn({ deg, at }: Rest): number[] {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const [cx, cy] = at;
  return [c, s, -s, c, cx - (c * cx - s * cy), cy - (s * cx + c * cy)];
}

/** built once at module load — these never change */
export const REST_MAT: Record<string, string> = Object.fromEntries(
  Object.entries(REST).map(([id, r]) => [id, `matrix(${turn(r).join(' ')})`]),
);

/**
 * Whether this pose gets it.
 *
 * Only the ones where the character is standing. Running, stretching and
 * lifting are already asymmetric — the export tilts and squashes the whole rig
 * for them through `poseTilt` — and a resting lean added on top would be
 * fighting a pose that has already made its own decision about where the weight
 * is.
 */
export function restsAt(flags: Flags): boolean {
  return !flags.poseRun && !flags.poseStretch && !flags.poseLift;
}
