import { Circle, G, Path } from 'react-native-svg';

import { C } from '@/components/ascnd/studio/palette';

/** Exercise ball. (x, y) is where it touches the floor. */
export function YogaBall({ x, y, r = 30 }: { x: number; y: number; r?: number }) {
  return (
    <G transform={`translate(${x} ${y - r})`}>
      <Circle cx={0} cy={0} r={r} fill={C.accent} />
      {/* two seams and one highlight give it volume without a gradient */}
      <Path
        d={`M ${-r * 0.72} ${-r * 0.4} A ${r} ${r * 0.42} 0 0 0 ${r * 0.72} ${-r * 0.4}`}
        fill="none"
        stroke={C.soft}
        strokeWidth={1.6}
        opacity={0.5}
      />
      <Path
        d={`M ${-r * 0.8} ${r * 0.22} A ${r} ${r * 0.5} 0 0 0 ${r * 0.8} ${r * 0.22}`}
        fill="none"
        stroke={C.soft}
        strokeWidth={1.6}
        opacity={0.35}
      />
      <Circle cx={-r * 0.34} cy={-r * 0.38} r={r * 0.22} fill={C.white} opacity={0.1} />
    </G>
  );
}
