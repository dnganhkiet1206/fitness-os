import { Ellipse, G, Path } from 'react-native-svg';

import { C } from '@/components/ascnd/studio/palette';

/* ── where they fly ───────────────────────────────────────────────────── */

/**
 * One cycle for all three, in ms.
 *
 * Prime-ish against the motes' 26s and the light's 7.3s so the three never
 * fall into step. It went from 41s to 72 when the insects started landing —
 * a crossing with a pause in it takes twice as long, and at the old period
 * something would have been on screen most of the time.
 */
export const BUG_PERIOD = 72000;

/**
 * A place on the way, and how long it stays there.
 *
 * The first stop in a route is where it comes in from and is never landed on;
 * every stop after it has a leg leading to it.
 */
export interface Stop {
  /** where, in artboard units */
  p: [number, number];
  /** how long the leg *into* here takes, as a share of the crossing */
  leg: number;
  /** how long it sits here afterwards. 0 flies straight through */
  hold: number;
  /** how far that leg bows off the straight line, perpendicular to it */
  bow: number;
}

export interface Route {
  stops: Stop[];
  /** the fraction of the cycle it is on screen for */
  span: number;
  /** where in the cycle that fraction starts */
  phase: number;
  /**
   * Wingbeats per *crossing*, not per clock cycle.
   *
   * Which is easy to get wrong, and was: read as per-cycle the first numbers
   * here put the butterfly at 42Hz and the bee at 103, both far past what
   * 60fps can draw. A wing that beats faster than the frame rate does not look
   * fast, it looks like noise. `tools/koa-studio/bugs.mjs` prints the rate in
   * Hz and the largest step between frames for exactly this reason.
   */
  beats: number;
  /** how far the wings fold in flight, and how far they fold once settled */
  fold: number;
  foldHold: number;
  /** what fraction of the flying beat rate it keeps while perched */
  holdBeat: number;
  /** how far it wanders off its own path on the way */
  wander: number;
  scale: number;
}

/**
 * Where each one goes.
 *
 * ── it lands ──
 *
 * A route is a list of places rather than a line from one edge to the other,
 * and one of them is somewhere in the room the insect actually sits on for a
 * while: the bee on the shelf's plant, the butterfly on the corner of the neon
 * sign, the moth on the floor plant. Both are places a real one would pick —
 * something to stand on, near light.
 *
 * ── and it does not fly in a straight line ──
 *
 * Three things together, because no one of them is enough. The legs bow
 * alternately, so the path S-bends rather than arcing once. `wander` adds two
 * sine terms at 3.7 and 2.3 cycles per crossing — deliberately not a ratio
 * that closes, so the wobble never repeats within one crossing. And the whole
 * thing is on an envelope of `sin(π · leg progress)`, which is zero at every
 * stop: it wanders most in the middle of a leg and settles as it arrives,
 * which is both what an insect does and what keeps a landing from jittering.
 *
 * Two of the three no longer cross the room and leave by the far side. The
 * moth comes in and goes out on the right; the bee comes in low from the left
 * and leaves through the top. A route that always ends where you can see it is
 * heading is the thing that reads as a sprite on a track.
 */
export const ROUTES: Route[] = [
  {
    // the bee: in low from the left, onto the shelf's plant, then up and out
    stops: [
      { p: [-16, 250], leg: 0, hold: 0, bow: 0 },
      { p: [96, 216], leg: 0.17, hold: 0, bow: -20 },
      { p: [52, 236], leg: 0.13, hold: 0.2, bow: 16 },
      { p: [148, 168], leg: 0.19, hold: 0, bow: -26 },
      { p: [206, -18], leg: 0.31, hold: 0, bow: 30 },
    ],
    span: 0.097, phase: 0.02, beats: 84, fold: 0.12, foldHold: 0.2,
    holdBeat: 0.03, wander: 5, scale: 1,
  },
  {
    // the butterfly: in high from the right, onto the neon sign, then out left
    stops: [
      { p: [406, 108], leg: 0, hold: 0, bow: 0 },
      { p: [292, 148], leg: 0.15, hold: 0, bow: 22 },
      { p: [198, 112], leg: 0.15, hold: 0, bow: -28 },
      { p: [110, 152], leg: 0.13, hold: 0.22, bow: 20 },
      { p: [-16, 214], leg: 0.35, hold: 0, bow: 26 },
    ],
    span: 0.125, phase: 0.33, beats: 54, fold: 0.62, foldHold: 0.86,
    holdBeat: 0.07, wander: 8, scale: 1,
  },
  {
    // the moth: in and out on the right, with the floor plant in between
    stops: [
      { p: [406, 292], leg: 0, hold: 0, bow: 0 },
      { p: [332, 258], leg: 0.18, hold: 0, bow: 20 },
      { p: [300, 330], leg: 0.14, hold: 0.24, bow: -24 },
      { p: [354, 262], leg: 0.16, hold: 0, bow: 26 },
      { p: [406, 142], leg: 0.28, hold: 0, bow: -22 },
    ],
    span: 0.132, phase: 0.63, beats: 43, fold: 0.55, foldHold: 0.8,
    holdBeat: 0.06, wander: 7, scale: 0.86,
  },
];

/* ── the maths ────────────────────────────────────────────────────────── */

/** the whole crossing's length, in the same units the legs and holds use */
function totalOf(r: Route): number {
  'worklet';
  let n = 0;
  for (let i = 1; i < r.stops.length; i++) n += r.stops[i].leg + r.stops[i].hold;
  return n;
}

/**
 * Where it is at `s` along the crossing, and what the wings are doing.
 *
 * `wing` is the accumulated beat *phase*, not a rate, because the rate changes
 * when it settles: a butterfly at rest opens and closes about once every two
 * seconds where in flight it beats six times a second. Reading the phase off
 * the rate directly would jump the wings at every landing. `settle` runs 0 to
 * 1 over the first and last fifth of a hold, and everything that has to change
 * between flying and perched rides on it.
 */
function walk(r: Route, s: number): { x: number; y: number; wing: number; settle: number } {
  'worklet';
  const total = totalOf(r);
  const rate = r.beats / total;
  let acc = 0;
  let wing = 0;
  for (let i = 1; i < r.stops.length; i++) {
    const a = r.stops[i - 1].p;
    const b = r.stops[i].p;
    const { leg, hold, bow } = r.stops[i];
    if (s < acc + leg || i === r.stops.length - 1) {
      const p = leg > 0 ? Math.min(1, (s - acc) / leg) : 1;
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const arc = Math.sin(Math.PI * p);
      const env = arc;
      const u = s / total;
      return {
        x: a[0] + dx * p + (-dy / len) * bow * arc + r.wander * env * Math.sin(2 * Math.PI * u * 3.7),
        y:
          a[1] + dy * p + (dx / len) * bow * arc +
          r.wander * 0.7 * env * Math.sin(2 * Math.PI * u * 2.3 + 1.1),
        wing: wing + rate * (s - acc),
        settle: 0,
      };
    }
    wing += rate * leg;
    acc += leg;
    if (s < acc + hold) {
      const k = hold > 0 ? (s - acc) / hold : 1;
      return {
        x: b[0],
        y: b[1],
        wing: wing + rate * r.holdBeat * (s - acc),
        settle: Math.min(1, k / 0.2, (1 - k) / 0.2),
      };
    }
    wing += rate * r.holdBeat * hold;
    acc += hold;
  }
  const last = r.stops[r.stops.length - 1].p;
  return { x: last[0], y: last[1], wing, settle: 0 };
}

/**
 * One insect's matrix and opacity at clock position `t`, 0..1.
 *
 * It is transparent outside its own window, so nothing is drawn while it is
 * away. Position, heading and wingbeat all come out of the one matrix —
 * `translate · rotate · scale(sx, 1)` — because each animated group is an
 * invalidation source and a group for the wings alone would double the count.
 * The body squashing with them is not something you can see at seven points
 * across.
 *
 * The heading comes from the path's own slope one step on. While it is perched
 * that slope is zero, and `atan2(0, 0)` is 0 — which would snap a landed
 * butterfly flat to the horizontal. So a hold keeps the heading it arrived
 * with, read from just before the leg ended.
 *
 * Marked `worklet` so `bugs-live.tsx` can call it on the UI thread; it is
 * plain arithmetic, which is also what lets `tools/koa-studio/bugs.mjs` draw
 * the same flight without Reanimated.
 */
export function flightAt(r: Route, t: number): { matrix: number[]; opacity: number } {
  'worklet';
  const cycle = (t + 1 - r.phase) % 1;
  if (cycle > r.span) return { matrix: [1, 0, 0, 1, 0, -9999], opacity: 0 };
  const u = cycle / r.span;

  const total = totalOf(r);
  const s = u * total;
  const here = walk(r, s);
  const d = total * 0.004;
  // perched: look back to the moment it arrived, not forward into nothing
  const from = here.settle > 0 ? walk(r, Math.max(0, s - d * 6)) : here;
  const to = here.settle > 0 ? walk(r, Math.max(0, s - d * 5)) : walk(r, Math.min(total, s + d));
  const a = Math.atan2(to.y - from.y, to.x - from.x);
  const cos = Math.cos(a);
  const sin = Math.sin(a);

  // a fold that never quite closes in flight, and nearly does at rest
  const fold = r.fold + (r.foldHold - r.fold) * here.settle;
  const sx = 1 - fold * (0.5 - 0.5 * Math.cos(2 * Math.PI * here.wing));
  const sc = r.scale;
  return {
    matrix: [cos * sx * sc, sin * sx * sc, -sin * sc, cos * sc, here.x, here.y],
    // in and out at the ends of the window, never a pop
    opacity: Math.min(1, u / 0.1, (1 - u) / 0.1),
  };
}

/**
 * Whichever insect is sitting still right now, and how settled it is.
 *
 * The mascot glances at it — see `koa-gaze.ts`. `settle` already runs 0 → 1 →
 * 0 across a hold, so the look eases in as the insect lands and out as it
 * leaves without any state to keep. Nothing is perched for about two thirds of
 * the cycle, and then `k` is 0 and there is nothing to look at.
 */
export function perchAt(t: number): { x: number; y: number; k: number } {
  'worklet';
  for (let i = 0; i < ROUTES.length; i++) {
    const r = ROUTES[i];
    const cycle = (t + 1 - r.phase) % 1;
    if (cycle > r.span) continue;
    const w = walk(r, (cycle / r.span) * totalOf(r));
    if (w.settle > 0) return { x: w.x, y: w.y, k: w.settle };
  }
  return { x: 0, y: 0, k: 0 };
}

/* ── what they look like ──────────────────────────────────────────────── */

/**
 * A bee and a butterfly, drawn about the origin so the thing that moves them
 * only has to supply a matrix.
 *
 * No Reanimated in here, the same rule the motes and the plants follow:
 * `preview.mjs` and `stage.mjs` bundle the scene with esbuild, which will not
 * parse `react-native`'s Flow syntax, so one import of it in a file the studio
 * can reach takes the room's whole verification story with it. See
 * `bugs-live.tsx` for the motion.
 *
 * Size took a correction. Drawn "true to life" — nine and twelve units on a
 * 390-wide board, about three points on the phone — they were there and
 * nobody could see them: a butterfly in the palette's own purples at that size
 * is indistinguishable from the wall it crosses. They are about twice that
 * now, which is still under seven percent of the room's width.
 *
 * At this size detail is a waste and contrast is everything, so each is a
 * silhouette with one lighter accent, and both are built from colours already
 * in the palette.
 */

/**
 * The bee: body, two stripes, a head, and a blur where the wings are.
 *
 * A bee's wings beat about two hundred times a second. Nothing on a screen can
 * draw that, and the honest answer is not to try — what you actually see is a
 * pale smear either side of the body, which is what these two ellipses are.
 */
export function Bee() {
  return (
    <G>
      <Ellipse cx={-2.4} cy={-4.4} rx={5.4} ry={2.9} fill={C.white} opacity={0.32} />
      <Ellipse cx={2.7} cy={-4.1} rx={4.4} ry={2.5} fill={C.white} opacity={0.24} />
      <Ellipse cx={0} cy={0} rx={6.1} ry={3.9} fill={C.highlight} />
      <Path d="M-2.4 -3.5 L-2.4 3.5" stroke={C.primary} strokeWidth={2.2} strokeLinecap="round" />
      <Path d="M1.5 -3.7 L1.5 3.7" stroke={C.primary} strokeWidth={2.2} strokeLinecap="round" />
      <Ellipse cx={6.1} cy={0} rx={2.5} ry={2.5} fill={C.primary} />
    </G>
  );
}

/**
 * The butterfly: two wing pairs and a body.
 *
 * The upper pair carries the shape and the lower pair is half its size, which
 * is the whole silhouette at this scale.
 *
 * `tint` and `alpha` exist so the two of them are not the same insect twice.
 * The room is purple, so a purple butterfly is the one thing here that has to
 * fight its own background — `soft` and `accent` side by side were nearly
 * indistinguishable both from each other and from the wall. The second is a
 * pale moth instead: white at half strength, which is the only value in the
 * palette that has nothing to do with the room it crosses.
 */
export function Butterfly({ tint = C.soft, alpha = 0.95 }: { tint?: string; alpha?: number }) {
  return (
    <G>
      <Ellipse cx={-5.8} cy={-2.7} rx={7.1} ry={5.3} fill={tint} opacity={alpha} />
      <Ellipse cx={5.8} cy={-2.7} rx={7.1} ry={5.3} fill={tint} opacity={alpha} />
      <Ellipse cx={-4.6} cy={3.7} rx={4.8} ry={3.6} fill={tint} opacity={alpha * 0.7} />
      <Ellipse cx={4.6} cy={3.7} rx={4.8} ry={3.6} fill={tint} opacity={alpha * 0.7} />
      {/* one lit edge on each upper wing — the lamp is above them too */}
      <Ellipse cx={-6.6} cy={-4.6} rx={3.4} ry={1.7} fill={C.white} opacity={0.3} />
      <Ellipse cx={6.6} cy={-4.6} rx={3.4} ry={1.7} fill={C.white} opacity={0.3} />
      <Ellipse cx={0} cy={0} rx={1.5} ry={5.8} fill={C.primary} />
    </G>
  );
}
