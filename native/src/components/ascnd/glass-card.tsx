import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type ViewProps } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { glass, spacing } from '@/constants/ascnd';

/**
 * Card surface — the web app's `.metric-card` / `.glass-card`: a 6% white
 * glass fill, a 0.5px 12% white hairline border and a 20px radius, with a
 * diagonal gradient across the face.
 *
 * ── the gradient ──
 *
 * The fill on its own is one flat value, which is the same problem the page
 * background had: a real surface is never the same brightness across its whole
 * area, because the light reaching one corner of it is not the light reaching
 * the other. A card that is uniformly 6% white reads as a rectangle of paint.
 *
 * So the face runs light at the top-left and dark at the bottom-right. That
 * diagonal is not arbitrary — it is the direction of the room's key light,
 * which `AmbientLight` places just past the top-left corner of the page. Every
 * card catches it from the same side, which is why they look lit rather than
 * merely shaded.
 *
 * ── two gradients, not one ──
 *
 * A single gradient from white through to black would have to pass through
 * near-zero alpha in the middle, and interpolating white→black across that
 * lays a grey haze over the centre of the card. Two rects, each fading to
 * fully transparent, never interpolate between the two colours at all.
 *
 * ── on the numbers ──
 *
 * 8% white and 8% black at the extremes, both gone by the middle. Against a
 * page around #131314 that is roughly #24 at the lit corner and #0f at the
 * far one — a difference you would not measure and would notice if it were
 * missing. The darkening matters as much as the lightening: it is what
 * separates the card's bottom edge from the page without a border there to do
 * it.
 *
 * ── the face is measured, not sized in percent ──
 *
 * `<Svg width="100%" height="100%">` with `<Rect width="100%">` inside it is
 * the obvious way to make the face fill the card, and it is wrong the moment
 * the card changes size. A percentage is resolved against the frame the SVG was
 * last laid out and drawn at; grow the card — open a meal in the diary, unfold
 * the water log — and the gradient keeps the height it had when it was closed.
 * What you see is a horizontal seam across the card where the lit face stops
 * and bare fill begins.
 *
 * So the card measures itself and hands the face real pixels. `onLayout` fires
 * on every size change, the numbers reaching `<Svg>` change with it, and there
 * is nothing left to resolve against a stale frame. Nothing is drawn until the
 * first measurement — one frame of flat fill, which is what the card looked like
 * before the gradient existed and is invisible next to a card appearing.
 *
 * It cannot loop: the face is absolutely positioned, so what it renders can
 * never change the box being measured.
 *
 * Web hid this one. There `<svg width="100%">` is sized by CSS and always
 * fills — measured at 359 × 171 inside a 359 × 171 card, expanded, no seam.
 * It is the native renderer that holds onto the old frame.
 *
 * ── no drop shadow ──
 *
 * Still true, and still for the original reason: RN renders shadows on dark as
 * a hard halo rather than a soft falloff. The depth comes from the gradient,
 * the hairline border and the bright top edge.
 */
export function GlassCard({ style, children, ...props }: ViewProps) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  const measure = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    // Only on a real change — `onLayout` fires for reasons other than resizing,
    // and setting state to the same numbers re-renders every card for nothing.
    setSize((prev) => (prev && prev.w === width && prev.h === height ? prev : { w: width, h: height }));
  };

  return (
    <View style={[styles.card, style]} {...props}>
      {/*
        The lit face, clipped to the rounded corners.

        Measured here rather than on the card: this View is exactly the box the
        gradient fills, while the card's own layout includes its border. Measure
        the card and the SVG comes out two pixels wider than the box showing it
        — clipped, so harmless, and wrong for no reason. It also leaves the
        caller's own `onLayout` alone.
      */}
      <View style={styles.face} pointerEvents="none" onLayout={measure}>
        {size ? (
        <Svg width={size.w} height={size.h}>
          <Defs>
            {/* Light in from the top-left, gone by the middle */}
            <LinearGradient id="cardLit" x1="0" y1="0" x2="0.7" y2="1">
              <Stop offset="0" stopColor="#ffffff" stopOpacity={0.08} />
              <Stop offset="0.45" stopColor="#ffffff" stopOpacity={0.015} />
              <Stop offset="1" stopColor="#ffffff" stopOpacity={0} />
            </LinearGradient>
            {/* And falling away to the bottom-right, on its own rect so the two
                never interpolate through each other */}
            <LinearGradient id="cardShade" x1="1" y1="1" x2="0.35" y2="0">
              <Stop offset="0" stopColor="#000000" stopOpacity={0.08} />
              <Stop offset="0.45" stopColor="#000000" stopOpacity={0.015} />
              <Stop offset="1" stopColor="#000000" stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width={size.w} height={size.h} fill="url(#cardLit)" />
          <Rect x="0" y="0" width={size.w} height={size.h} fill="url(#cardShade)" />
        </Svg>
        ) : null}
      </View>
      {/* Bright inner top edge (--glass-inner-shadow) */}
      <View style={styles.topLine} pointerEvents="none" />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: glass.radius,
    padding: spacing.card,
    backgroundColor: glass.bg,
    borderWidth: glass.borderWidth,
    borderColor: glass.border,
    overflow: 'hidden',
  },
  face: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: glass.radius,
    overflow: 'hidden',
  },
  topLine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: glass.highlight,
  },
});
