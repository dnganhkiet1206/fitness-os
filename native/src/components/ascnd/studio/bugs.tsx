import { Ellipse, G, Path } from 'react-native-svg';

import { C } from '@/components/ascnd/studio/palette';

/* ── where they fly ───────────────────────────────────────────────────── */

/** one cycle for all three, in ms — prime-ish against the motes' 26s and the
 *  light's 7.3s, so the three never fall into step */
export const BUG_PERIOD = 41000;

export interface Route {
  /** where it enters and where it leaves, in artboard units */
  from: [number, number];
  to: [number, number];
  /** how far the path bows off the straight line, perpendicular to it */
  bow: number;
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
  /** how far the wings fold, as a fraction of full span */
  fold: number;
  /** how much it bobs on the way across */
  bob: number;
  scale: number;
}

/**
 * The bee goes almost straight and quickly; the butterflies bow harder, drift
 * slower and bob more. That difference is most of what tells the two apart at
 * this size — more than the drawings do.
 *
 * They cross the upper half of the room. The studio's "centre stays empty"
 * rule is about furniture, something standing in front of the character, and a
 * bee that takes four seconds to cross is the opposite of that; it is still
 * routed above the mascot's head rather than through it.
 *
 * Spans add up to about a third of the cycle and the phases are spread, so the
 * room is empty most of the time — which is what makes them something you
 * notice rather than something that is always there.
 */
export const ROUTES: Route[] = [
  // the bee, left to right across the shelf and out past the window
  { from: [-14, 232], to: [404, 150], bow: -46, span: 0.09, phase: 0.02, beats: 44, fold: 0.12, bob: 3.4, scale: 1 },
  // a butterfly back the other way, high
  { from: [404, 120], to: [-14, 196], bow: 38, span: 0.11, phase: 0.34, beats: 27, fold: 0.62, bob: 5.5, scale: 1 },
  // and one lower and slower, over the podium's far edge
  { from: [-14, 268], to: [404, 244], bow: -74, span: 0.12, phase: 0.66, beats: 22, fold: 0.55, bob: 6.5, scale: 0.86 },
];

/**
 * One insect's matrix and opacity at clock position `t`, 0..1.
 *
 * `u` runs 0 → 1 across its own window and it is transparent outside it, so
 * nothing is drawn while it is away. Position, heading and wingbeat all come
 * out of the one matrix — `translate · rotate · scale(sx, 1)` — because each
 * animated group is an invalidation source and a group for the wings alone
 * would double the count. The body squashing with them is not something you
 * can see at three points across.
 *
 * The heading comes from the path's own slope one step on rather than from a
 * constant, so a butterfly on a bowed route banks into the turn instead of
 * sliding sideways through it.
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

  const dx = r.to[0] - r.from[0];
  const dy = r.to[1] - r.from[1];
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const at = (p: number): [number, number] => {
    const arc = Math.sin(Math.PI * p);
    return [
      r.from[0] + dx * p + nx * r.bow * arc,
      r.from[1] + dy * p + ny * r.bow * arc + r.bob * Math.sin(2 * Math.PI * p * 3),
    ];
  };
  const [x, y] = at(u);
  const [x2, y2] = at(u + 0.01);
  const a = Math.atan2(y2 - y, x2 - x);
  const cos = Math.cos(a);
  const sin = Math.sin(a);

  // a fold that never quite closes, so it keeps its silhouette
  const sx = 1 - r.fold * (0.5 - 0.5 * Math.cos(2 * Math.PI * u * r.beats));
  const s = r.scale;
  return {
    matrix: [cos * sx * s, sin * sx * s, -sin * s, cos * s, x, y],
    // in and out at the ends of the window, never a pop
    opacity: Math.min(1, u / 0.12, (1 - u) / 0.12),
  };
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
