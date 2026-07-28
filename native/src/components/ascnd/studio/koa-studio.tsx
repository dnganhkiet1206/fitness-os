import Svg, { Ellipse } from 'react-native-svg';

import { Background } from '@/components/ascnd/studio/background';
import { FloorLight, FloorPlane, Vignette } from '@/components/ascnd/studio/floor';
import { NeonSign } from '@/components/ascnd/studio/neon-sign';
import { Motes } from '@/components/ascnd/studio/motes';
import { C, STAGE_MARK, STUDIO_H, STUDIO_SKINS, STUDIO_W } from '@/components/ascnd/studio/palette';
import { Plant } from '@/components/ascnd/studio/plant';
import { Platform, StageGlow } from '@/components/ascnd/studio/platform';
import { Shelf } from '@/components/ascnd/studio/shelf';
import { StageLabel } from '@/components/ascnd/studio/stage-label';
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
  skin = 'default',
  energy = 0.5,
  label,
  live = false,
}: {
  width: number;
  height: number;
  /** days lit on the wall card */
  streak?: number;
  /** a stage unlock from the shop — shifts the wall and the warm colour */
  skin?: string;
  /** 0..1 — how much light the room gives back today */
  energy?: number;
  /**
   * The companion's name, set into the podium's front face rather than shown
   * as the screen's header title — see `stage-label.tsx`.
   */
  label?: string;
  /**
   * True when `StudioLive` is drawing the room's moving parts on its own
   * canvas above this one — see `studio-live.tsx`. The motes and the stage
   * glow are then left out here so they are not drawn twice. The beam stays
   * either way: it is far too large an area to animate.
   *
   * Off by default, so a still of the room, and `preview.mjs`, get the whole
   * scene in one canvas exactly as before.
   */
  live?: boolean;
}) {
  const s = STUDIO_SKINS[skin] ?? STUDIO_SKINS.default;
  return (
    <Svg
      width={width}
      height={height}
      viewBox={`0 0 ${STUDIO_W} ${STUDIO_H}`}
      preserveAspectRatio="xMidYMin slice">
      <Background wall={s.wall} />
      <FloorPlane />

      {/* the room: wall furniture, then what stands on the floor */}
      <StudioWindow />
      <StreakCard days={streak} />
      <Shelf />
      <Plant x={316} y={397} s={1.81} kind="spray" />
      <YogaBall x={352} y={400} r={30} />
      <Ellipse cx={STAGE_MARK.x} cy={STAGE_MARK.y + 6} rx={205} ry={50} fill={C.shadow} opacity={0.036} />

      {/* everything above falls into shadow; everything below is the light,
          and the neon sign is a light — under the vignette its lettering came
          out at 145 and it read as a dark plaque rather than a lit sign */}
      <Vignette />
      <NeonSign />
      {/* the beam never animates — it covers most of the screen, and that
          is what made the phone hot. Only small shapes move; see
          studio-live.tsx */}
      <Spotlight />
      {/* the air, after the vignette that would otherwise paint it out */}
      {live ? null : <Motes />}
      <FloorLight glow={s.glow} energy={energy} />

      <Platform glow={s.glow} energy={energy} />
      {live ? null : <StageGlow glow={s.glow} energy={energy} />}
      {label ? <StageLabel label={label} glow={s.glow} /> : null}
    </Svg>
  );
}
