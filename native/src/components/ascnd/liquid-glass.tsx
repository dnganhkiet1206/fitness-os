import { BlurView } from 'expo-blur';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { glass, radius } from '@/constants/ascnd';

/**
 * A card you can see the room through.
 *
 * ── how this differs from `GlassCard` ──
 *
 * `GlassCard` is a 6% white *fill*. It reads as glass because the page behind
 * it is dark and even, and that is true on every screen in the app but this
 * one. Here the background is a set of coloured pools slowly drifting, and a
 * flat white fill over moving colour is a sheet of tracing paper: the light
 * goes under it and nothing comes through.
 *
 * This samples what is behind it instead. `BlurView` is a real
 * `UIVisualEffectView`, so the aura's colour arrives *inside* the card, and
 * the card's tint changes as the pools drift past underneath. That is the
 * whole difference between glass and paint, and it only matters over a
 * background that moves.
 *
 * ── the intensity is low on purpose ──
 *
 * 22, not 60. The lesson is the one the status-bar strip was rebuilt around:
 * `intensity` scales the material's *tint* as well as its blur radius, so a
 * high value stops being a lens and becomes a light grey rectangle. The aura
 * beneath is already soft — there are no edges down there for a strong blur to
 * dissolve — so all a higher number would buy is a paler card.
 *
 * ── android ──
 *
 * `experimentalBlurMethod` is deliberately not set. Without it Android renders
 * a plain translucent view, which is the honest degradation: the fill and the
 * hairline still describe a card, it simply is not a lens. Turning it on
 * renders the blur on the JS thread and is what `docs/SO-GHI-LOI.md` §A8 warns
 * against.
 */
export function LiquidGlass({
  children,
  style,
  radius: r = glass.radius,
  intensity = 22,
}: {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  radius?: number;
  intensity?: number;
}) {
  return (
    <View style={[styles.wrap, { borderRadius: r }, style]}>
      <BlurView intensity={intensity} tint="dark" style={StyleSheet.absoluteFill} />
      {/*
        The lit face, same diagonal as every other card in the app: bright at
        the top-left where `AmbientLight` puts the key, dark at the bottom
        right. Two rects each fading to fully transparent rather than one
        white→black, which would drag a grey haze through the middle.
      */}
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" pointerEvents="none">
        <Defs>
          <LinearGradient id="lgLit" x1="0" y1="0" x2="0.9" y2="1">
            <Stop offset="0" stopColor="#ffffff" stopOpacity={0.10} />
            <Stop offset="0.55" stopColor="#ffffff" stopOpacity={0} />
          </LinearGradient>
          <LinearGradient id="lgShade" x1="0" y1="0" x2="0.9" y2="1">
            <Stop offset="0.45" stopColor="#000000" stopOpacity={0} />
            <Stop offset="1" stopColor="#000000" stopOpacity={0.16} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#lgLit)" />
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#lgShade)" />
      </Svg>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
    borderWidth: glass.borderWidth,
    borderColor: glass.border,
    /* A hair of fill under the blur. On a very dark pool the material alone
       can land almost black, and the card loses its own edge against the page. */
    backgroundColor: 'rgba(255,255,255,0.035)',
  },
});

export const liquidRadius = radius;
