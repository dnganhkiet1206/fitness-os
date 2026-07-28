import { Ellipse, G, Rect } from 'react-native-svg';

import { C } from '@/components/ascnd/studio/palette';

/** A rolled mat lying on its side. (x, y) is the centre of its base. */
export function YogaMat({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <G transform={`translate(${x} ${y}) scale(${s})`}>
      <Rect x={-16} y={-16} width={32} height={16} rx={8} fill={C.accent} opacity={0.62} />
      <Ellipse cx={-16} cy={-8} rx={4} ry={8} fill={C.soft} opacity={0.55} />
      <Ellipse cx={-16} cy={-8} rx={1.6} ry={3.2} fill={C.primary} opacity={0.6} />
    </G>
  );
}
