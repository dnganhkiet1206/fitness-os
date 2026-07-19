import { StyleSheet, View, type ViewProps } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { glass, spacing } from '@/constants/ascnd';

/**
 * Card surface — a faithful match of the web app's `.metric-card` /
 * `.glass-card`:
 *   - 6% white glass fill (rendered opaque here, see glass.solidBg)
 *   - 0.5px 12% white hairline border, 20px radius
 *   - the `::before` specular sheen: linear-gradient(170deg,
 *     rgba(255,255,255,0.08) 0%, transparent 40%) — a soft top glare
 *   - a faint bright line along the top inner edge (--glass-inner-shadow)
 *   - the soft drop shadow: 0 8px 32px rgba(0,0,0,0.4)
 *
 * The sheen is drawn with react-native-svg (no native blur is needed — a
 * card only sits over the flat background, so a backdrop blur is a no-op).
 */
export function GlassCard({ style, children, ...props }: ViewProps) {
  return (
    <View style={[styles.card, style]} {...props}>
      {/* Specular sheen, clipped to the rounded corners */}
      <View style={styles.sheen} pointerEvents="none">
        <Svg width="100%" height="100%" preserveAspectRatio="none">
          <Defs>
            {/* 170deg ≈ near-vertical, leaning slightly left; bright at the
                top fading out by ~45% down */}
            <LinearGradient id="glassSheen" x1="0.08" y1="0" x2="0" y2="0.55">
              <Stop offset="0" stopColor="#ffffff" stopOpacity={0.08} />
              <Stop offset="1" stopColor="#ffffff" stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#glassSheen)" />
        </Svg>
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
    backgroundColor: glass.solidBg,
    borderWidth: glass.borderWidth,
    borderColor: glass.border,
    // web: box-shadow 0 8px 32px rgba(0,0,0,0.4)
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 16,
    shadowOpacity: 0.45,
    elevation: 8,
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
