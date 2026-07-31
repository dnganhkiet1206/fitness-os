import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { StyleSheet, View } from 'react-native';

/**
 * The glass backing for a bar that content scrolls underneath.
 *
 * A real backdrop blur, not a translucent fill. The difference only matters
 * once something is behind it — and that is exactly the situation this exists
 * for. The app's usual recipe (a 6% white fill over the page) looks like
 * frosted glass only because nothing is ever behind it but the page colour;
 * put a paragraph under it and the paragraph reads straight through.
 *
 * ── clear, not frosted ──
 *
 * `clear` is the see-through end of the Liquid Glass scale: it bends and
 * softens what is behind it without laying a pane of tint over it, so the page
 * still reads as one surface with a bar resting on it rather than as two
 * stacked panels. `regular` — a full frosted panel — was the first choice here
 * on the grounds that a bar has to hide what slides under it, but that is the
 * argument for a toolbar, and this bar carries a chevron and a title, not
 * controls that need a solid ground to sit on.
 *
 * The trade is real and worth naming: over busy content the title has less to
 * separate it from what is passing beneath. The bottom hairline and the title's
 * own weight are what hold it apart.
 *
 * ── the fallback is opaque, and cannot not be ──
 *
 * `GlassView` is the Liquid Glass API and there is no glass to render before
 * iOS 26. Transparency there would not be glass, it would be a hole: no blur
 * means content slides under the bar at full sharpness and collides with the
 * title. So the fallback stays a solid fill — `FALLBACK` is the colour the bar
 * has always been, the page background with the 6% white glass fill composited
 * onto it, so on an older system the bar looks exactly as it did before and
 * only the blur is missing.
 */

/** #070708 with `glass.bg` (6% white) flattened onto it */
const FALLBACK = '#161617';

export function GlassBar() {
  if (!isLiquidGlassAvailable()) {
    return <View style={[styles.fill, styles.solid]} pointerEvents="none" />;
  }
  return (
    <GlassView
      style={styles.fill}
      glassEffectStyle="clear"
      colorScheme="dark"
      isInteractive={false}
      pointerEvents="none"
    />
  );
}

const styles = StyleSheet.create({
  fill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  solid: { backgroundColor: FALLBACK },
});
