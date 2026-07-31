import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { StyleSheet, View } from 'react-native';

/**
 * A pane of glass across the top of a page.
 *
 * A real backdrop blur, not a translucent fill. The difference only matters
 * once something is behind it — and that is the whole situation this exists
 * for. The app's usual recipe (a 6% white fill over the page) looks like
 * frosted glass only because nothing is ever behind it but the page colour;
 * put a paragraph under it and the paragraph reads straight through.
 *
 * ── it covers the Dynamic Island's band, and stops ──
 *
 * `height` is the status bar inset, not the header's height. The chevron and
 * the title below it stand on the page itself. The pane takes its own height
 * rather than filling its parent because the parent has to stay full height
 * for those controls to remain tappable — iOS does not deliver touches outside
 * a view's bounds.
 *
 * ── no fade ──
 *
 * The pane ends where it ends. Two attempts at softening that edge are worth
 * recording so neither gets tried again:
 *
 *   - A gradient mask over the pane. Put a dark band under the bar: a mask on
 *     a visual-effect layer does not thin the glass, it lays something across
 *     it.
 *   - Panes of decreasing height stacked at partial opacity. No colour
 *     anywhere, but several live blurs compositing over each other, and the
 *     result was worse than the edge it was hiding.
 *
 * One pane, one edge, nothing drawn on top of it.
 *
 * ── with no Liquid Glass it renders nothing ──
 *
 * Deliberate, and a change from the earlier solid-colour stand-in. There is no
 * blur before iOS 26, and everything that can stand in for one is a flat fill:
 * a dark fill reads as a dark band, a light fill as a white haze. A pane of
 * glass that cannot be glass is better as nothing — the page keeps its own
 * colour and nothing is laid over the top of it.
 *
 * The cost is worth stating: on those systems content scrolls up to the status
 * bar sharp, with no softening. That is the honest floor without a blur
 * primitive, and the only way past it is shipping one (`expo-blur`), which
 * needs a native rebuild.
 */
export function GlassBar({ height }: {
  /** how tall the pane is, in points — the status bar band */
  height: number;
}) {
  // Nothing, rather than something that is not glass
  if (!isLiquidGlassAvailable() || height <= 0) return null;

  return (
    <View style={[styles.pane, { height }]} pointerEvents="none">
      <GlassView
        style={styles.fill}
        glassEffectStyle="clear"
        colorScheme="dark"
        isInteractive={false}
        pointerEvents="none"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // Anchored to the top of its parent, at its own height rather than filling it
  pane: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  fill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
});
