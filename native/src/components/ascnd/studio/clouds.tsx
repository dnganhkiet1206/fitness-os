import { Circle, G, Line } from 'react-native-svg';

import { GLASS } from '@/components/ascnd/studio/window';

/**
 * Cloud and rain geometry for the window, with no Reanimated in it — the same
 * split the motes, the plants and the insects follow, so `preview.mjs` and
 * `stage.mjs` can still bundle the scene with esbuild. The motion is in
 * `sky-live.tsx`.
 *
 * Neither shape carries a fill. The animated group above them supplies it,
 * which is what lets a cloud change colour when it starts raining without a
 * second copy of every shape underneath.
 */

export interface Drift {
  y: number;
  /** the cloud's own scale */
  w: number;
  /** crossings per sky cycle */
  speed: number;
  phase: number;
  /** the cover at which it starts to show */
  at: number;
  /** how solid it gets */
  alpha: number;
}

/**
 * Where each cloud sits and how fast it goes.
 *
 * `at` is the cover it starts to appear at, so a thin sky shows one cloud and
 * a heavy one shows three — "a few clouds" and "overcast" are the same three
 * shapes at different thresholds rather than three more of them.
 *
 * The speeds are close but not equal and share no ratio, so the three never
 * line up into a single band sliding past.
 */
export const DRIFTS: Drift[] = [
  { y: 118, w: 1, speed: 0.42, phase: 0, at: 0.12, alpha: 0.3 },
  { y: 136, w: 0.72, speed: 0.55, phase: 0.42, at: 0.4, alpha: 0.26 },
  { y: 108, w: 1.25, speed: 0.31, phase: 0.75, at: 0.68, alpha: 0.34 },
];

/**
 * A cloud's place and how solid it is, at sky-clock `t` and sky `cover`.
 *
 * Pure arithmetic and marked `worklet`, so `sky-live.tsx` runs it on the UI
 * thread and `tools/koa-studio/weather.mjs` runs the same one to draw the
 * sky without Reanimated. Only the colour is left to the caller: it comes
 * from `interpolateColor`, which is Reanimated's.
 */
export function cloudAt(d: Drift, t: number, cover: number): { matrix: number[]; opacity: number } {
  'worklet';
  const span = GLASS.w + 110;
  const u = (t * d.speed + d.phase) % 1;
  // it fades over a quarter of cover above its own threshold, so the sky
  // thickens rather than switching on
  const show = Math.max(0, Math.min(1, (cover - d.at) / 0.25));
  return { matrix: [1, 0, 0, 1, GLASS.x - 55 + u * span, d.y], opacity: show * d.alpha };
}

/**
 * One cloud: overlapping circles, which is the only way to make a soft mass
 * out of hard edges without a blur — and blur here means an SVG filter and a
 * rasterised pass, which this room does not allow.
 *
 * Drawn about its own left edge so `sky-live.tsx` only has to translate it.
 */
export function Cloud({ w = 1 }: { w?: number }) {
  return (
    <G>
      <Circle cx={10 * w} cy={0} r={7.5 * w} />
      <Circle cx={20 * w} cy={-3.5 * w} r={10 * w} />
      <Circle cx={32 * w} cy={-1 * w} r={8 * w} />
      <Circle cx={41 * w} cy={2 * w} r={6 * w} />
      <Circle cx={24 * w} cy={4 * w} r={7 * w} />
    </G>
  );
}

/* ── the rain ─────────────────────────────────────────────────────────── */

/**
 * Why rain made of one repeating row is always regular.
 *
 * A sheet of drops is animated by sliding one group down and wrapping it, and
 * for the wrap to have no seam **the drop that arrives has to be identical to
 * the one that left**. With one drop per column per repeat, that forces every
 * column to be a train of identical drops at identical spacing — which is a
 * comb, however the columns are jittered against each other. The first version
 * varied the length per column and the phase per column and was still visibly
 * a lattice sliding down.
 *
 * The way out is to make the *repeat* longer than the spacing. A sheet whose
 * tile is 34 units tall with two drops in it wraps just as seamlessly, and
 * inside that tile the two drops are free to differ in length, in weight and in
 * where they sit — so a column becomes an irregular train rather than a comb.
 *
 * The other half is depth. Three sheets, with tiles that share no ratio and
 * fall at 62, 92 and 128 units a second, and the eye stops being able to find
 * the period at all. They are drawn back to front: the far sheet is thin and
 * faint and slow, the near one heavy and quick.
 */
export interface Sheet {
  /** the vertical repeat — also how far the group slides per loop */
  tile: number;
  /** loops per sky cycle, chosen so the sheet falls at `tile · speed / 45` u/s */
  speed: number;
  columns: number;
  /** drops per column per tile — more than one is the whole point */
  per: number;
  weight: number;
  /** how long its drops run, as a multiple of the base 2.4–5.0 */
  reach: number;
  alpha: number;
}

/**
 * Far, middle and near.
 *
 * Every property moves together with the depth — thinner, shorter, fainter and
 * slower as it goes back — because one of them alone reads as a mistake rather
 * than as distance. The near sheet is the only one you really see, and it is
 * the smallest: four columns of two.
 */
export const SHEETS: Sheet[] = [
  { tile: 34, speed: 82, columns: 6, per: 2, weight: 0.5, reach: 0.75, alpha: 0.3 },
  { tile: 41, speed: 101, columns: 6, per: 2, weight: 0.7, reach: 1, alpha: 0.5 },
  { tile: 27, speed: 213, columns: 4, per: 2, weight: 0.95, reach: 1.25, alpha: 0.7 },
];

/** a cheap deterministic 0..1 — the drops must be the same on every render */
function noise(n: number): number {
  const v = Math.sin(n * 12.9898) * 43758.5453;
  return v - Math.floor(v);
}

/**
 * One sheet of rain.
 *
 * Note what the per-drop values are allowed to depend on: the column and the
 * index *within the tile*, and never the row. A value that varied by row would
 * put a visible seam at the wrap, which is the one thing this layout exists to
 * avoid.
 */
export function RainSheet({ s }: { s: Sheet }) {
  const rows = Math.ceil(GLASS.h / s.tile) + 1;
  const drops: [number, number, number, number][] = [];
  for (let c = 0; c < s.columns; c++) {
    const bx = GLASS.x + 3 + (c * (GLASS.w - 6)) / (s.columns - 1);
    for (let i = 0; i < s.per; i++) {
      const h = noise(c * 7.3 + i * 31.7);
      const g = noise(c * 3.1 + i * 17.9);
      // pushed off its column, so the sheet is not a set of vertical lines
      const x = bx + (h - 0.5) * 11;
      const len = (2.4 + g * 2.6) * s.reach;
      const a = 0.5 + g * 0.5;
      const off = ((i + 0.35 + 0.5 * h) / s.per) * s.tile;
      for (let r = 0; r < rows; r++) {
        drops.push([x, GLASS.y - s.tile + r * s.tile + off, len, a]);
      }
    }
  }
  return (
    <G>
      {drops.map(([x, y, len, a], i) => (
        <Line
          key={i}
          x1={x}
          y1={y}
          x2={x - len * 0.26}
          y2={y + len}
          strokeWidth={s.weight}
          strokeOpacity={a}
          strokeLinecap="round"
        />
      ))}
    </G>
  );
}
