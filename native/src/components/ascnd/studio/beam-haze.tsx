import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';

import { C, SCENE_BOTTOM, STAGE_MARK, STUDIO_W } from '@/components/ascnd/studio/palette';

/**
 * The air in front of the character.
 *
 * Everything else the lamp does lands *on* Koa — the ramp, the hot spot, the
 * rim. All of it is still behind the figure in the stacking order, so the beam
 * passes behind at full strength on both sides and the figure sits in front of
 * it as a cut-out. Two layers, which is exactly what it looked like.
 *
 * What ties them is light between the viewer and the character: standing in a
 * beam, some of the lit air is in front of you. So this is one soft ellipse
 * drawn *after* the buddy, warm, peaking at a few percent, tall rather than
 * round so it reads as the beam wrapping the figure and not as a halo round
 * it.
 *
 * It has to fade to nothing well inside its own bounds. A slab of the cone
 * would be truer — but the cone is wider than the character at every height it
 * covers, so a slab of it is a flat wash, and a flat wash over a transparent
 * canvas is a visible rectangle laid across the room. A falloff has no edges
 * to show.
 *
 * Static: it draws once and never again, which is what the room's rule about
 * covered area is really about.
 */
const CX = STAGE_MARK.x;
/** the character's box is 160 tall with its feet on the mark */
const CY = STAGE_MARK.y - 92;
const RX = 96;
const RY = 132;

export function BeamHaze({ width, height }: { width: number; height: number }) {
  return (
    <Svg
      width={width}
      height={height}
      viewBox={`0 0 ${STUDIO_W} ${SCENE_BOTTOM}`}
      preserveAspectRatio="xMidYMin slice"
      pointerEvents="none">
      <Defs>
        <RadialGradient id="studioHaze" cx="50%" cy="38%" r="60%">
          <Stop offset="0" stopColor={C.highlight} stopOpacity={0.078} />
          <Stop offset="0.45" stopColor={C.highlight} stopOpacity={0.046} />
          <Stop offset="0.78" stopColor={C.white} stopOpacity={0.016} />
          <Stop offset="1" stopColor={C.white} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Ellipse cx={CX} cy={CY} rx={RX} ry={RY} fill="url(#studioHaze)" />
    </Svg>
  );
}
