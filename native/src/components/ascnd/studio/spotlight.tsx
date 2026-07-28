import { Defs, Ellipse, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { C, STAGE_MARK } from '@/components/ascnd/studio/palette';

/**
 * The pendant lamp and its cone.
 *
 * The cone is a plain trapezoid with a gradient falling to nothing — no
 * blur, which on SVG would mean a filter and a rasterised pass. Its foot
 * lands on the podium so the character reads as lit rather than pasted on.
 *
 * It is warm at the lamp and cools on the way down, because that is what the
 * design does: red-minus-blue runs +8 at the shade, −15 halfway, −37 at the
 * floor, and luminance halves from 61 to 31 over the same distance. A flat
 * white wedge measured −22 warmth and barely dimmed at all, which is why the
 * room had a grey wedge in it instead of a lamp.
 *
 * Its sides fade too. A gradient can only run one way, so the beam is two
 * passes of the same trapezoid: the light down it, then the wall colour
 * across it — opaque at both edges, clear in the middle. Without that the
 * cone has two hard diagonals that cut across whatever they cross, which is
 * the one thing in the room that looked drawn rather than lit.
 */
const CX = STAGE_MARK.x;
const MOUTH_Y = 66;
const MOUTH_R = 28;
const CONE =
  `M ${CX - MOUTH_R + 3} ${MOUTH_Y} L ${CX + MOUTH_R - 3} ${MOUTH_Y}` +
  ` L ${CX + 158} 476 L ${CX - 158} 476 Z`;

export function Spotlight() {
  return (
    <>
      <Defs>
        <LinearGradient id="studioCone" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={C.highlight} stopOpacity={0.19} />
          <Stop offset="0.28" stopColor={C.highlight} stopOpacity={0.075} />
          <Stop offset="0.66" stopColor={C.white} stopOpacity={0.035} />
          <Stop offset="1" stopColor={C.white} stopOpacity={0} />
        </LinearGradient>
        <LinearGradient id="studioConeEdge" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={C.bgTop} stopOpacity={0.92} />
          <Stop offset="0.22" stopColor={C.bgTop} stopOpacity={0.34} />
          <Stop offset="0.5" stopColor={C.bgTop} stopOpacity={0} />
          <Stop offset="0.78" stopColor={C.bgTop} stopOpacity={0.34} />
          <Stop offset="1" stopColor={C.bgTop} stopOpacity={0.92} />
        </LinearGradient>
      </Defs>

      {/* cord */}
      <Rect x={CX - 1} y={0} width={2} height={42} fill={C.accent} opacity={0.55} />

      {/* the light, drawn before the shade so the shade caps it */}
      <Path d={CONE} fill="url(#studioCone)" />
      <Path d={CONE} fill="url(#studioConeEdge)" />

      {/* shade */}
      <Path
        d={`M ${CX} 40 C ${CX - 17} 40 ${CX - 27} 52 ${CX - MOUTH_R} ${MOUTH_Y}
            L ${CX + MOUTH_R} ${MOUTH_Y} C ${CX + 27} 52 ${CX + 17} 40 ${CX} 40 Z`}
        fill={C.secondary}
      />
      <Ellipse cx={CX} cy={MOUTH_Y} rx={MOUTH_R} ry={4} fill={C.highlight} />
      <Ellipse cx={CX} cy={MOUTH_Y} rx={20} ry={2.4} fill={C.white} opacity={0.55} />
    </>
  );
}
