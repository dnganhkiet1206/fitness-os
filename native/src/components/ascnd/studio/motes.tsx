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
 * **Colour follows brightness, not taste.** A mote only reads where it is
 * brighter than what is behind it, and inside a lit beam that rules the warm
 * out near the top: an early gold mote up in the bright cone measured 7
 * luminance units *darker* than the light around it, which looks like dirt on
 * the lens. So the high ones are white and the low ones, where the beam has
 * faded towards the wall, can afford the room's own colours. Every position
 * here is measured against a median of its surroundings; re-measure if any
 * moves.
 *
 * They are drawn in the overlay canvas, never inside `KoaStudio` — see
 * `studio-live.tsx` for why that boundary exists.
 */
export type Mote = [x: number, y: number, r: number, opacity: number, fill: string];

export const MOTES: Mote[] = [
  [178, 95, 0.9, 0.07, C.white],
  [210, 112, 1.6, 0.07, C.white],
  [168, 140, 1.1, 0.07, C.white],
  [225, 165, 2.2, 0.065, C.white],
  [150, 190, 1.3, 0.06, C.white],
  [240, 215, 1.0, 0.12, C.soft],
  [175, 245, 2.4, 0.12, C.soft],
  [252, 275, 1.4, 0.08, C.highlight],
  [140, 305, 1.8, 0.08, C.highlight],
];

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
