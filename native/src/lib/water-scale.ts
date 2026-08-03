import { displayVolume, volumeToMl } from './units';

/**
 * The water chart's value axis: where the top of the scale sits, and what to
 * print beside it.
 *
 * ── why this is a file and not two functions in the component ──
 *
 * An axis is a claim. A bar drawn at half height beside a label saying "3L" is
 * asserting 1.5L, and if the label and the geometry disagree the chart is worse
 * than the one it replaced — that one had no numbers, so it could not lie.
 *
 * These two functions are the whole claim, and they are pure. Kept next to the
 * SVG they could only be checked by reading, because the component pulls in
 * React and `react-native-svg` and neither loads in Node. Out here,
 * `tools/water-scale.mjs` compiles this file and runs the real functions
 * against real values — the same reason `edge-failure.ts` sits apart from the
 * Supabase client.
 */

/** half a litre, or a large glass — the sizes these units come in */
const STEP = { ml: 500, oz: 16 } as const;

/**
 * A ceiling at or above `needMl`, on a step the unit can say out loud.
 *
 * Returns both forms because both are needed and converting twice is how they
 * drift: `ml` is what bar heights are measured against, `display` is what the
 * axis prints.
 *
 * ── rounded in the unit on screen, then converted back ──
 *
 * Not the other way round, which is how the first version of this was wrong. It
 * applied a sixteen-*ounce* step to a *millilitre* number, so a 2500ml target
 * came out as 2512ml and the axis label for that is "85". Every bar would have
 * been the right height and every label round-looking and arbitrary. Only the
 * imperial path was affected — which is exactly the kind of thing that ships.
 */
export function scaleTop(needMl: number, unit: 'ml' | 'oz'): { ml: number; display: number } {
  const step = STEP[unit];
  const display = Math.max(step, Math.ceil(displayVolume(needMl, unit) / step) * step);
  return { ml: volumeToMl(display, unit), display };
}

/** The label for a value already in the unit on screen. */
export function axisLabel(v: number, unit: 'ml' | 'oz'): string {
  if (v <= 0) return '0';
  if (unit === 'oz') return `${Math.round(v)}`;
  // Litres, and only a decimal when there is one: 2L, not 2.0L — a trailing
  // zero reads as a measurement, and this is a quantity.
  const l = v / 1000;
  return `${Number.isInteger(l) ? l : l.toFixed(1)}L`;
}
