import { Circle, Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { C, STUDIO_H, STUDIO_W } from '@/components/ascnd/studio/palette';

/**
 * The room itself: one vertical gradient, and a little dust in the light.
 *
 * No texture and no noise — the dust is fourteen circles, which is cheaper
 * than any pattern and reads the same at phone size.
 */

/** x, y, radius, opacity — hand-placed so nothing clusters or lands centre-stage */
const DUST: [number, number, number, number][] = [
  [128, 118, 1.4, 0.06], [252, 96, 1.1, 0.05], [96, 186, 1.0, 0.05],
  [286, 172, 1.3, 0.04], [150, 250, 0.9, 0.06], [238, 232, 1.2, 0.05],
  [64, 292, 1.1, 0.04], [318, 286, 1.0, 0.05], [172, 330, 0.8, 0.05],
  [222, 356, 1.2, 0.04], [110, 386, 1.0, 0.04], [300, 372, 0.9, 0.05],
  [200, 148, 1.0, 0.05], [140, 62, 0.9, 0.04],
];

export function Background() {
  return (
    <>
      <Defs>
        <LinearGradient id="studioBg" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={C.bgTop} />
          <Stop offset="1" stopColor={C.bgBottom} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={STUDIO_W} height={STUDIO_H} fill="url(#studioBg)" />
      {DUST.map(([x, y, r, o], i) => (
        <Circle key={i} cx={x} cy={y} r={r} fill={C.white} opacity={o} />
      ))}
    </>
  );
}
