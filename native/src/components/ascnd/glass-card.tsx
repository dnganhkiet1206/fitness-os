import { StyleSheet, View, type ViewProps, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { glass, spacing } from '@/constants/ascnd';

/**
 * Card surface — a soft top-to-bottom gradient, a hairline border, a lit top
 * edge, and an ambient shadow under it.
 *
 * ── it used to be glass, and there was a note here about why it had no shadow ──
 *
 * The fill was 6 % white over the page, matching the web's `.glass-card`, and
 * the comment that lived here said a drop shadow was pointless: on a near-black
 * page the web's shadow is invisible and React Native draws one as a hard halo.
 * That was true *of that fill*. A card six per cent lighter than the page it
 * sits on has no edge for a shadow to sit under.
 *
 * The fill is opaque now — `#2B2B2B` at the top falling to `#202020` — which is
 * thirty-odd levels above the page rather than six, and that edge is what gives
 * a shadow something to do. The objection is answered rather than ignored: what
 * made it wrong before was the surface, not the shadow.
 *
 * It is an *ambient* shadow and the numbers say so — a wide radius, low
 * opacity, a small offset. A tight dark one under a card is the halo that note
 * warned about; a wide faint one is the room the card sits in.
 *
 * ── the wrapper, and why `style` is split across it ──
 *
 * `overflow: 'hidden'` sets `masksToBounds` on iOS, and a layer that masks to
 * its bounds cannot cast a shadow. The card needs that clip for its gradient
 * and its rounded corners, so the shadow has to live on a view outside it.
 *
 * That leaves the incoming `style`, which a hundred call sites pass and which
 * is almost always *content* layout — `gap`, `padding`, `flexDirection`. Those
 * belong on the card. A handful set the card's own box instead: `width: 47.5%`
 * in `sleep-insights.tsx`, `marginBottom` in `koa-sheet.tsx`. Those belong on
 * the wrapper, or the width resolves against the wrong parent and the shadow is
 * cast from a box bigger than the card it is under.
 *
 * So the style is split by key rather than by guess. `OUTER_KEYS` is every
 * property that positions or sizes the box itself; everything else falls
 * through to the card, which is where all of it went before this file grew a
 * wrapper.
 */

/** properties that belong to the card's own box, not to what is inside it */
const OUTER_KEYS = [
  'margin',
  'marginTop',
  'marginRight',
  'marginBottom',
  'marginLeft',
  'marginHorizontal',
  'marginVertical',
  'width',
  'minWidth',
  'maxWidth',
  'height',
  'minHeight',
  'maxHeight',
  'flex',
  'flexGrow',
  'flexShrink',
  'flexBasis',
  'alignSelf',
  'position',
  'top',
  'right',
  'bottom',
  'left',
  'zIndex',
] as const;

export function GlassCard({ style, children, ...props }: ViewProps) {
  const flat = (StyleSheet.flatten(style) ?? {}) as Record<string, unknown>;
  const outer: Record<string, unknown> = {};
  const inner: Record<string, unknown> = { ...flat };
  for (const k of OUTER_KEYS) {
    if (flat[k] !== undefined) {
      outer[k] = flat[k];
      delete inner[k];
    }
  }

  return (
    <View style={[styles.shadow, outer as ViewStyle]}>
      <View style={[styles.card, inner as ViewStyle]} {...props}>
        {/* The surface, painted under everything. The old specular sheen has
            gone into it — a white glare on top of an opaque fill only lifts the
            top back past the colour the gradient just set it to. */}
        <View style={styles.fill} pointerEvents="none">
          <Svg width="100%" height="100%" preserveAspectRatio="none">
            <Defs>
              <LinearGradient id="glassFill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={glass.top} />
                <Stop offset="1" stopColor={glass.bottom} />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#glassFill)" />
          </Svg>
          {/* the lit top edge, inside the clip so it stops at the corners */}
          <View style={styles.topLine} />
        </View>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shadow: {
    borderRadius: glass.radius,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: glass.shadowY },
    shadowOpacity: glass.shadowOpacity,
    shadowRadius: glass.shadowRadius,
    elevation: glass.elevation,
  },
  card: {
    borderRadius: glass.radius,
    padding: spacing.card,
    backgroundColor: glass.top,
    borderWidth: glass.borderWidth,
    borderColor: glass.border,
    overflow: 'hidden',
  },
  fill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: glass.radius,
    overflow: 'hidden',
    /**
     * Behind the content, explicitly.
     *
     * Being the first child is not enough. A positioned element paints above
     * every *unpositioned* sibling whatever the DOM order, and a `lucide` icon
     * renders as a bare `<svg>` with no position of its own — so an opaque
     * absolute fill swallowed the icons and left the text, which React Native
     * Web gives `position: relative`, sitting on top. Half a card's contents
     * vanishing is not a subtle failure, but it only shows on the cards that
     * happen to contain an icon.
     */
    zIndex: -1,
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
