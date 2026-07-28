import { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { C } from '@/components/ascnd/studio/palette';

/**
 * The window: four panes onto a purple night.
 *
 * The moon is a crescent cut with a single path rather than two overlapping
 * circles, so it works over a gradient sky. The skyline is six rectangles.
 *
 * Kept dim on purpose. Measured across the design's wall the props sit at
 * 47–56 against a wall of 27–49 — barely above what they hang on. A window
 * bright enough to be pretty on its own put this column at 106 and stole the
 * room's focus from the character.
 */
const X = 272;
const Y = 95;
const W = 95;
const H = 117;
const IN = 6;

/** x, width, height — measured up from the sill */
const CITY: [number, number, number][] = [
  [0, 14, 34], [15, 10, 23], [26, 16, 44], [43, 12, 29], [56, 18, 39], [75, 13, 26],
];
/** x, y within the sky box */
const STARS: [number, number, number][] = [
  [58, 16, 1.1], [70, 30, 0.8], [22, 40, 0.9], [78, 52, 1.0], [46, 12, 0.8], [12, 22, 0.7],
];

export function StudioWindow() {
  const sx = X + IN;
  const sy = Y + IN;
  const sw = W - IN * 2;
  const sh = H - IN * 2;
  const sill = sy + sh;
  return (
    <>
      <Defs>
        <LinearGradient id="studioSky" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={C.bgTop} />
          <Stop offset="0.5" stopColor={C.accent} stopOpacity={0.4} />
          {/* the reference warms toward the horizon; the palette's one warm
              colour does it at low strength without becoming a sunset */}
          <Stop offset="0.86" stopColor={C.highlight} stopOpacity={0.2} />
          <Stop offset="1" stopColor={C.highlight} stopOpacity={0.09} />
        </LinearGradient>
      </Defs>

      <Rect x={X} y={Y} width={W} height={H} rx={12} fill={C.secondary} />
      <Rect x={sx} y={sy} width={sw} height={sh} rx={7} fill="url(#studioSky)" />

      {STARS.map(([x, y, r], i) => (
        <Circle key={i} cx={sx + x} cy={sy + y} r={r} fill={C.white} opacity={0.85} />
      ))}

      {/* crescent: the full disc, then a bite taken out of it by the sky.
          Two arcs sharing endpoints — the second bows the other way, which
          is what makes a moon rather than a lens. */}
      <Path
        d={`M ${sx + 30} ${sy + 15} A 11 11 0 1 0 ${sx + 30} ${sy + 37}
            A 13 13 0 0 1 ${sx + 30} ${sy + 15} Z`}
        fill={C.soft}
      />

      {CITY.map(([x, w, h], i) => (
        <Rect key={i} x={sx + x} y={sill - h} width={w} height={h} rx={2} fill={C.primary} />
      ))}
      {/* a few lit windows, so the city is not a dead band */}
      <Rect x={sx + 30} y={sill - 28} width={2.5} height={2.5} fill={C.highlight} opacity={0.7} />
      <Rect x={sx + 36} y={sill - 20} width={2.5} height={2.5} fill={C.highlight} opacity={0.5} />
      <Rect x={sx + 60} y={sill - 24} width={2.5} height={2.5} fill={C.highlight} opacity={0.6} />

      {/* mullions — the four panes */}
      <Rect x={X + W / 2 - 1.5} y={sy} width={3} height={sh} fill={C.secondary} />
      <Rect x={sx} y={Y + H / 2 - 1.5} width={sw} height={3} fill={C.secondary} />
      <Rect x={X} y={Y} width={W} height={H} rx={12} fill="none" stroke={C.accent} strokeWidth={2} opacity={0.4} />
    </>
  );
}
