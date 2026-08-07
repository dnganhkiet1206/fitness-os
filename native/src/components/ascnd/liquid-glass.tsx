import { BlurView } from 'expo-blur';
import { useId } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

import { glass, radius } from '@/constants/ascnd';

/**
 * A control you can see the room through.
 *
 * ── where Apple's rule applies, and where it was overruled ──
 *
 * The guidance is *"don't use Liquid Glass in the content layer"* and *"use
 * Liquid Glass effects sparingly."* That is written for an app that uses the
 * material throughout: spend it everywhere and nothing floats above anything.
 *
 * This is one screen, and the thing behind the glass is an aura rather than a
 * page of content — so the risk the rule guards against, glass obscuring what
 * you came to read, is not present here. The screen is glass throughout by
 * decision, and what carries the hierarchy instead is `tint`.
 *
 * ── tint: the panel is lit by its own icon ──
 *
 * A pane of glass with a coloured light behind it takes that colour. So each
 * card takes a wash of its glyph's colour, anchored at the corner the glyph
 * sits in and falling off across the face. Twelve identical panels read flat;
 * twelve panels each lit a different colour read as twelve objects, which is
 * the hierarchy the uniform version was missing.
 *
 * It is deliberately faint — 0.16 at the peak. Past about a quarter the wash
 * stops being light through glass and becomes a coloured card, and a coloured
 * card is exactly what this material exists not to be.
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
  tint,
}: {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  radius?: number;
  intensity?: number;
  /** the colour of whatever this panel holds — washed across the glass */
  tint?: string;
}) {
  /* Document-global ids on native. Eight of these render on one screen, so a
     hardcoded id would have the first card's gradient painting all of them. */
  const uid = useId();
  const lit = `lgLit-${uid}`;
  const shade = `lgShade-${uid}`;
  const wash = `lgWash-${uid}`;
  const edge = `lgEdge-${uid}`;

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
          <LinearGradient id={lit} x1="0" y1="0" x2="0.9" y2="1">
            <Stop offset="0" stopColor="#ffffff" stopOpacity={0.10} />
            <Stop offset="0.55" stopColor="#ffffff" stopOpacity={0} />
          </LinearGradient>
          <LinearGradient id={shade} x1="0" y1="0" x2="0.9" y2="1">
            <Stop offset="0.45" stopColor="#000000" stopOpacity={0} />
            <Stop offset="1" stopColor="#000000" stopOpacity={0.16} />
          </LinearGradient>
          <LinearGradient id={edge} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#ffffff" stopOpacity={0.34} />
            <Stop offset="0.38" stopColor="#ffffff" stopOpacity={0.14} />
            <Stop offset="0.7" stopColor="#ffffff" stopOpacity={0} />
          </LinearGradient>
          {tint ? (
            /* Anchored at the top-left, which is where the glyph sits on every
               card that passes a tint — the wash reads as coming *from* it. */
            <RadialGradient id={wash} cx="0.16" cy="0.16" rx="0.95" ry="0.85" gradientUnits="objectBoundingBox">
              <Stop offset="0" stopColor={tint} stopOpacity={0.16} />
              <Stop offset="0.45" stopColor={tint} stopOpacity={0.07} />
              <Stop offset="1" stopColor={tint} stopOpacity={0} />
            </RadialGradient>
          ) : null}
        </Defs>
        {tint ? <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${wash})`} /> : null}
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${lit})`} />
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${shade})`} />
        {/*
          The specular edge — a 1pt line along the top, bright at the left and
          gone by two-thirds across.

          This is the tell that separates glass from a translucent rectangle. A
          real pane catches the key light on its upper edge and only on the side
          the light comes from; a border that is the same value all the way
          round reads as a drawn outline, which is what the hairline alone was.
        */}
        <Rect x="0" y="0" width="100%" height="1" fill={`url(#${edge})`} />
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

/**
 * The content surface that goes *under* the glass layer.
 *
 * Darker and much more opaque than `glass.bg`'s 6% white. Over a page whose
 * background is four coloured pools in motion, a 6% white fill takes the pool's
 * colour and the text takes it with them; a dark base holds still underneath
 * so the numbers stay legible whatever is drifting past. It keeps the same
 * hairline as every other card in the app, so it reads as the same family.
 */
/** A hairline that agrees with the wash — see `LiquidGlass`. */
export const tintBorder = (tint?: string) =>
  tint ? { borderColor: `${tint}3d` } : null;

export function SolidCard({
  children,
  style,
  radius: r = radius.lg,
}: {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  radius?: number;
}) {
  return <View style={[solid.card, { borderRadius: r }, style]}>{children}</View>;
}

const solid = StyleSheet.create({
  card: {
    overflow: 'hidden',
    borderWidth: glass.borderWidth,
    borderColor: glass.border,
    backgroundColor: 'rgba(13,13,18,0.62)',
  },
});
