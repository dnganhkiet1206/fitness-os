import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useId } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { colors } from '@/constants/ascnd';

/**
 * The strip the phone's own status bar sits on.
 *
 * ── what it is for ──
 *
 * A tab page scrolls all the way to the top edge, which is the right layout —
 * the content reads as one continuous surface rather than as a page in a frame.
 * It is also how a weight of "57.4 kg" ends up sliding through the battery
 * icon, and for that second neither number can be read: the phone's chrome and
 * the app's content are the same size, the same weight and both white.
 *
 * So the band the clock lives in is separated from whatever passes under it,
 * and nothing else changes — the page still scrolls to the edge and this is not
 * a header that steals height.
 *
 * ── glass where there is glass ──
 *
 * iOS 26 blurs it for real, through the same `GlassView` the tab bar already
 * uses; the pill at the bottom and the band at the top are then made of one
 * material, which is the whole point of a material.
 *
 * Everywhere else — older iOS, Android, the web build — it is a gradient from
 * the page colour down to nothing. That is not a lesser version of the same
 * idea, it is a different idea for the same problem: a blur separates by
 * softening, a fade separates by dimming. Both leave the clock legible and only
 * one of them needs an OS from this year.
 *
 * ── no edge along the bottom ──
 *
 * Both halves used to draw one, for different reasons, and both are dealt with
 * below: the glass by hanging its own rim outside a clip, the gradient by
 * easing instead of stepping. A strip whose job is to stop you seeing a line
 * cannot arrive with a line of its own.
 *
 * ── why it stops exactly at the inset ──
 *
 * `insets.top` is where the phone's chrome ends and the page's own content
 * begins; a strip any taller starts dimming things that are not scrolled past
 * anything — the large title sits at `insets.top + 8`, and it would arrive with
 * its capitals greyed. Everything inside the inset is either the status bar or
 * content on its way out of sight, so the strip has no reason to reach further
 * down than that.
 */

const GLASS = isLiquidGlassAvailable();

/**
 * How far the glass is hung outside the strip on every side.
 *
 * `UIGlassEffect` draws a bright specular rim around the shape it is applied
 * to — that is what makes the material read as a lens and not as a blur — and
 * `expo-glass-effect` exposes no way to turn it off: `GlassView` is a plain
 * `UIVisualEffectView` carrying the effect, and its props are style, tint,
 * interactivity, colour scheme and corner radii. Nothing else.
 *
 * So the rim is not removed, it is put where it cannot be seen. The strip
 * clips, and the glass inside it is oversized on all four sides, which leaves
 * every edge it draws outside the clip. Sixteen points is far more than the rim
 * is wide, and costs nothing — the blur was going to be there anyway, it is
 * just being read from further out.
 */
const RIM = 16;

export function StatusScrim() {
  const insets = useSafeAreaInsets();
  /*
    Ids in SVG are document-global on native, not local to the `<Svg>` that
    declares them — two scrims mounted at once (a pushed page sitting over the
    tab underneath it) would otherwise both draw whichever gradient was
    registered last. This has caught the app three times; `useId` is the rule.
  */
  const gid = `statusScrim-${useId()}`;

  // Nothing to cover on a device with no inset at the top.
  if (insets.top <= 0) return null;

  return (
    <View style={[styles.strip, { height: insets.top }]} pointerEvents="none">
      {GLASS ? (
        <GlassView glassEffectStyle="regular" tintColor="rgba(8,8,10,0.55)" style={styles.glass} />
      ) : (
        /*
          Six stops, not two, and none of them a corner.

          A straight ramp from opaque to clear has a visible middle: the eye
          finds the point where it is exactly half and reads it as a line. But
          so does a ramp that is held flat and then released — the kink where
          the slope changes is just as findable as the half-way point, and that
          kink is what the bottom edge of this strip was.

          So the slope grows a step at a time instead of switching on: solid
          where the icons are, barely moving under them, steepest where there
          is nothing left to hide, and zero exactly at the bottom — a gradient
          still at 0.2 when it runs out has an edge after all.
        */
        <Svg style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={colors.background} stopOpacity="1" />
              <Stop offset="0.55" stopColor={colors.background} stopOpacity="1" />
              <Stop offset="0.72" stopColor={colors.background} stopOpacity="0.92" />
              <Stop offset="0.85" stopColor={colors.background} stopOpacity="0.65" />
              <Stop offset="0.94" stopColor={colors.background} stopOpacity="0.3" />
              <Stop offset="1" stopColor={colors.background} stopOpacity="0" />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${gid})`} />
        </Svg>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  /*
    Above the scroll view and outside it — inside, it would scroll away with
    the content it exists to cover. `pointerEvents="none"` so the top of the
    page is still touchable through it, and `zIndex` below the floating
    header's 20 so a chevron drawn over a hero stays crisp.
  */
  strip: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, overflow: 'hidden' },
  /** oversized on every side so the glass draws its rim outside the clip above */
  glass: { position: 'absolute', top: -RIM, left: -RIM, right: -RIM, bottom: -RIM },
});
