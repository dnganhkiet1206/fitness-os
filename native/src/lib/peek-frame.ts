/**
 * Where Koa is, at a given point of the peek.
 *
 * ── why the arithmetic is not in the component ──
 *
 * Because it was wrong, and nothing could see that it was wrong. The band, the
 * figure's box and the parking distance have to agree with each other, and
 * three numbers in a `StyleSheet` next to a transform in a worklet agree only
 * in somebody's head. Here they are one function with one set of constants, and
 * `tools/koa-studio/peek.mjs` renders the real frames from *this* file — so a
 * change to the numbers changes the picture, and a picture that is wrong is
 * something you can look at.
 *
 * That is the same reason `STAGE_MARK` and `HERO_W` live in `koa-frame.ts`
 * instead of in the stage: a tool that copies the numbers it is checking is a
 * tool that agrees with itself.
 *
 * ── the geometry ──
 *
 * The band is `PEEK` tall and its bottom edge is the card's top edge. The
 * figure hangs from the band's **top**, and it is taller than the band — so the
 * band is a window onto the top `PEEK` points of the figure's box, which is the
 * head. Sliding it down by exactly `PEEK` puts every part of it below the
 * window: nothing shows, whatever the figure's height is.
 *
 * Hanging it from the top is the whole trick, and the first build had it from
 * the bottom. That looks reasonable — a character standing on the card's edge —
 * and it is wrong twice over: at rest the figure's box overflowed the short
 * band upwards, so Koa's head was parked *permanently visible* above every
 * widget; and the rise slid the window down the body, so the celebration was
 * the character's stomach coming into view. The fix is not a better offset, it
 * is anchoring at the end that has the head on it.
 */

/**
 * How much of Koa shows over the card's edge, in points.
 *
 * It is a window onto the figure's box, so it is also the answer to "how far
 * down the character do we see": `PEEK / (PEEK_FIGURE · KOA_ASPECT)`, which at
 * these two numbers is 61% — the head, the chin, and the first hint of
 * shoulder.
 *
 * That number was chosen by looking at it (`tools/koa-studio/peek.mjs`), and
 * the thing being looked for was **the mouth**. At 46 the card's edge cut
 * across the smile, and a celebration you cannot see the face of is a shape
 * moving. Duo works because you can tell it is pleased; a peek that clips the
 * grin has the motion and none of the point.
 */
export const PEEK = 58;

/**
 * The figure's width. Its box is `× KOA_ASPECT` taller, which is taller than
 * the band on purpose — a figure shorter than the band would show its feet
 * hanging in the air above the card.
 */
export const PEEK_FIGURE = 76;

/** How far the lean tips, in degrees, at the ends of its swing. */
export const LEAN_DEG = 7;

/**
 * How long Koa stays up, in ms.
 *
 * Not one of the four response beats and it should not be: those measure *how
 * long a change takes*, and this is a pause between two changes. A second is
 * long enough to look at a character and short enough that nobody waits for it.
 */
export const PEEK_HOLD_MS = 1000;

export interface PeekFrame {
  /** points down from the hanging position; `PEEK` is fully hidden */
  translateY: number;
  /** degrees */
  rotate: number;
  scaleY: number;
}

/**
 * @param rise 0 = parked out of sight, 1 = fully up
 * @param lean −1..1
 */
export function peekFrame(rise: number, lean: number): PeekFrame {
  'worklet';
  return {
    translateY: (1 - rise) * PEEK,
    rotate: lean * LEAN_DEG,
    /* A touch of squash on the way up — it lands rather than arrives. */
    scaleY: 1 + (1 - rise) * 0.06,
  };
}
