import { Path, Rect, Text } from 'react-native-svg';

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
/**
 * WIN and TODAY are two independent <Text> elements, not one <Text> split
 * into TSpans, because on device nothing put a gap between two spans.
 *
 * A trailing " " measured as nothing: RNSVGTSpan sizes each span with
 * CTLineGetBoundsWithOptions and CoreText leaves trailing whitespace out of
 * a line's width. U+00A0 was no escape either — whitespaceCharacterSet is
 * Unicode Zs, which contains it. `dx` should have worked (the Fabric props
 * map it, and the glyph context accumulates it) and still did not on the
 * device. Three tries, so the sign now uses only what is demonstrably
 * working on that screen: a <Text> with an `x` and a `textAnchor`, exactly
 * what STRONGER and TOMORROW below are.
 *
 * SPLIT is the right edge of WIN. Centring the pair by hand needs the two
 * widths, and only their *difference* survives a change of font: measured
 * at 9.5/800, WIN is 20.06 and TODAY 33.27, so the midpoint of the pair
 * sits LEAN left of the split. Re-measure both if the string or the size
 * changes; a wrong LEAN shifts this line against the two below it, which is
 * visible, while a wrong GAP is not.
 */
const GAP = 2.6;
const LEAN = -6.6;
const SPLIT = X + W / 2 + LEAN - GAP / 2;

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

      <Text
        x={SPLIT}
        y={Y + 54}
        fill={C.highlight}
        fontSize={9.5}
        fontWeight="800"
        textAnchor="end">
        WIN
      </Text>
      <Text
        x={SPLIT + GAP}
        y={Y + 54}
        fill={C.white}
        fontSize={9.5}
        fontWeight="800"
        textAnchor="start">
        TODAY
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
