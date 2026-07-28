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
        {/* Two things had to be true at once here, and they were found in
            that order.

            **Strength.** The beam used to read as several colours stacked
            up, and the cause was not the stops. A warm at low alpha over a
            blue-purple wall does not look like a faint warm — it sweeps
            blue → purple → magenta as the alpha climbs, because the warm's
            blue channel (77) sits barely above the wall's while its red runs
            away. The old cone never got strong enough to leave that sweep:
            hue down the middle went 312 · 270 · 261 at y 110/140/170, so the
            bright half of the beam was magenta and purple with no part of it
            reading gold. It reads 25 · 32 · 24 there now.

            **And a tail that ends.** Below about y290 the design's beam has
            no colour left to give — down its middle the saturation climbs
            34 · 43 · 47 · 50 while the hue settles on the wall's own 234, so
            what looks like a beam low down is the vignette leaving the
            centre alone, not light. Carrying gold to the foot held the
            luminance and took the room's middle to 13% saturation against
            the design's 47, so the gradient is cut at 0.58.

            Measured down the middle at y 110/170/250/320 against the design
            column in the README: luminance 57.8 · 40.9 · 24.6 · 25 against
            61 · 49 · 36 · 31, warmth +18 at the shade against +8.1 and −34
            halfway against −14.9. The tail cut is what pulls the lower two
            below the design and the warmth apart from it; that was the
            deliberate trade for the saturation. Re-measure before changing a
            stop — the profile is what the room is, more than its coordinates
            are. */}
        <LinearGradient id="studioCone" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={C.highlight} stopOpacity={0.25} />
          <Stop offset="0.1" stopColor={C.highlight} stopOpacity={0.26} />
          <Stop offset="0.18" stopColor={C.highlight} stopOpacity={0.19} />
          <Stop offset="0.28" stopColor={C.highlight} stopOpacity={0.095} />
          <Stop offset="0.38" stopColor={C.highlight} stopOpacity={0.03} />
          <Stop offset="0.5" stopColor={C.highlight} stopOpacity={0} />
          <Stop offset="1" stopColor={C.highlight} stopOpacity={0} />
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
