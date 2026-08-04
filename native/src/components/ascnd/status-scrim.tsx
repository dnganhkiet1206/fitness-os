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
        <GlassView
          glassEffectStyle="regular"
          tintColor="rgba(8,8,10,0.55)"
          style={StyleSheet.absoluteFill}
        />
      ) : (
        /*
          Four stops, not two.

          A straight ramp from opaque to clear has a visible middle: the eye
          finds the point where it is exactly half and reads it as a line. The
          icons sit in roughly the top two thirds of the inset, so it is held
          solid through there and falls away underneath them, which puts the
          change where nothing is being read and lands it on zero exactly at
          the edge of the strip — a gradient that is still at 0.2 when it runs
          out has an edge after all.
        */
        <Svg style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={colors.background} stopOpacity="1" />
              <Stop offset="0.7" stopColor={colors.background} stopOpacity="1" />
              <Stop offset="0.88" stopColor={colors.background} stopOpacity="0.55" />
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
  strip: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
});
