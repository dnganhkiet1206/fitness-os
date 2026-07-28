import { G, Path, Rect } from 'react-native-svg';

import { C } from '@/components/ascnd/studio/palette';

/** Protein shaker. (x, y) is the centre of its base. */
export function Shaker({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <G transform={`translate(${x} ${y}) scale(${s})`}>
      <Rect x={-11} y={-34} width={22} height={34} rx={5} fill={C.primary} />
      <Rect x={-11} y={-22} width={22} height={10} fill={C.accent} opacity={0.5} />
      <Rect x={-9} y={-42} width={18} height={9} rx={3} fill={C.highlight} />
      <Rect x={-4} y={-46} width={8} height={5} rx={2} fill={C.highlight} opacity={0.8} />
      <Path d="M2 -30 L -4 -21 L 0 -21 L -2 -14 L 5 -23 L 1 -23 Z" fill={C.highlight} />
      <Rect x={-11} y={-34} width={3} height={34} rx={1.5} fill={C.white} opacity={0.08} />
    </G>
  );
}
