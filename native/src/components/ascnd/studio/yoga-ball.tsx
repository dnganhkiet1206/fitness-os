import { Circle, Defs, G, Path, RadialGradient, Stop } from 'react-native-svg';

import { C } from '@/components/ascnd/studio/palette';

/**
 * Exercise ball. (x, y) is where it touches the floor.
 *
 * Volume comes from four thin seams and a shading pass that falls away from
 * the lamp. The seams are spaced by a sine so they crowd toward the poles,
 * which is what makes a sphere out of a circle; the shading is a radial
 * stop rather than a half-disc, because a hard-edged flank drew a seam down
 * the middle of the ball that is not in the design.
 *
 * The shading is black, not `primary`. The design's ball measures hue 255 at
 * 62% saturation and 24% lightness — a deep, saturated violet. Shaded with
 * `primary` this came out at 249 · 33 · 31: the right hue, half the colour.
 * `accent` carries 100% saturation and 69% lightness, so what it needs is to
 * be made darker, and mixing it with any other colour in the palette averages
 * the two saturations instead. Black scales the channels and leaves
 * (max−min)/(max+min) where it was.
 */
const SEAMS = [-0.62, -0.24, 0.16, 0.54];

export function YogaBall({ x, y, r = 30 }: { x: number; y: number; r?: number }) {
  return (
    <G transform={`translate(${x} ${y - r})`}>
      <Defs>
        <RadialGradient id="studioBall" cx="34%" cy="30%" r="82%">
          <Stop offset="0" stopColor={C.shadow} stopOpacity={0.22} />
          <Stop offset="1" stopColor={C.shadow} stopOpacity={0.7} />
        </RadialGradient>
      </Defs>
      <Circle cx={0} cy={0} r={r} fill={C.accent} />
      <Circle cx={0} cy={0} r={r} fill="url(#studioBall)" />
      {SEAMS.map((f, i) => {
        const cy = f * r;
        const half = Math.sqrt(Math.max(0, 1 - f * f)) * r;
        return (
          <Path
            key={i}
            d={`M ${-half} ${cy} A ${half} ${half * 0.34} 0 0 0 ${half} ${cy}`}
            fill="none"
            stroke={C.soft}
            strokeWidth={0.9}
            opacity={0.32}
          />
        );
      })}
      {/* `soft`, not white: the design's ball runs 53% saturation from its
          shadow through to its highlight, and a white catchlight is the one
          thing on it that would break that */}
      <Circle cx={-r * 0.36} cy={-r * 0.4} r={r * 0.2} fill={C.soft} opacity={0.22} />
    </G>
  );
}
