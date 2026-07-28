import Svg, { Ellipse } from 'react-native-svg';

import { Background } from '@/components/ascnd/studio/background';
import { Floor } from '@/components/ascnd/studio/floor';
import { NeonSign } from '@/components/ascnd/studio/neon-sign';
import { C, STAGE_MARK, STUDIO_H, STUDIO_W } from '@/components/ascnd/studio/palette';
import { Plant } from '@/components/ascnd/studio/plant';
import { Platform } from '@/components/ascnd/studio/platform';
import { Shelf } from '@/components/ascnd/studio/shelf';
import { Spotlight } from '@/components/ascnd/studio/spotlight';
import { StreakCard } from '@/components/ascnd/studio/streak-card';
import { StudioWindow } from '@/components/ascnd/studio/window';
import { YogaBall } from '@/components/ascnd/studio/yoga-ball';

/**
 * Koa Studio — the room, and nothing else.
 *
 * The character is not drawn here. The middle of the artboard is left empty
 * on purpose: everything sits left, right or behind, and `STAGE_MARK` is
 * where the figure's feet go, so the scene and the character are placed from
 * the same number instead of being nudged into agreement.
 *
 * Drawn back to front — wall furniture, then the light, then the floor, then
 * the podium — so overlap does the depth work. There is no perspective
 * transform anywhere in here, and no bitmap, texture, blur or filter: the
 * whole room is gradients and a few hundred anchor points.
 *
 * Everything in it is something the app already talks about: the streak, the
 * plant that grows with habit, the equipment. Nothing is here only to fill
 * space.
 */
export function KoaStudio({
  width,
  height,
  streak,
}: {
  width: number;
  height: number;
  /** days lit on the wall card */
  streak?: number;
}) {
  return (
    <Svg
      width={width}
      height={height}
      viewBox={`0 0 ${STUDIO_W} ${STUDIO_H}`}
      preserveAspectRatio="xMidYMin slice">
      <Background />

      {/* wall */}
      <NeonSign />
      <StudioWindow />
      <StreakCard days={streak} />

      {/* the lamp lights the room before anything stands in it */}
      <Spotlight />

      {/* the ground, and the light on it */}
      <Floor />
      <Ellipse cx={STAGE_MARK.x} cy={STAGE_MARK.y + 6} rx={215} ry={62} fill={C.shadow} opacity={0.2} />

      <Shelf />
      <Plant x={316} y={397} s={1.81} kind="spray" />
      <YogaBall x={352} y={400} r={30} />

      <Platform />
    </Svg>
  );
}
