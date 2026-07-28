import { Path, Rect, Text, TSpan } from 'react-native-svg';

import { C } from '@/components/ascnd/studio/palette';

/**
 * The wall sign. Stroke plus one wider stroke at low opacity for the halo —
 * no filter, no blur, and deliberately dim: it is a sign on a wall, not a
 * light source competing with the lamp.
 */
const X = 24;
const Y = 130;
const W = 84;
const H = 82;
/** the space between WIN and TODAY, in artboard units — see the note below */
const GAP = 2.6;

export function NeonSign() {
  return (
    <>
      <Rect x={X} y={Y} width={W} height={H} rx={11} fill={C.primary} opacity={0.55} />
      <Rect x={X} y={Y} width={W} height={H} rx={11} fill="none" stroke={C.soft} strokeWidth={5} opacity={0.1} />
      <Rect x={X} y={Y} width={W} height={H} rx={11} fill="none" stroke={C.soft} strokeWidth={1.4} opacity={0.75} />

      {/* bolt */}
      <Path
        d={`M ${X + 50} ${Y + 12} L ${X + 40} ${Y + 28} L ${X + 47} ${Y + 28}
            L ${X + 44} ${Y + 40} L ${X + 55} ${Y + 23} L ${X + 48} ${Y + 23} Z`}
        fill={C.highlight}
      />

      {/* The gap between the two colours is geometry, not a character.
          RNSVGTSpan measures each span with CTLineGetBoundsWithOptions, and
          CoreText leaves trailing whitespace out of a line's width \u2014 so a
          trailing " " measures as nothing and TODAY starts flush against
          WIN. U+00A0 does not help: NSCharacterSet whitespaceCharacterSet
          is Unicode Zs, which contains it. Both were tried on device; the
          sign read WINTODAY both times while the browser preview showed the
          gap. `dx` is the only version that does not go through text
          measurement.

          The anchor needs the same correction: that advance is the sum of
          the spans' measured widths and does not count `dx`, so a centred
          line would sit half a gap left of centre. */}
      <Text x={X + W / 2 - GAP / 2} y={Y + 54} fontSize={9.5} fontWeight="800" textAnchor="middle">
        <TSpan fill={C.highlight}>WIN</TSpan>
        <TSpan fill={C.white} dx={GAP}>
          TODAY
        </TSpan>
      </Text>
      <Text x={X + W / 2} y={Y + 66} fill={C.white} fontSize={9.5} fontWeight="800" textAnchor="middle">
        STRONGER
      </Text>
      <Text x={X + W / 2} y={Y + 78} fill={C.white} fontSize={9.5} fontWeight="800" textAnchor="middle">
        TOMORROW
      </Text>
    </>
  );
}
