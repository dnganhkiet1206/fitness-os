import { StyleSheet, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

/**
 * A lamp behind frosted glass, in a dark room.
 *
 * The page background is one flat fill, and a flat fill is the one thing a
 * real surface never is. This is the light in the room it sits in: a source
 * just above the top of the screen, spilling down and out, dimmer the further
 * it gets, gone before the bottom.
 *
 * ── it is a pool, not a wash ──
 *
 * The first attempt at this was a vertical gradient: 4% white at the top,
 * fading down. It failed, and the reason is worth keeping. A top-to-bottom
 * ramp has no source — every point on a given row is exactly as bright as
 * every other point on that row, which is what a *tint* looks like, not what
 * light looks like. Light comes from somewhere. It falls off in every
 * direction at once, so the corners go dark before the middle does, and that
 * difference across the width is the entire reason a room reads as a room.
 *
 * So it is radial, centred above the top edge. The source itself is never on
 * screen — you see the spill, not the bulb, which is what "through frosted
 * glass" means: the light has already been diffused by the time it arrives.
 *
 * ── the falloff ──
 *
 * Five stops, curving down steeply at first and then flattening into a long
 * tail. Two stops would be a linear ramp, and a linear ramp ends: there is a
 * radius where it hits zero and stops, and the eye finds that ring
 * immediately. Real falloff never quite arrives at zero, and it is the long
 * dim tail — the part you cannot see — that keeps the bright part from having
 * an outline.
 *
 * `rx` is wider than the screen for the same reason: the pool has to run off
 * both sides, or its edges are on screen and it reads as a shape someone drew.
 *
 * ── it is dimmer than it looks written down ──
 *
 * 7% at the very centre, over a background at #070708. That is about #1c1c1d
 * at the brightest point, which sounds like nothing and is roughly the
 * difference between a room with a lamp on and a room without one. Turning it
 * up is the way to make it look cheap: past about 10% it stops being light in
 * the room and starts being a grey blob on the page.
 *
 * ── on cost ──
 *
 * One `Rect`, and every prop on it is a constant. `react-native-svg`
 * re-rasterises an `<Svg>` when a child prop changes; nothing here ever
 * changes, so it is drawn once per page mount and composited from then on. It
 * sits outside the scroll view, so it does not move — light that scrolled with
 * the content would give away that it is a drawing.
 */
export function AmbientLight() {
  return (
    <View style={styles.light} pointerEvents="none">
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          {/*
            Centred above the top edge (`cy` is negative) so the brightest part
            of the pool is off screen and what reaches the page is already the
            falloff. Radii are fractions of the page, per axis — `rx` past 1
            runs the pool off both sides.
          */}
          <RadialGradient id="roomLight" cx={0.5} cy={-0.04} rx={1.15} ry={0.62} gradientUnits="objectBoundingBox">
            <Stop offset="0" stopColor="#ffffff" stopOpacity={0.07} />
            <Stop offset="0.25" stopColor="#ffffff" stopOpacity={0.042} />
            <Stop offset="0.5" stopColor="#ffffff" stopOpacity={0.02} />
            <Stop offset="0.75" stopColor="#ffffff" stopOpacity={0.007} />
            <Stop offset="1" stopColor="#ffffff" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#roomLight)" />
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
    // The full page. The pool's own falloff decides where the light ends —
    // clipping the layer early would put the edge back that the tail removes.
    bottom: 0,
  },
});
