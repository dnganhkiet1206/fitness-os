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
 * Progressive blur across the top of a page.
 *
 * Strongest at the very top and weakening downward until it is gone, with no
 * bar, no fill, no border and no edge. Content scrolling up past the Dynamic
 * Island dissolves rather than sliding under a panel.
 *
 * ── why it is stacked, not masked ──
 *
 * The obvious way to fade a blur is one layer under a gradient mask. That was
 * tried and it put a dark band under the header: masking a `UIVisualEffectView`
 * can cost it its backdrop, and an effect view with no backdrop draws its
 * material colour flat — for a dark material, a dark bar.
 *
 * So the gradient is built out of the blur itself. Every layer starts at the
 * top and each is shorter than the last, so the top of the strip is covered by
 * all of them and the bottom of the tail by only the tallest. Blur compounds
 * where layers overlap, which is what produces the ramp. No layer is masked,
 * so every one keeps its own backdrop, and nothing anywhere has a colour of
 * its own to leak.
 *
 * ── why the layers are weak ──
 *
 * `intensity` in `expo-blur` is the `fractionComplete` of a paused animator
 * from "no effect" to the full material — it scales the blur radius *and* the
 * material's tint together, in step. That is what makes stacking safe: at 11
 * each, six layers reach a strong blur at the top while the tint only ever
 * accumulates to about half of one full pane of `systemUltraThinMaterial`.
 * Six layers at full strength would be a solid dark bar.
 *
 * Six is also why the ramp does not read as steps: over a 14pt tail the bands
 * are barely two points each, and consecutive bands differ by one of the
 * weakest blurs the system can draw.
 *
 * ── the material ──
 *
 * `systemUltraThinMaterialDark` is the most transparent of the dark system
 * materials. The `…Dark` variant is pinned rather than plain `dark` so it never
 * follows the phone's appearance — a light material over this app is a pale
 * film, which is the thing this has been chased away from twice.
 */

/** how many panes build the ramp */
const LAYERS = 6;

/** each pane's share of the material — see the note on stacking above */
const LAYER_INTENSITY = 11;

export function GlassBar({ height, fade = 0 }: {
  /** fully-blurred band at the top, in points — the status bar */
  height: number;
  /** distance below it over which the blur thins away to nothing */
  fade?: number;
}) {
  if (!Blur || height <= 0) return null;
  const { BlurView } = Blur;

  return (
    <>
      {Array.from({ length: LAYERS }, (_, i) => (
        <BlurView
          key={i}
          // Tallest first. Every pane starts at the top, so the count of panes
          // covering a given row is what sets the blur there: all of them
          // across `height`, tapering to one by the end of the tail.
          style={[styles.pane, { height: height + (fade * (LAYERS - 1 - i)) / (LAYERS - 1) }]}
          tint="systemUltraThinMaterialDark"
          intensity={LAYER_INTENSITY}
          pointerEvents="none"
        />
      ))}
    </>
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
