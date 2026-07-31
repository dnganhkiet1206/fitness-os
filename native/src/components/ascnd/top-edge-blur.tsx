import MaskedView from '@react-native-masked-view/masked-view';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { colors } from '@/constants/ascnd';

/**
 * The notch strip — content blurs out as it passes under the status bar.
 *
 * iOS's own scroll-edge effect, rebuilt: a blur that is strongest at the very
 * top of the screen and gone by the time it reaches the page title. Scrolled
 * content softens as it slides up behind the clock and the battery instead of
 * running into them sharp.
 *
 * Rendered by `Screen`, so every page built on the scaffold has it — see the
 * note there about the one header layout that deliberately does not.
 *
 * ── nothing gets hidden ──
 *
 * That is the constraint this is built around, and it is why the strip is
 * `insets.top + TAIL` tall and not a point more. The large title sits at
 * `insets.top + 8` (see `Screen`), so only its first couple of points fall
 * inside the strip — and by then the mask is nearly transparent, because the
 * gradient reaches zero at 88% of the height. At rest the title, the icon
 * buttons and the first card are all completely untouched. The effect only has
 * anything to work on once you scroll something up into the strip, which is
 * exactly when you want it.
 *
 * A scrim would have been simpler and would have failed the same test: it
 * hides what passes under it. Blur keeps the content there, just soft.
 *
 * ── how the fade is made ──
 *
 * A single glass layer inside a `MaskedView`, masked by a vertical gradient.
 * The alternative — stacking several strips of decreasing height and opacity —
 * needs no mask, but every strip ends in a hard horizontal edge, and a hard
 * edge on a blur is the one thing you cannot help noticing.
 *
 * Both pieces are already in the app's build: `MaskedView` arrives as a
 * dependency of `expo-router`, and `expo-glass-effect` ships with SDK 57. No
 * new native module, so no rebuild is needed to see this.
 *
 * ── before iOS 26 ──
 *
 * `GlassView` is the Liquid Glass API, and there is no glass to render on
 * older systems. `isLiquidGlassAvailable()` says so, and the strip falls back
 * to a gradient of the page background: not a blur, but the same idea —
 * content fades into the top edge rather than colliding with it. It is the
 * honest substitute, and it costs one `Rect`.
 */

/** how far past the safe-area inset the fade runs before it is fully clear */
const TAIL = 14;

export function TopEdgeBlur() {
  const insets = useSafeAreaInsets();
  const height = insets.top + TAIL;

  // Nothing to blur over on a device without a top inset worth speaking of
  if (insets.top <= 0) return null;

  if (!isLiquidGlassAvailable()) {
    return (
      <View style={[styles.strip, { height }]} pointerEvents="none">
        <Svg width="100%" height="100%" preserveAspectRatio="none">
          <Defs>
            <LinearGradient id="edgeFade" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={colors.background} stopOpacity={0.92} />
              <Stop offset="0.6" stopColor={colors.background} stopOpacity={0.45} />
              <Stop offset="1" stopColor={colors.background} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#edgeFade)" />
        </Svg>
      </View>
    );
  }

  return (
    <View style={[styles.strip, { height }]} pointerEvents="none">
      <MaskedView
        style={styles.fill}
        maskElement={
          // The mask reads alpha only, so the colour is arbitrary — white is
          // just the conventional "keep this" value. Full strength at the top
          // edge, half by the middle, gone at 88% so the last two points of
          // the strip are perfectly clear and the title below it is safe.
          <Svg width="100%" height="100%" preserveAspectRatio="none">
            <Defs>
              <LinearGradient id="edgeMask" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#fff" stopOpacity={1} />
                <Stop offset="0.5" stopColor="#fff" stopOpacity={0.5} />
                <Stop offset="0.88" stopColor="#fff" stopOpacity={0} />
                <Stop offset="1" stopColor="#fff" stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#edgeMask)" />
          </Svg>
        }>
        {/*
          `clear` rather than `regular`: the brief asked for a light blur, and
          `regular` is a full frosted panel that would read as a toolbar even
          through the mask. `colorScheme="dark"` pins it to the app's dark
          palette instead of following the system appearance, which would make
          the strip turn pale for anyone in light mode.
        */}
        <GlassView
          style={styles.fill}
          glassEffectStyle="clear"
          colorScheme="dark"
          isInteractive={false}
        />
      </MaskedView>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    // Above the page content, below anything the page floats over it
    zIndex: 10,
  },
  fill: { flex: 1 },
});
