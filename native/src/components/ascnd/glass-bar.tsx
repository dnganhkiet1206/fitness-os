import MaskedView from '@react-native-masked-view/masked-view';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

/**
 * The glass backing for a bar that content scrolls underneath.
 *
 * A real backdrop blur, not a translucent fill. The difference only matters
 * once something is behind it — and that is exactly the situation this exists
 * for. The app's usual recipe (a 6% white fill over the page) looks like
 * frosted glass only because nothing is ever behind it but the page colour;
 * put a paragraph under it and the paragraph reads straight through.
 *
 * ── clear, not frosted ──
 *
 * `clear` is the see-through end of the Liquid Glass scale: it bends and
 * softens what is behind it without laying a pane of tint over it, so the page
 * still reads as one surface with a bar resting on it rather than as two
 * stacked panels. `regular` — a full frosted panel — was the first choice here
 * on the grounds that a bar has to hide what slides under it, but that is the
 * argument for a toolbar, and this bar carries a chevron and a title, not
 * controls that need a solid ground to sit on.
 *
 * The trade is real and worth naming: over busy content the title has less to
 * separate it from what is passing beneath. The bottom hairline and the title's
 * own weight are what hold it apart.
 *
 * ── no edge ──
 *
 * The bar used to end in a hairline. A hairline is a line, and a line is the
 * loudest thing you can put at the bottom of something that is meant to be
 * barely there — it draws the bar's outline for you and turns a pane of glass
 * into a panel bolted to the top of the page.
 *
 * So the glass fades out instead. `fadeFrom` is where along the bar the fade
 * starts, as a fraction: full strength behind the chevron and the title, then
 * away to nothing over a short tail below them, with no edge anywhere. The
 * fade lives inside the header's own height, so nothing on the page moves to
 * make room for it.
 *
 * ── the fallback is opaque, and cannot not be ──
 *
 * `GlassView` is the Liquid Glass API and there is no glass to render before
 * iOS 26. Transparency there would not be glass, it would be a hole: no blur
 * means content slides under the bar at full sharpness and collides with the
 * title. So the fallback stays a solid fill — `FALLBACK` is the colour the bar
 * has always been, the page background with the 6% white glass fill composited
 * onto it, so on an older system the bar looks exactly as it did before and
 * only the blur is missing.
 */

/** #070708 with `glass.bg` (6% white) flattened onto it */
const FALLBACK = '#161617';

export function GlassBar({ fadeFrom }: {
  /**
   * Where the fade begins, 0–1 down the bar. Omit for a bar with a hard bottom
   * edge — nothing in the app wants that today, but a masked layer costs a
   * whole extra compositing pass, so it stays opt-in.
   */
  fadeFrom?: number;
}) {
  const backing = isLiquidGlassAvailable() ? (
    <GlassView
      style={styles.fill}
      glassEffectStyle="clear"
      colorScheme="dark"
      isInteractive={false}
      pointerEvents="none"
    />
  ) : (
    <View style={[styles.fill, styles.solid]} pointerEvents="none" />
  );

  if (fadeFrom == null) return backing;

  return (
    <MaskedView
      style={styles.fill}
      pointerEvents="none"
      maskElement={
        // Alpha only, so the colour is arbitrary. Solid down to `fadeFrom`,
        // then out. The middle stop pulls the ramp below linear: the eye finds
        // the end of a straight ramp easily, and finding it is exactly the
        // edge this exists to get rid of.
        <Svg width="100%" height="100%" preserveAspectRatio="none">
          <Defs>
            <LinearGradient id="barFade" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#fff" stopOpacity={1} />
              <Stop offset={fadeFrom} stopColor="#fff" stopOpacity={1} />
              <Stop offset={fadeFrom + (1 - fadeFrom) * 0.5} stopColor="#fff" stopOpacity={0.4} />
              <Stop offset="1" stopColor="#fff" stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#barFade)" />
        </Svg>
      }>
      {backing}
    </MaskedView>
  );
}

const styles = StyleSheet.create({
  fill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  solid: { backgroundColor: FALLBACK },
});
