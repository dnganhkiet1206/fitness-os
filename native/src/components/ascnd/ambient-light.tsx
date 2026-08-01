import { StyleSheet, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

/**
 * Two lamps in a dark room, seen through frosted glass.
 *
 * The page background is one flat fill, and a flat fill is the one thing a
 * real surface never is. This is the light in the room it sits in.
 *
 * ── why two, and why different colours ──
 *
 * A single white source can only make the page *lighter* somewhere. Two
 * sources at different colour temperatures make it lighter somewhere and a
 * different colour somewhere else, and that second thing is what actually
 * reads as depth: a surface tells you where the light is by how its colour
 * shifts across it, not just by how bright it is.
 *
 * It also fixes something a white light could not. This palette is cool
 * throughout — the background leans blue by a level, and the brand silver
 * (#a8afbd) leans blue by twenty-one. A white or cool light agrees with all of
 * it, and everything agreeing is exactly why the page reads flat. The key
 * light disagrees on purpose.
 *
 *   key   warm 3000K, above the top-left      → #1a1715, R−B +4
 *   fill  cool bounce, low and to the right   → #0c0e11, R−B −4
 *   between them                              → neutral
 *   untouched                                 → #070708
 *
 * Eight levels of colour temperature across the page, and about nineteen of
 * brightness. Nobody will name either colour. They will notice the page has a
 * near side and a far side.
 *
 * ── the fill is a fill ──
 *
 * Half the key's strength, because a fill light that matches the key cancels
 * it: warm plus cool in equal measure is grey, and grey is what this started
 * as. They are also placed far apart — the key spills from above the top edge,
 * the fill from off the bottom right — so they meet along a thin diagonal
 * rather than sitting on top of each other.
 *
 * The fill is what keeps the bottom of a long page from being dead flat black.
 * That is the only job it has, which is why it is dim enough to be deniable.
 *
 * ── the falloff ──
 *
 * Five stops each, steep at first and then flattening into a long tail. Two
 * stops is a linear ramp, and a linear ramp *ends*: there is a radius where it
 * reaches zero and the eye finds that ring immediately. It is the dim tail
 * nobody can see that keeps the bright part from having an outline. Both radii
 * run past the screen edge for the same reason — a pool whose rim is on screen
 * is a shape someone drew, not a light.
 *
 * ── it is dimmer than it looks written down ──
 *
 * 7.5% and 3.5%. The peak lands around #1a1715, which sounds like nothing and
 * is roughly the difference between a room with a lamp on and a room without
 * one. Turning it up is how this gets cheap: past about 10% it stops being
 * light in the room and becomes a coloured blob on the page.
 *
 * ── on cost ──
 *
 * Two `Rect`s in one `<Svg>`, and every prop on them is a constant.
 * `react-native-svg` re-rasterises an `<Svg>` when a child prop changes;
 * nothing here ever changes, so it is drawn once per page mount and composited
 * from then on. It sits outside the scroll view, so it does not move — light
 * that scrolled with the content would give away that it is a drawing.
 */

/** warm key, ~3000K — a lamp just past the top-left corner */
const KEY = { color: '#ffd9b3', peak: 0.075, cx: 0.28, cy: -0.05, rx: 1, ry: 0.55 };

/** cool bounce, low and right — half the key, and never on top of it */
const FILL = { color: '#9fc4ff', peak: 0.035, cx: 0.95, cy: 0.72, rx: 0.85, ry: 0.5 };

/** shared falloff: steep, then a long tail that never quite lands */
const CURVE = [
  { at: 0, of: 1 },
  { at: 0.25, of: 0.6 },
  { at: 0.5, of: 0.28 },
  { at: 0.75, of: 0.1 },
  { at: 1, of: 0 },
] as const;

type Source = typeof KEY;

function Pool({ id, s }: { id: string; s: Source }) {
  return (
    <RadialGradient id={id} cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry} gradientUnits="objectBoundingBox">
      {CURVE.map((p) => (
        <Stop key={p.at} offset={p.at} stopColor={s.color} stopOpacity={s.peak * p.of} />
      ))}
    </RadialGradient>
  );
}

export function AmbientLight() {
  return (
    <View style={styles.light} pointerEvents="none">
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <Pool id="lightKey" s={KEY} />
          <Pool id="lightFill" s={FILL} />
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#lightKey)" />
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#lightFill)" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  light: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    // The full page. Each pool's own falloff decides where its light ends —
    // clipping the layer early would put back the edge the tail removes.
    bottom: 0,
  },
});
