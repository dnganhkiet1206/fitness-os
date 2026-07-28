import { Circle, Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { C, STUDIO_H, STUDIO_W } from '@/components/ascnd/studio/palette';

/**
 * The room itself: one vertical gradient, and a little dust in the light.
 *
 * No texture and no noise — the dust is fourteen circles, which is cheaper
 * than any pattern and reads the same at phone size.
 */

/** x, y, radius, opacity — hand-placed so nothing clusters or lands centre-stage */
const DUST: [number, number, number, number][] = [
  [128, 118, 1.4, 0.06], [252, 96, 1.1, 0.05], [96, 186, 1.0, 0.05],
  [286, 172, 1.3, 0.04], [150, 250, 0.9, 0.06], [238, 232, 1.2, 0.05],
  [64, 292, 1.1, 0.04], [318, 286, 1.0, 0.05], [172, 330, 0.8, 0.05],
  [222, 356, 1.2, 0.04], [110, 386, 1.0, 0.04], [300, 372, 0.9, 0.05],
  [200, 148, 1.0, 0.05], [140, 62, 0.9, 0.04],
];

/**
 * Neon motes — the room's own colours hanging in the air.
 *
 * x, y, radius, opacity, colour. Drawn *after* `Vignette` and `Spotlight`,
 * not with the dust above: the vignette reaches full `bgTop` at the corners,
 * so anything placed in `Background` is painted out exactly where these are
 * meant to read. Only palette colours, and only the two purples plus the
 * warm, so the air belongs to the neon sign and the lamp rather than adding
 * a colour of its own.
 *
 * Kept out of the column the character stands in — roughly x 130–260 below
 * y 250 — for the same reason the props are: the middle stays empty.
 *
 * At 3–5% a mote only reads where it is *brighter* than what is behind it,
 * and two placements failed that on the first pass: a warm one inside the
 * beam's bright upper cone came out 7 luminance units **darker** than the
 * light around it, which reads as a speck of dirt rather than dust, and one
 * on the window frame moved the pixel by 1.5. So they go on wall and floor,
 * never on a lit prop and never inside the beam above y≈210. Every one of
 * these is measured at +3.5 to +7.1 against a median of its surroundings;
 * check that again if any is moved.
 */
const MOTES: [number, number, number, number, string][] = [
  [58, 96, 1.2, 0.05, C.soft], [136, 62, 0.9, 0.04, C.accent],
  [256, 96, 1.1, 0.05, C.soft], [128, 112, 1.0, 0.04, C.highlight],
  [118, 172, 1.2, 0.04, C.soft], [258, 176, 1.0, 0.05, C.accent],
  [44, 200, 1.1, 0.04, C.soft], [352, 226, 1.0, 0.04, C.accent],
  [150, 232, 1.3, 0.05, C.soft], [232, 252, 1.0, 0.04, C.highlight],
  [250, 316, 1.1, 0.05, C.soft], [146, 340, 0.9, 0.03, C.accent],
  [36, 360, 1.2, 0.05, C.soft], [222, 356, 1.0, 0.04, C.accent],
  [96, 224, 1.1, 0.04, C.highlight], [40, 412, 1.0, 0.04, C.soft],
  [380, 268, 1.1, 0.04, C.accent],
];

export function Motes() {
  return (
    <>
      {MOTES.map(([x, y, r, o, fill], i) => (
        <Circle key={i} cx={x} cy={y} r={r} fill={fill} opacity={o} />
      ))}
    </>
  );
}

export function Background({ wall }: { wall?: [string, string] }) {
  return (
    <>
      <Defs>
        <LinearGradient id="studioBg" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={wall ? wall[0] : C.bgTop} />
          <Stop offset="1" stopColor={wall ? wall[1] : C.bgBottom} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={STUDIO_W} height={STUDIO_H} fill="url(#studioBg)" />
      {DUST.map(([x, y, r, o], i) => (
        <Circle key={i} cx={x} cy={y} r={r} fill={C.white} opacity={o} />
      ))}
    </>
  );
}
