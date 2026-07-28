import { G, Rect } from 'react-native-svg';

import { C } from '@/components/ascnd/studio/palette';

/** Dumbbell, seen from the side. (x, y) is the centre of the bar. */
export function Dumbbell({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <G transform={`translate(${x} ${y}) scale(${s})`}>
      <Rect x={-9} y={-2.5} width={18} height={5} rx={2.5} fill={C.soft} opacity={0.4} />
      <Rect x={-17} y={-8} width={8} height={16} rx={3} fill={C.accent} opacity={0.62} />
      <Rect x={9} y={-8} width={8} height={16} rx={3} fill={C.accent} opacity={0.62} />
      <Rect x={-21} y={-6} width={5} height={12} rx={2.5} fill={C.soft} opacity={0.5} />
      <Rect x={16} y={-6} width={5} height={12} rx={2.5} fill={C.soft} opacity={0.5} />
    </G>
  );
}
