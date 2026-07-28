import { Path, Rect } from 'react-native-svg';

import { Dumbbell } from '@/components/ascnd/studio/dumbbell';
import { Kettlebell } from '@/components/ascnd/studio/kettlebell';
import { C } from '@/components/ascnd/studio/palette';
import { Shaker } from '@/components/ascnd/studio/shaker';
import { YogaMat } from '@/components/ascnd/studio/yoga-mat';

/**
 * The ladder shelf, and everything Koa owns.
 *
 * The rails are two stroked paths rather than four-point polygons — fewer
 * anchors, and the lean reads better with round caps. Boards narrow toward
 * the top, which is what makes an A-frame look like one without perspective.
 *
 * Order matters: plant and shaker on the top board, the heavy things low.
 */
const TOP = 250;
const BOTTOM = 392;

/** y of each board, and its half-width — the taper */
const BOARDS: [number, number][] = [
  [TOP, 44],
  [TOP + 50, 52],
  [TOP + 100, 60],
];

export function Shelf() {
  return (
    <>
      <Path d={`M 12 ${BOTTOM} L 26 ${TOP}`} stroke={C.secondary} strokeWidth={6} strokeLinecap="round" fill="none" />
      <Path d={`M 132 ${BOTTOM} L 118 ${TOP}`} stroke={C.secondary} strokeWidth={6} strokeLinecap="round" fill="none" />

      {BOARDS.map(([y, hw], i) => (
        <Rect key={i} x={72 - hw} y={y} width={hw * 2} height={6} rx={3} fill={C.secondary} />
      ))}

      {/* top board — the shaker; the plant beside it is drawn by
          `plants.tsx`, because it sways and so needs its own canvas */}
      <Shaker x={84} y={BOARDS[0][0]} s={0.72} />

      {/* middle — the pair it lifts most */}
      <Dumbbell x={46} y={BOARDS[1][0] - 9} s={1} />
      <Dumbbell x={98} y={BOARDS[1][0] - 9} s={1} />

      {/* bottom — heavy, and the mat */}
      <Kettlebell x={40} y={BOARDS[2][0]} s={1.1} />
      <YogaMat x={100} y={BOARDS[2][0]} s={1.1} />
    </>
  );
}
