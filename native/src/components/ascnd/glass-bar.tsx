import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { StyleSheet, View } from 'react-native';

/**
 * The frosted backing for a bar that content scrolls underneath.
 *
 * A real backdrop blur, not a translucent fill. The difference only matters
 * once something is behind it — and that is exactly the situation this exists
 * for. The app's usual recipe (a 6% white fill over the page) looks like
 * frosted glass only because nothing is ever behind it but the page colour;
 * put a paragraph under it and the paragraph reads straight through.
 *
 * ── the fallback is opaque, deliberately ──
 *
 * `GlassView` is the Liquid Glass API and there is no glass to render before
 * iOS 26. Everywhere else in the app an unavailable effect can degrade to
 * something fainter, but not here: a bar with text sliding under it has to
 * hide that text or it is unreadable, so the fallback is a solid fill rather
 * than a weaker translucency.
 *
 * `FALLBACK` is the colour the bar has always been — the page background with
 * the 6% white glass fill composited onto it — so on an older system the bar
 * looks exactly as it did before, and only the blur is missing.
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
      glassEffectStyle="regular"
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
