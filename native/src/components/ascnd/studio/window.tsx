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
 *
 * **No outline.** The design's window has no frame stroke at all: across it
 * the glass runs a flat 24–27 and the only bright pixels are the lit windows
 * in the skyline, scattered singles at 77–100. A perimeter scan of the design
 * reports a maximum of 106 on the bottom edge, which looks like a lit sill
 * and is not one — it is a single city window that happens to sit on the
 * line. Reading it as a sill and building one put a gold bar under the glass;
 * reading it as a frame and building that put a purple ring of 57 round all
 * four sides. Both are the same mistake, and three boxes each ringed in light
 * is what made this wall look cluttered.
 *
 * So the light in this window is where the design puts it: eleven windows
 * alight in the city, at full strength.
 */
const X = 272;
const Y = 95;
const W = 95;
const H = 117;
const IN = 6;

/**
 * x, width, height — measured up from the sill.
 *
 * Low and sparse, which took three tries to see. Counting what fraction of
 * each row in the design's glass is in shadow gives 4% · 5% · 16% · 22% · 48%
 * · 76% at y169 · 178 · 181 · 190 · 196 · 205: the skyline only takes the
 * width in the last ten points before the sill, and above that it is a couple
 * of mid blocks and one thin tower. This was six chunky towers covering 78–85%
 * from y190 up, and they walled off the sky — the design's glass climbs
 * 33 · 42 · 54 · 65 in light and −49 · −31 · −4 · +23 in warmth over exactly
 * the band the towers were standing in, so none of it showed.
 *
 * Measure this with a row median, not with the brightest samples. The lit
 * windows are 80–100 against a sky of 30–60, so a brightest-decile probe just
 * finds the windows and reports a glowing horizon whether or not there is one.
 */
const CITY: [number, number, number][] = [
  // the roofline: 5pt high, and what takes the width at the sill
  [15, 4, 5], [42, 5, 5], [60, 9, 5], [76, 6, 5],
  // the blocks standing out of it — 49% · 22% · 16% · 4% of the width at 7 ·
  // 16 · 25 · 37pt up, which is the design's profile. Few and wide, not many
  // and thin: seven narrow towers hit the same percentages and still looked
  // wrong, because a row's shadow fraction says nothing about whether it is
  // one silhouette or a row of sticks.
  [2, 12, 10], [19, 9, 27], [36, 4, 42], [48, 11, 9], [70, 5, 18],
];
/**
 * x, y within the sky box.
 *
 * **Keep them off the glazing bars.** The bars run x 318–321 and y 152–155 in
 * artboard units; a star at 52 down sat on the horizontal one, and because the
 * live copies are drawn in the overlay — above everything — it did not go
 * behind the bar, it sat on top of it.
 */
const STARS: [number, number, number][] = [
  [58, 16, 1.1], [70, 30, 0.8], [22, 40, 0.9], [78, 44, 1.0], [46, 12, 0.8], [12, 22, 0.7],
];

const SX = X + IN;
const SY = Y + IN;
const SW = W - IN * 2;
const SH = H - IN * 2;

/**
 * The same stars in artboard coordinates, so `sky-live.tsx` can draw the
 * twinkling copies without restating where they are. The window omits its own
 * when the overlay is drawing them.
 */
export const STAR_POINTS: [number, number, number][] = STARS.map(([x, y, r]) => [SX + x, SY + y, r]);

/** the glass, for anything the overlay needs to clip to it */
export const GLASS = { x: SX, y: SY, w: SW, h: SH, r: 7 };

/**
 * The glazing bars, so the overlay can draw them over its own stars and its
 * shooting star. Anything drawn on the overlay is above the whole room, so
 * without these the sky would be in front of the window rather than behind
 * it. x, y, width, height.
 */
export const MULLIONS: [number, number, number, number][] = [
  [X + W / 2 - 1.5, SY, 3, SH],
  [SX, Y + H / 2 - 1.5, SW, 3],
];

/** one synodic month, in days */
const SYNODIC = 29.530588853;
/** a known new moon: 2000-01-06 18:14 UTC */
const NEW_MOON = Date.UTC(2000, 0, 6, 18, 14) / 86400000;

/**
 * Where the moon is in its cycle, 0..1 — 0 new, 0.25 first quarter, 0.5 full.
 *
 * Arithmetic against a known new moon rather than an API: it is accurate to
 * within a few hours over decades, which is far past what a 22-unit moon in a
 * window can show, and it needs no network, no key and no permission.
 */
export function moonPhase(at: Date = new Date()): number {
  const days = at.getTime() / 86400000 - NEW_MOON;
  return ((days % SYNODIC) + SYNODIC) % SYNODIC / SYNODIC;
}

/**
 * The lit part of the moon, as one path.
 *
 * Two arcs sharing their endpoints, which is what makes a moon rather than a
 * lens: the limb is a half circle and the terminator is a half *ellipse*
 * whose width is `r · |cos(2π·phase)|`. That is the projection of the day/
 * night line seen from here, so the shape is right at every phase rather than
 * only at the quarters — it narrows to nothing at new moon and swells to the
 * full disc at full.
 *
 * Which side is lit flips at full moon, and the terminator bows the other way
 * once the moon is past a quarter, which is the `sweep` pair below.
 */
export function moonPath(cx: number, cy: number, r: number, phase: number): string {
  const k = Math.cos(2 * Math.PI * phase);
  const rx = Math.max(0.01, r * Math.abs(k));
  const waxing = phase < 0.5;
  const limb = waxing ? 1 : 0;
  // The terminator hugs the *lit* limb while the moon is a crescent and bows
  // past centre once it is gibbous, so it takes the opposite sweep to the limb
  // before a quarter and the same one after. Getting this pair the wrong way
  // round inverts the whole cycle — new draws as full and full draws as
  // nothing — and it looks plausible enough in code to survive review.
  const term = k >= 0 ? 1 - limb : limb;
  return (
    `M ${cx} ${cy - r} A ${r} ${r} 0 0 ${limb} ${cx} ${cy + r} ` +
    `A ${rx} ${r} 0 0 ${term} ${cx} ${cy - r} Z`
  );
}
/** x, and height above the sill — the windows that are still on */
const LIT: [number, number][] = [
  [5, 6], [9, 6], [21, 23], [21, 15], [25, 8], [37, 37], [37, 29],
  [37, 21], [37, 13], [51, 5], [56, 5], [71, 14], [71, 6],
];

export function StudioWindow({
  moonPhase: phase = 0.18,
  live = false,
}: {
  /** 0..1 through the lunar cycle; the default is a young crescent */
  moonPhase?: number;
  /** true when `sky-live.tsx` is drawing the stars, so they are not doubled */
  live?: boolean;
} = {}) {
  const sx = SX;
  const sy = SY;
  const sw = SW;
  const sh = SH;
  const sill = sy + sh;
  return (
    <>
      <Defs>
        <LinearGradient id="studioSky" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={C.bgTop} />
          {/* Down the design's glass the row medians run 33 · 39 · 54 · 65 in
              light and −53 · −37 · −4 · +23 in warmth: cold and flat for two
              thirds, then a steady climb into a warm horizon, crossing neutral
              at about 0.85. Two stops could not hold both ends — the cold top
              and the warm foot pulled against each other and met in the middle
              at −25 · +4, which is a sky that is neither. */}
          <Stop offset="0.45" stopColor={C.accent} stopOpacity={0.28} />
          <Stop offset="0.66" stopColor={C.accent} stopOpacity={0.25} />
          <Stop offset="0.82" stopColor={C.highlight} stopOpacity={0.13} />
          <Stop offset="0.92" stopColor={C.highlight} stopOpacity={0.32} />
          {/* the design's horizon is pink and this palette's one warm colour
              is gold, so the last stop stays under it — full strength, behind
              a skyline that tiled the width, lit only the slivers between the
              towers and they read as gold bars standing on the sill */}
          <Stop offset="1" stopColor={C.highlight} stopOpacity={0.42} />
        </LinearGradient>
      </Defs>

      {/* frame and mullions are `primary`, the darkest solid: down the
          design's centre bar the light reads 19 against a sky of 25–27, so
          the bars are cut *out* of the glass. Built in `secondary` they came
          out at 43 against a sky of 30 — a lit cross over a dark hole, which
          is the same bright-frame mistake as the outline was. */}
      <Rect x={X} y={Y} width={W} height={H} rx={12} fill={C.primary} />
      <Rect x={sx} y={sy} width={sw} height={sh} rx={7} fill="url(#studioSky)" />

      {live
        ? null
        : STARS.map(([x, y, r], i) => (
            <Circle key={i} cx={sx + x} cy={sy + y} r={r} fill={C.white} opacity={0.85} />
          ))}

      {/* The moon, at whatever phase the date puts it — see `moonPath`.
          The faint disc under it is the unlit half. Without it the moon
          disappears outright for the days around new, which is true of the
          sky and wrong for a window that is one of three things on this wall;
          it also happens to be what earthshine looks like. */}
      <Circle cx={sx + 30} cy={sy + 26} r={11} fill={C.soft} opacity={0.1} />
      <Path d={moonPath(sx + 30, sy + 26, 11, phase)} fill={C.soft} />

      {CITY.map(([x, w, h], i) => (
        <Rect key={i} x={sx + x} y={sill - h} width={w} height={h} rx={2} fill={C.primary} />
      ))}
      {/* the lit windows — the only bright thing in the design's glass */}
      {LIT.map(([x, up], i) => (
        <Rect key={i} x={sx + x} y={sill - up} width={2.6} height={2.6} fill={C.highlight} />
      ))}

      {/* mullions — the four panes */}
      <Rect x={X + W / 2 - 1.5} y={sy} width={3} height={sh} fill={C.primary} />
      <Rect x={sx} y={Y + H / 2 - 1.5} width={sw} height={3} fill={C.primary} />
    </>
  );
}
