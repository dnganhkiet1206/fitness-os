import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { StyleSheet, View } from 'react-native';

/**
 * A pane of glass across the top of a page, thinning out to nothing.
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
 * ── the fade is the glass thinning, not something drawn over it ──
 *
 * `fade` is a tail below `height` where the glass gets weaker until it is gone.
 * It is built by stacking panes of decreasing height at partial opacity: each
 * composites over the last, so the strength steps down as you pass the bottom
 * of each one. Opacity on a glass view weakens the *effect*, so every step is
 * closer to plain page than the step above it, and the end of the tail is
 * plain page exactly.
 *
 * The first version masked a single pane with a gradient instead. That is
 * smoother on paper, and in practice it put a dark band under the bar: a mask
 * over a visual-effect layer does not give you glass that thins, it gives you
 * glass with something laid across it. Stacking draws nothing — there is no
 * layer in here that has a colour.
 *
 * Three steps rather than eight, because each extra pane is another live blur
 * to composite, and on `clear` glass the steps sit between states that are
 * already nearly identical.
 *
 * ── with no Liquid Glass it renders nothing ──
 *
 * Deliberate, and a change from the earlier solid-colour stand-in. There is no
 * blur before iOS 26, and everything that can stand in for one is a flat fill:
 * a dark fill is the dark band that was objected to, and a light fill is the
 * white haze objected to before that. A pane of glass that cannot be glass is
 * better as nothing — the page keeps its own colour and nothing is laid over
 * the top of it.
 *
 * The cost is real and worth stating: on those systems content scrolls up to
 * the status bar sharp, with no softening. That is the honest floor without a
 * blur primitive, and the only way past it is shipping one (`expo-blur`),
 * which needs a native rebuild.
 */

/** how the tail steps down: fraction of the tail, and that pane's opacity */
const FADE_STEPS = [
  { of: 1, opacity: 0.35 },
  { of: 0.55, opacity: 0.5 },
] as const;

export function GlassBar({ height, fade = 0 }: {
  /** full-strength height in points — the status bar band */
  height: number;
  /** tail below it over which the glass thins to nothing */
  fade?: number;
}) {
  // Nothing, rather than something that is not glass
  if (!isLiquidGlassAvailable() || height <= 0) return null;

  return (
    <>
      {/* Weakest and tallest first, so the stronger panes composite on top */}
      {fade > 0 &&
        FADE_STEPS.map((s) => (
          <Pane key={s.of} height={height + fade * s.of} opacity={s.opacity} />
        ))}
      <Pane height={height} opacity={1} />
    </>
  );
}

function Pane({ height, opacity }: { height: number; opacity: number }) {
  return (
    <View style={[styles.pane, { height, opacity }]} pointerEvents="none">
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
