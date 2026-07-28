import { Ellipse, G, Path } from 'react-native-svg';

import { C } from '@/components/ascnd/studio/palette';

/**
 * A potted plant, drawn once and used twice — small on the shelf, large on
 * the floor. `s` is the only difference between them, which is the brief's
 * rule about depth coming from scale rather than from new artwork.
 *
 * (x, y) is the centre of the pot's base, so it can be placed by where it
 * stands rather than by a bounding box.
 */
export function Plant({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <G transform={`translate(${x} ${y}) scale(${s})`}>
      {/* leaves first — the pot laps over their stems */}
      <Path d="M0 -22 C -14 -34 -19 -48 -14 -58 C -3 -52 2 -38 0 -22 Z" fill={C.plant} />
      <Path d="M0 -22 C 14 -34 19 -48 14 -58 C 3 -52 -2 -38 0 -22 Z" fill={C.plant} opacity={0.85} />
      <Path d="M0 -20 C -22 -26 -32 -36 -31 -46 C -18 -44 -6 -32 0 -20 Z" fill={C.plant} opacity={0.7} />
      <Path d="M0 -20 C 22 -26 32 -36 31 -46 C 18 -44 6 -32 0 -20 Z" fill={C.plant} opacity={0.78} />
      <Path d="M0 -24 C -4 -40 -2 -54 2 -62 C 7 -52 6 -36 0 -24 Z" fill={C.plant} />
      {/* pot */}
      <Path d="M-15 -22 L 15 -22 L 11 0 L -11 0 Z" fill={C.accent} />
      <Ellipse cx={0} cy={-22} rx={15} ry={4} fill={C.soft} />
      <Path d="M-15 -22 L -12 -22 L -8 0 L -11 0 Z" fill={C.white} opacity={0.1} />
    </G>
  );
}
