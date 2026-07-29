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

/**
 * The rain, as one tile that repeats.
 *
 * Every drop is in a single group, and `sky-live.tsx` slides that group down
 * by exactly `RAIN_SPACING` per loop. The rows are laid out a spacing apart
 * and one extra row is stacked above the glass, so as the bottom row leaves
 * the top one arrives in its place and the loop has no seam. That is the whole
 * reason it can be one animated group rather than one per drop.
 *
 * The columns are offset by an irrational-ish step rather than a grid, or it
 * reads as a curtain being lowered.
 */
export const RAIN_SPACING = 13;
const COLUMNS = 9;

export function Rain() {
  const rows = Math.ceil(GLASS.h / RAIN_SPACING) + 1;
  const drops: [number, number, number][] = [];
  for (let c = 0; c < COLUMNS; c++) {
    // lengths differ by column so it reads as rain rather than as hatching —
    // every drop the same length is a comb, which is what the first pass drew
    const len = 3 + ((c * 7) % 5) * 0.55;
    for (let r = 0; r < rows; r++) {
      const x = GLASS.x + 2 + (c * (GLASS.w - 4)) / (COLUMNS - 1);
      const y = GLASS.y - RAIN_SPACING + r * RAIN_SPACING + ((c * 5.7) % RAIN_SPACING);
      drops.push([x, y, len]);
    }
  }
  return (
    <G>
      {drops.map(([x, y, len], i) => (
        <Line key={i} x1={x} y1={y} x2={x - len * 0.26} y2={y + len} strokeWidth={0.85} strokeLinecap="round" />
      ))}
    </G>
  );
}
