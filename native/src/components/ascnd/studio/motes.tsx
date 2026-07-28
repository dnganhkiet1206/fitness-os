import { Circle } from 'react-native-svg';

import { C } from '@/components/ascnd/studio/palette';

/**
 * Neon motes — the room's own colours hanging in the air.
 *
 * Twelve of them. There were twenty-two and the room read as dirty rather
 * than as air, so this is the count the user settled on; keep it sparse.
 *
 * They belong *above* `Vignette`, which reaches full `bgTop` at the corners
 * and would paint out exactly the ones meant to read there. When the room is
 * live they are drawn in the overlay canvas instead — see `studio-live.tsx`.
 *
 * A mote only reads where it is **brighter than what is behind it**, which
 * is why the placements are measured rather than eyeballed. Two of the first
 * ones failed that: a warm mote inside the beam's bright upper cone came out
 * 7 luminance units *darker* than the light around it — a speck of dirt, not
 * dust — and one on the window frame moved the pixel by 1.5. So they sit on
 * wall and floor, never on a lit prop, and never inside the beam above
 * y ≈ 210. They also stay out of the column the character stands in, roughly
 * x 130–260 below y 250.
 *
 * Only palette colours, and only the two purples plus the warm, so the air
 * belongs to the neon sign and the lamp rather than adding a colour of its
 * own.
 */
export type Mote = [x: number, y: number, r: number, opacity: number, fill: string];

export const MOTES: Mote[] = [
  [58, 96, 1.6, 0.11, C.soft], [256, 96, 1.5, 0.11, C.soft],
  [128, 112, 1.4, 0.09, C.highlight], [34, 116, 1.4, 0.09, C.soft],
  [118, 172, 1.6, 0.09, C.soft], [258, 176, 1.4, 0.11, C.accent],
  [44, 200, 1.5, 0.09, C.soft], [96, 224, 1.5, 0.09, C.highlight],
  [352, 226, 1.4, 0.09, C.accent], [150, 232, 1.7, 0.11, C.soft],
  [250, 316, 1.5, 0.11, C.soft], [36, 360, 1.6, 0.11, C.soft],
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
