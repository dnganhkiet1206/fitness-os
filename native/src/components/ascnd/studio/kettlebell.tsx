import { Circle, G, Path } from 'react-native-svg';

import { C } from '@/components/ascnd/studio/palette';

/** Kettlebell. (x, y) is the centre of its base. */
export function Kettlebell({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <G transform={`translate(${x} ${y}) scale(${s})`}>
      <Path d="M-7 -20 C -7 -30 7 -30 7 -20" fill="none" stroke={C.accent} strokeWidth={4} strokeLinecap="round" />
      <Circle cx={0} cy={-11} r={11} fill={C.accent} opacity={0.62} />
      <Circle cx={-3.5} cy={-14} r={3.4} fill={C.soft} opacity={0.75} />
    </G>
  );
}
