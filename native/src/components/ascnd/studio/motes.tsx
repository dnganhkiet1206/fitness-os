import { Circle } from 'react-native-svg';

import { C } from '@/components/ascnd/studio/palette';

/**
 * Motes in the lamp's beam.
 *
 * Nine of them, and they live **inside the cone** — the room's air is only
 * visible where light crosses it, which is why they are not scattered over
 * the walls any more. Each sits within the beam's half-width at its own
 * height: 30 units at y95 widening to 100 at y305, where the gradient has
 * faded out. Move one and check it is still inside that envelope.
 *
 * The radii are deliberately uneven, 0.9 to 2.4. A uniform speck size reads
 * as a pattern; dust does not have one.
 *
 * **They are the lamp's colour, and the tint follows the light.** All nine are
 * `highlight`, so dust in the beam is lit by the beam rather than sitting in
 * it as neutral specks. What that measures as depends on where a mote is:
 * near the mouth they come out at R−B +34 · +35 · +23, plainly warm, and by
 * the foot they read −6, because the beam has cooled to the wall's own colour
 * by then and a mote at this strength cannot warm what is behind it. Raising
 * the low ones to force it back only makes them brighter, not warmer, which
 * is a worse trade — they are dust, not lights.
 *
 * **Strength is measured, not chosen.** A mote only reads where it is
 * brighter than what is behind it, and inside a lit beam that is not free: an
 * early gold mote up in the bright cone measured 7 luminance units *darker*
 * than the light around it, which looks like dirt on the lens. Every one here
 * sits at +12 to +16 against a median of its surroundings. They were briefly
 * at +30 to +99, which read as stars. Re-measure if any moves.
 *
 * They are drawn in the overlay canvas, never inside `KoaStudio` — see
 * `studio-live.tsx` for why that boundary exists.
 */
export type Mote = [x: number, y: number, r: number, opacity: number, fill: string];

export const MOTES: Mote[] = [
  [178, 95, 0.7, 0.1, C.highlight],
  [210, 112, 1.2, 0.1, C.highlight],
  [168, 140, 0.85, 0.1, C.highlight],
  [225, 165, 1.65, 0.095, C.highlight],
  [150, 190, 1.0, 0.09, C.highlight],
  [240, 215, 0.8, 0.09, C.highlight],
  [175, 245, 1.8, 0.09, C.highlight],
  [252, 275, 1.05, 0.085, C.highlight],
  [140, 305, 1.35, 0.085, C.highlight],
];

/**
 * How the motes drift, kept here with the motes themselves.
 *
 * The motion is applied in `motes-drift.tsx`, but the *amplitude* is geometry:
 * `live-regions.ts` sizes the beam's canvas from it, and a canvas that forgets
 * how far the drift reaches clips the top of it once a cycle. Numbers that two
 * files have to agree on live in the one that has no Reanimated in it, so both
 * can read them.
 *
 * Dust in a beam rises and settles; it does not slide sideways. The vertical
 * term carries the motion and the horizontal one is barely more than a wobble,
 * just enough that the three bands do not read as lifts. `[across, down]`.
 */
export const MOTE_SWAY: [number, number][] = [
  [0.9, 8.5],
  [1.3, 6.5],
  [0.7, 10.0],
];
export const MOTE_BANDS = MOTE_SWAY.length;
/** bands are offset in the cycle so they never move as one sheet */
export const MOTE_PHASE = [0, 0.37, 0.71];

/** the furthest any band travels from where it is drawn, in either axis */
export const MOTE_REACH = Math.max(...MOTE_SWAY.flat());

export function Specks({ list }: { list: Mote[] }) {
  return (
    <>
      {list.map(([x, y, r, o, fill], i) => (
        <Circle key={i} cx={x} cy={y} r={r} fill={fill} opacity={o} />
      ))}
    </>
  );
}

/**
 * The motes at rest.
 *
 * This is what `preview.mjs` renders: it calls the components as plain
 * functions with no React runtime, so a hook would throw. `KoaStudio` picks
 * this branch whenever it is not told the screen is focused, which is also
 * what every still of the scene should show.
 */
export function Motes() {
  return <Specks list={MOTES} />;
}
