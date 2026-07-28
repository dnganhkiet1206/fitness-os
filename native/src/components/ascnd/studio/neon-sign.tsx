import { Defs, LinearGradient, Path, Rect, Stop, Text } from 'react-native-svg';

import { C } from '@/components/ascnd/studio/palette';

/**
 * The wall sign. Stroke plus one wider stroke at low opacity for the halo —
 * no filter and no blur.
 *
 * This is the one box on the wall that keeps an outline, and the one thing on
 * it that emits, so `koa-studio.tsx` draws it *over* the vignette: under it,
 * white text came out at 145 and the sign read as a dark plaque.
 *
 * The panel stays dark; what fills it is the lettering. In the design the
 * interior averages 54 against a panel of about 22, which only works if the
 * type is big and bright — three lines set to the panel's width with the bolt
 * above them. The first pass set 9.5pt type in the bottom third, leaving a
 * void across the middle of the sign.
 *
 * The rows below are the design's, found by taking the brightest pixel on
 * every scanline of its sign: the bolt occupies 137–156, then three bands of
 * 255 at 164–172, 178–185 and 191–198, and the box ends at 209 rather than
 * the 212 measured off a bounding box. So: H 79, bolt Y+7..Y+26, baselines
 * Y+42 / Y+55 / Y+68, cap height 8.
 *
 * ── why the stroke is a gradient ──
 *
 * Round the design's perimeter the light runs 42 · 48 · 57 · 70 from quartile
 * to quartile — dim at the top, pooling low. This sign's ran 74 · 74 · 75 · 75
 * at every single quartile: a ring of identical brightness on all four sides,
 * which is precisely what reads as a drawn frame rather than as a sign that
 * glows. So the stroke takes a vertical gradient, and it comes down to the
 * design's level while it does.
 */
const X = 24;
const Y = 130;
const W = 84;
const H = 79;
const SIZE = 10.2;
const WEIGHT = '600';
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
 * widths, and only their *difference* survives a change of font: measured on
 * device at 9.5/800, WIN is 20.06 and TODAY 33.27, so the midpoint of the
 * pair sits LEAN left of the split.
 *
 * The type has since gone to 10.2/600. Rather than guess, the same two words
 * were measured in the preview at both settings — 21.97/35.77 and
 * 23.56/38.36 — and the device number carried across by the ratio of the two
 * differences, 1.072. The preview's own answer at 9.5/800 is −6.90 against
 * the device's −6.6, close enough that the ratio is worth trusting even
 * though the absolute value is not. Re-measure the same way if the string or
 * the size changes; a wrong LEAN shifts this line against the two below it,
 * which is visible, while a wrong GAP is not.
 */
const GAP = 2.8;
const LEAN = -7.08;
const SPLIT = X + W / 2 + LEAN - GAP / 2;

export function NeonSign() {
  return (
    <>
      <Defs>
        <LinearGradient id="studioNeonEdge" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={C.soft} stopOpacity={0.1} />
          <Stop offset="0.45" stopColor={C.soft} stopOpacity={0.22} />
          <Stop offset="0.72" stopColor={C.soft} stopOpacity={0.4} />
          <Stop offset="1" stopColor={C.soft} stopOpacity={0.24} />
        </LinearGradient>
      </Defs>

      <Rect x={X} y={Y} width={W} height={H} rx={11} fill={C.secondary} opacity={0.55} />
      <Rect x={X} y={Y} width={W} height={H} rx={11} fill="none" stroke={C.soft} strokeWidth={5} opacity={0.05} />
      <Rect x={X} y={Y} width={W} height={H} rx={11} fill="none" stroke="url(#studioNeonEdge)" strokeWidth={1.4} />

      {/* bolt */}
      <Path
        d={`M ${X + 47} ${Y + 7} L ${X + 35} ${Y + 19} L ${X + 42} ${Y + 19}
            L ${X + 38} ${Y + 26} L ${X + 51} ${Y + 14} L ${X + 44} ${Y + 14} Z`}
        fill={C.highlight}
      />

      <Text x={SPLIT} y={Y + 42} fill={C.highlight} fontSize={SIZE} fontWeight={WEIGHT} textAnchor="end">
        WIN
      </Text>
      <Text x={SPLIT + GAP} y={Y + 42} fill={C.white} fontSize={SIZE} fontWeight={WEIGHT} textAnchor="start">
        TODAY
      </Text>
      <Text x={X + W / 2} y={Y + 55} fill={C.white} fontSize={SIZE} fontWeight={WEIGHT} textAnchor="middle">
        STRONGER
      </Text>
      <Text x={X + W / 2} y={Y + 68} fill={C.white} fontSize={SIZE} fontWeight={WEIGHT} textAnchor="middle">
        TOMORROW
      </Text>
    </>
  );
}
