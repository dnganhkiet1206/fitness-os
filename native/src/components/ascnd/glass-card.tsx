import { createContext, useContext } from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { glass, spacing } from '@/constants/ascnd';
import { card as premiumCard } from '@/constants/premium-theme';

/**
 * Which card surface the subtree draws.
 *
 * `false` — the glass recipe every page has always used. This is the default,
 * so all 30-odd screens that render a `GlassCard` are untouched.
 *
 * `true` — the charcoal card from the premium theme, opted into by wrapping a
 * subtree in `PremiumSurface`. A context rather than a prop because the cards
 * on a page are mostly not written by the page: Nutrition renders
 * `NutritionCard`, `QuickStats` and `TodayMeals`, and every card inside them
 * has to change with the page or the test is meaningless. Threading a prop
 * through each of those components would edit files that other screens share,
 * for a theme that may yet be rejected.
 */
const PremiumContext = createContext(false);

/** Draw every `GlassCard` below this as a charcoal premium card. */
export function PremiumSurface({ children }: { children: React.ReactNode }) {
  return <PremiumContext.Provider value={true}>{children}</PremiumContext.Provider>;
}

/**
 * Card surface — a faithful match of the web app's `.metric-card` /
 * `.glass-card`: a 6% white glass fill, a 0.5px 12% white hairline border,
 * a 20px radius, and the web's `::before` specular sheen kept very subtle
 * (a soft top glare that fades out). No drop shadow: on the near-black page
 * the web's shadow is essentially invisible, and RN renders shadows as a
 * hard halo on dark, which reads unnatural — the depth comes from the fill,
 * hairline border and sheen, like the web.
 *
 * Under `PremiumSurface` it draws the charcoal card instead: a solid #1B1C1F
 * fill, a 5% white hairline, and the drop shadow back on. The reasoning for
 * dropping the shadow above was specific to a near-black page — with charcoal
 * underneath there is contrast for a soft shadow to work against, and it is
 * what separates the card from a background that is now much closer in value.
 * The sheen is halved for the same reason: a solid fill needs less help than a
 * translucent one to read as a surface.
 */
export function GlassCard({ style, children, ...props }: ViewProps) {
  const premium = useContext(PremiumContext);

  return (
    <View style={[premium ? styles.premiumCard : styles.card, style]} {...props}>
      {/* Specular sheen — soft top glare, clipped to the rounded corners */}
      <View style={styles.sheen} pointerEvents="none">
        <Svg width="100%" height="100%" preserveAspectRatio="none">
          <Defs>
            <LinearGradient id="glassSheen" x1="0" y1="0" x2="0" y2="0.6">
              <Stop offset="0" stopColor="#ffffff" stopOpacity={premium ? 0.025 : 0.05} />
              <Stop offset="1" stopColor="#ffffff" stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#glassSheen)" />
        </Svg>
      </View>
      {/* Bright inner top edge (--glass-inner-shadow) */}
      <View
        style={[styles.topLine, premium && { backgroundColor: premiumCard.highlight }]}
        pointerEvents="none"
      />
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
  premiumCard: {
    borderRadius: glass.radius,
    padding: spacing.card,
    backgroundColor: premiumCard.bg,
    borderWidth: glass.borderWidth,
    borderColor: premiumCard.border,
    overflow: 'hidden',
    // Soft and wide, with no offset — a card lifted off the page, not lit from
    // one side. `overflow: hidden` clips the children, never the shadow.
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  sheen: {
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
