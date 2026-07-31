import { BlurView } from 'expo-blur';
import { StyleSheet } from 'react-native';

/**
 * A blur across the top of a page — the status bar band.
 *
 * Content scrolling up past the Dynamic Island softens instead of running into
 * it sharp. Nothing is drawn: no fill, no tint, no border. The only thing here
 * is the blur.
 *
 * ── why this is not `expo-glass-effect` ──
 *
 * It was, and that was the wrong primitive. `GlassView` renders a
 * `UIGlassEffect`, and Liquid Glass is a *lens*: a translucent body with a
 * bright specular rim, drawn as an object sitting on the page. That rim is the
 * "viền dưới" and the body is the "trắng mờ" — both are what the effect is,
 * not something layered over it, which is why no combination of props removed
 * them. `glassEffectStyle="clear"` only picks a thinner lens, and
 * `tintColor` set to fully clear only removes the colour the material adds on
 * top of a body that is still there.
 *
 * `BlurView` renders a `UIBlurEffect`. That is not an object, it is a
 * treatment of what is behind it — no body, no rim, no edge highlight. It is
 * what every app doing this before iOS 26 used, and what a header that is
 * meant to be invisible needs.
 *
 * ── the material ──
 *
 * `systemUltraThinMaterialDark` is the most transparent of the dark system
 * materials: almost all of what is behind it comes through, just softened. The
 * `…Dark` variant is pinned rather than plain `dark` so the material never
 * follows the phone's appearance — a light material over this app is the pale
 * film that started all of this.
 *
 * `intensity` is the blur radius, not the opacity. 40 is enough to make moving
 * text unreadable — which is the whole job — without turning the band into a
 * smear that reads as a panel.
 */
export function GlassBar({ height }: {
  /** how tall the blur is, in points — the status bar band */
  height: number;
}) {
  if (height <= 0) return null;

  return (
    <BlurView
      style={[styles.pane, { height }]}
      tint="systemUltraThinMaterialDark"
      intensity={40}
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
