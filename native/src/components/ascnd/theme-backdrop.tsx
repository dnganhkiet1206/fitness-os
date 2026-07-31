import { Image, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

import { backdrop } from '@/constants/premium-theme';

/**
 * The charcoal backdrop — four layers, none of them meant to be noticed.
 *
 * Sits behind a page instead of a flat `backgroundColor`. Absolutely
 * positioned and non-interactive, so it never moves with the scroll: the page
 * slides over a still background, the way a real surface behaves.
 *
 * ── the layers, bottom to top ──
 *
 *   1. **Gradient** — charcoal at the top-left fading to near-black at the
 *      bottom-right. Drawn with `react-native-svg` rather than a gradient
 *      dependency: the library is already here, and this is one static `Rect`.
 *   2. **Wash** — a flat 2% white, so the darkest corner is not a clipped
 *      single value.
 *   3. **Glow** — a wide, soft radial light near the top, so the first thing
 *      on the page sits in light without needing a border to lift it.
 *   4. **Grain** — a tiled noise texture at 2%.
 *
 * ── on cost ──
 *
 * Every prop on this SVG is a constant. `react-native-svg` re-rasterises a
 * whole `<Svg>` when any child prop changes, and nothing here ever changes, so
 * it is rasterised once when the page mounts and composited from then on —
 * including during scroll, since it is outside the scroll view. That is the
 * whole reason the gradient and glow share a single `<Svg>` and the grain is a
 * plain tiled `Image` rather than an SVG filter.
 *
 * (`feTurbulence` would have been the tidy way to make grain without shipping
 * a texture. `react-native-svg` 15.15 declares the element but its `render`
 * returns null behind a warning — the filter primitives are unimplemented on
 * native. Hence the asset.)
 */
export function PremiumBackdrop() {
  return (
    <View style={styles.root} pointerEvents="none">
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          {/* Gradient 3: top-left → bottom-right */}
          <LinearGradient id="premiumBg" x1="0" y1="0" x2="1" y2="1">
            {backdrop.colors.map((c, i) => (
              <Stop key={c} offset={backdrop.stops[i]} stopColor={c} stopOpacity={1} />
            ))}
          </LinearGradient>
          {/*
            The radial light — an ellipse wider than the screen and shallower
            than half of it, so it reads as a lift near the top rather than as
            a disc someone drew. `fx`/`fy` stay at the centre: an offset focus
            would give the light a direction, and this is ambient.

            Three stops, not two. A straight ramp from 6% to 0 has a visible
            edge where it lands; the middle stop at a third of the way down
            bends it into something closer to a real falloff.
          */}
          <RadialGradient
            id="premiumGlow"
            cx={backdrop.glow.x}
            cy={backdrop.glow.y}
            rx={backdrop.glow.rx}
            ry={backdrop.glow.ry}
            gradientUnits="objectBoundingBox">
            <Stop offset="0" stopColor="#ffffff" stopOpacity={backdrop.glow.opacity} />
            <Stop offset="0.55" stopColor="#ffffff" stopOpacity={backdrop.glow.opacity * 0.35} />
            <Stop offset="1" stopColor="#ffffff" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#premiumBg)" />
        <Rect x="0" y="0" width="100%" height="100%" fill={backdrop.wash} />
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#premiumGlow)" />
      </Svg>
      {/*
        Grain. `resizeMode="repeat"` tiles the texture at its natural size, and
        the asset ships at 1×/2×/3× so a 64pt tile is 192 real pixels on a
        modern iPhone — fine enough to read as grain rather than as a pattern.

        `mixBlendMode: 'overlay'` is what keeps it honest: mid-grey pixels leave
        the backdrop exactly as it was, so only the variance in the texture
        shows and the noise cannot lift the black point. Where blending is not
        available the layer falls back to a normal composite, which at 2% is a
        shift of about two levels out of 255 — no visible difference.
      */}
      <Image
        source={require('@/assets/images/noise.png')}
        style={[styles.noise, { opacity: backdrop.noiseOpacity }]}
        resizeMode="repeat"
        fadeDuration={0}
      />
    </View>
  );
}

const fill = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const;

const styles = StyleSheet.create({
  root: {
    ...fill,
    // The gradient's darkest stop, so the very first frame — before the SVG has
    // rasterised — is charcoal rather than a flash of white or of the old black.
    backgroundColor: backdrop.colors[2],
    // Blend the grain against this backdrop only, never against what is under it
    isolation: 'isolate',
  },
  noise: {
    ...fill,
    // `Image` defaults to its source's intrinsic size; clearing both lets the
    // absolute edges drive the box so `repeat` tiles across the whole page.
    width: undefined,
    height: undefined,
    mixBlendMode: 'overlay',
  },
});
