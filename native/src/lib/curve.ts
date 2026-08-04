/**
 * The drawn line, as geometry — sampling it and asking where it is.
 *
 * ── why this is a file and not two helpers in the chart ──
 *
 * Both functions decide something the eye will check instantly. `sampleCurve`
 * has to produce points that sit *on* the stroke the chart draws, and
 * `yOnCurve` is what the scrubber's marker rides and what decides whether a
 * finger landed on the line at all. If either drifts from the path the chart
 * paints, the line stops responding where it looks like it should.
 *
 * Next to the SVG they could only be checked by reading, because the component
 * pulls in React and `react-native-svg` and neither loads in Node. Out here,
 * `tools/curve.mjs` compiles this and runs the real functions — the same reason
 * `water-scale.ts` and `edge-failure.ts` sit apart from what uses them.
 */

export interface CurvePoint {
  x: number;
  y: number;
}

/** roughly how many samples to spend on a whole series, however long it is */
const BUDGET = 120;

/**
 * The path as a list of points.
 *
 * The chart's path is a chain of cubics whose control points share their
 * endpoints' y (`C mid y0, mid y1, x1 y1`). Finding y for a given x on that
 * exactly means inverting a cubic; sampling it and interpolating between
 * samples is a few lines, has no failure mode, and is wrong by less than the
 * width of the stroke.
 *
 * The count per segment shrinks as the series grows, so the array stays around
 * `BUDGET` points whether the chart shows a week or ten years. At the dense end
 * each segment collapses to its endpoints, which is right: with readings a
 * couple of pixels apart, the curve between them and a straight line between
 * them are the same thing on screen.
 */
export function sampleCurve(xs: readonly number[], ys: readonly number[]): CurvePoint[] {
  if (xs.length === 0) return [];
  const segs = Math.max(1, xs.length - 1);
  const per = Math.max(1, Math.round(BUDGET / segs));
  const out: CurvePoint[] = [{ x: xs[0], y: ys[0] }];
  for (let i = 1; i < xs.length; i++) {
    const x0 = xs[i - 1];
    const x1 = xs[i];
    const y0 = ys[i - 1];
    const y1 = ys[i];
    const mid = (x0 + x1) / 2;
    for (let k = 1; k <= per; k++) {
      const t = k / per;
      const u = 1 - t;
      // Bezier with P1 = (mid, y0) and P2 = (mid, y1) — the same control points
      // the path string is built from, so the samples sit on the drawn line.
      out.push({
        x: u * u * u * x0 + 3 * u * u * t * mid + 3 * u * t * t * mid + t * t * t * x1,
        y: u * u * u * y0 + 3 * u * u * t * y0 + 3 * u * t * t * y1 + t * t * t * y1,
      });
    }
  }
  return out;
}

/**
 * y on the sampled curve at `px`, clamped to its ends.
 *
 * `'worklet'` so the scrubber's marker can call it on the UI thread; it is also
 * called from ordinary JS to decide whether a touch landed on the line. One
 * function for both, because a hit test that disagreed with the drawing by even
 * a few points would make the line feel like it had moved.
 */
export function yOnCurve(curve: readonly CurvePoint[], px: number): number {
  'worklet';
  if (curve.length === 0) return 0;
  if (px <= curve[0].x) return curve[0].y;
  const last = curve[curve.length - 1];
  if (px >= last.x) return last.y;
  // Linear scan: the sample count is capped at `BUDGET` and this runs once per
  // frame on the UI thread, where a branchy binary search is not obviously
  // cheaper and is much easier to get wrong at the ends.
  for (let i = 1; i < curve.length; i++) {
    if (px <= curve[i].x) {
      const a = curve[i - 1];
      const b = curve[i];
      const span = b.x - a.x;
      return span <= 0 ? b.y : a.y + ((px - a.x) / span) * (b.y - a.y);
    }
  }
  return last.y;
}

/**
 * How far from the line a touch still counts as being on it.
 *
 * The scrubber used to take any touch anywhere in the plot, which turned a
 * 180pt band of a long scrolling page into something that swallowed the gesture
 * and locked the page — most often for somebody who was only scrolling past.
 *
 * 22 points either side gives the line a 44pt target, Apple's floor for
 * anything meant to be hit with a finger, and leaves the rest of the card to
 * the page.
 */
export const HIT_BAND = 22;

/**
 * Is this point on the line?
 *
 * The band is measured from the curve, not from a rectangle, and the curve is
 * rebuilt from the data on every render — so it moves when a weigh-in is added,
 * when the range buttons change the window, and when the axis rescales. There
 * is no region anywhere that a later change to the data could leave behind.
 */
export function onCurve(curve: readonly CurvePoint[], px: number, py: number): boolean {
  if (curve.length === 0) return false;
  return Math.abs(py - yOnCurve(curve, px)) <= HIT_BAND;
}
