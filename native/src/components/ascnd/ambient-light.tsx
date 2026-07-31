import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

/**
 * Ambient light — a 4% wash at the top of the page, fading to nothing.
 *
 * The background is a single flat fill, and a single flat fill is the one thing
 * a real surface never is. Every dark Apple screen has a light in it somewhere:
 * you cannot point at it, and you cannot un-see the difference when it is
 * missing — the page stops looking like a surface and starts looking like a
 * hole with content floating in it.
 *
 * This is that layer and nothing else. It does not change a single colour
 * token: the background is still `colors.background`, the cards are still the
 * same glass. It only stops the top of the page from being exactly as dark as
 * the bottom.
 *
 * ── the numbers ──
 *
 * 4% white at the very top, gone by 55% of the page. That is the middle of the
 * 3–5% the brief asks for, and it is deliberately not tunable per screen: an
 * ambient light that is brighter on one page than the next is a light the user
 * *can* see, which defeats it.
 *
 * The falloff has a middle stop. A straight ramp from 4% to 0 leaves a faint
 * horizontal edge where it lands — the eye is far better at finding the end of
 * a linear ramp than at seeing the ramp itself. Bending it down early makes the
 * bottom of the gradient asymptotic and the edge disappears.
 *
 * ── on cost ──
 *
 * One `Rect`, and every prop on it is a constant. `react-native-svg`
 * re-rasterises an `<Svg>` when a child prop changes; nothing here ever
 * changes, so this is drawn once per page mount and composited from then on.
 * It sits outside the scroll view, so it does not move — light that scrolled
 * with the content would give away that it is a drawing.
 */
export function AmbientLight() {
  return (
    <View style={styles.light} pointerEvents="none">
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="ambient" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#ffffff" stopOpacity={0.04} />
            <Stop offset="0.45" stopColor="#ffffff" stopOpacity={0.011} />
            <Stop offset="1" stopColor="#ffffff" stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#ambient)" />
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
    // Over half the page: a short gradient reads as a band at the top, a long
    // one reads as the room the page is in.
    height: '55%',
  },
});
