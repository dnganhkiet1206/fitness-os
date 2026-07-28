import { Path, Rect } from 'react-native-svg';

import { Dumbbell } from '@/components/ascnd/studio/dumbbell';
import { Kettlebell } from '@/components/ascnd/studio/kettlebell';
import { C } from '@/components/ascnd/studio/palette';
import { Plant } from '@/components/ascnd/studio/plant';
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
const TOP = 268;
const BOTTOM = 396;

/** y of each board, and its half-width — the taper */
const BOARDS: [number, number][] = [
  [TOP, 38],
  [TOP + 50, 45],
  [TOP + 100, 52],
];

export function Shelf() {
  return (
    <>
      <Path d={`M 24 ${BOTTOM} L 36 ${TOP}`} stroke={C.secondary} strokeWidth={6} strokeLinecap="round" fill="none" />
      <Path d={`M 120 ${BOTTOM} L 108 ${TOP}`} stroke={C.secondary} strokeWidth={6} strokeLinecap="round" fill="none" />

      {BOARDS.map(([y, hw], i) => (
        <Rect key={i} x={72 - hw} y={y} width={hw * 2} height={6} rx={3} fill={C.secondary} />
      ))}

      {/* top board — the things Koa looks after */}
      <Plant x={52} y={BOARDS[0][0]} s={0.62} />
      <Shaker x={90} y={BOARDS[0][0]} s={0.72} />

      {/* middle — the pair it lifts most */}
      <Dumbbell x={50} y={BOARDS[1][0] - 9} s={0.9} />
      <Dumbbell x={94} y={BOARDS[1][0] - 9} s={0.9} />

      {/* bottom — heavy, and the mat */}
      <Kettlebell x={44} y={BOARDS[2][0]} s={0.95} />
      <YogaMat x={95} y={BOARDS[2][0]} s={0.95} />
    </>
  );
}
