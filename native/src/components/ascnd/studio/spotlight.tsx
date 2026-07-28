import { Defs, Ellipse, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { C, STAGE_MARK } from '@/components/ascnd/studio/palette';

/**
 * The pendant lamp and its cone.
 *
 * No blur anywhere — on SVG that means a filter and a rasterised pass, which
 * the brief rules out. The beam's foot lands on the podium so the character
 * reads as lit rather than pasted on.
 *
 * It is warm at the lamp and cools on the way down, because that is what the
 * design does: red-minus-blue runs +8 at the shade, −15 halfway, −37 at the
 * floor, and luminance halves from 61 to 31 over the same distance. A flat
 * white wedge measured −22 warmth and barely dimmed at all, which is why the
 * room had a grey wedge in it instead of a lamp.
 *
 * ── the soft edges ──
 *
 * The sides are the hard part. A gradient runs one way, so a single
 * trapezoid keeps the geometry of its edges however the light fades down it.
 * Painting the wall colour *across* the shape does soften the foot — but the
 * fade it gives is a fixed width, and the beam is 50pt wide at the lamp and
 * 316 at the floor. Up by the shade the whole cone sat inside that gradient's
 * clear middle, so it still had two sharp diagonals exactly where the light
 * is brightest.
 *
 * So the beam is a stack: `LAYERS` trapezoids sharing an apex, each a little
 * wider than the last, each carrying the same light at a fraction of the
 * strength. Where they all overlap the beam is full; past the narrowest the
 * light steps down once per layer. The fade is then a proportion of the
 * beam's own width at every height, which is the thing one gradient cannot
 * do — and it is still only paths and a gradient.
 *
 * The widths are packed toward the outside (`^0.4`) so the core stays flat
 * and only the outer third ramps, which is the profile the design has.
 */
const CX = STAGE_MARK.x;
const MOUTH_Y = 66;
const MOUTH_R = 28;
const FOOT_Y = 476;
const FOOT_R = 158;
const LAYERS = 9;

/** widest first, so the narrow bright core lands on top */
const CONES = Array.from({ length: LAYERS }, (_, i) => {
  const f = Math.pow((LAYERS - i) / LAYERS, 0.4);
  const top = (MOUTH_R - 3) * (0.34 + 0.66 * f);
  const foot = FOOT_R * f;
  return `M ${CX - top} ${MOUTH_Y} L ${CX + top} ${MOUTH_Y} L ${CX + foot} ${FOOT_Y} L ${CX - foot} ${FOOT_Y} Z`;
});

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
      </Defs>

      {/* cord */}
      <Rect x={CX - 1} y={0} width={2} height={42} fill={C.accent} opacity={0.55} />

      {/* the light, drawn before the shade so the shade caps it */}
      {CONES.map((d, i) => (
        <Path key={i} d={d} fill="url(#studioCone)" opacity={1 / LAYERS} />
      ))}

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
