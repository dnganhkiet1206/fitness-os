import { StyleSheet } from 'react-native';

type BlurModule = typeof import('expo-blur');

/**
 * `expo-blur` is a native module, so it only exists once the app has been
 * rebuilt. Guarded the same way HealthKit is in `lib/health.ts`: `BlurView`
 * pulls in its native view manager at import, which throws on a binary that
 * predates the dependency, and a page scaffold is the last place in the app
 * that should be able to take a screen down.
 *
 * Until the rebuild the bar renders nothing, which is what it did before this
 * existed. Note this only covers the *native* half — Metro still has to be
 * able to resolve the package, so `npm install` is not optional.
 */
let Blur: BlurModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Blur = require('expo-blur') as BlurModule;
} catch {
  Blur = null; // binary built before expo-blur was added
}

/**
 * One transparent blur across the top of a page — the status bar band.
 *
 * Content scrolling up past the Dynamic Island softens instead of running into
 * it sharp. Nothing is drawn: no fill, no tint of our own, no border. One
 * layer, and the only thing it does is blur.
 *
 * ── how it stays transparent ──
 *
 * Two settings, and both matter.
 *
 * `systemUltraThinMaterialDark` is the most transparent of the dark system
 * materials — nearly all of what is behind it comes through. The `…Dark`
 * variant is pinned rather than plain `dark` so it never follows the phone's
 * appearance; a light material over this app is a pale film, which is what
 * this has had to be chased away from more than once.
 *
 * `intensity` is not opacity. Reading `expo-blur`'s Swift, it is the
 * `fractionComplete` of a paused animator running from "no effect" to the full
 * material, so it scales the blur radius *and* the material's tint together.
 * At 30 the tint is under a third of an already-faint material — the band
 * looks like the page, only out of focus — while the radius is still enough to
 * take the edge off text moving underneath.
 *
 * Turning this up does not make a better blur, it makes a grey bar.
 *
 * ── things tried here that did not work ──
 *
 * Kept so none of them comes back:
 *
 *   - `expo-glass-effect`. `UIGlassEffect` is a lens, not a blur: a
 *     translucent body with a bright specular rim, drawn as an object on the
 *     page. The rim and the body are what the effect *is*, so no combination
 *     of `glassEffectStyle` and `tintColor` removed them.
 *   - A gradient mask, to fade the bottom edge. Masking a
 *     `UIVisualEffectView` can cost it its backdrop, and an effect view with
 *     no backdrop draws its material colour flat — a dark band under the
 *     header.
 *   - Stacking panes of decreasing height to build that fade out of the blur
 *     itself. It works, and it is six live effect views for an edge.
 */
export function GlassBar({ height }: {
  /** how tall the blur is, in points — the status bar band */
  height: number;
}) {
  if (!Blur || height <= 0) return null;
  const { BlurView } = Blur;

  return (
    <BlurView
      style={[styles.pane, { height }]}
      tint="systemUltraThinMaterialDark"
      intensity={30}
      pointerEvents="none"
    />
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
});
