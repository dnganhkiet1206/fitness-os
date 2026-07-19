import { StyleSheet, View, type ViewProps } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { glass, spacing } from '@/constants/ascnd';

/**
 * Card surface — a faithful match of the web app's `.metric-card` /
 * `.glass-card`: a 6% white glass fill, a 0.5px 12% white hairline border,
 * a 20px radius, and the web's `::before` specular sheen kept very subtle
 * (a soft top glare that fades out). No drop shadow: on the near-black page
 * the web's shadow is essentially invisible, and RN renders shadows as a
 * hard halo on dark, which reads unnatural — the depth comes from the fill,
 * hairline border and sheen, like the web.
 */
export function GlassCard({ style, children, ...props }: ViewProps) {
  return (
    <View style={[styles.card, style]} {...props}>
      {/* Specular sheen — soft top glare, clipped to the rounded corners */}
      <View style={styles.sheen} pointerEvents="none">
        <Svg width="100%" height="100%" preserveAspectRatio="none">
          <Defs>
            <LinearGradient id="glassSheen" x1="0" y1="0" x2="0" y2="0.6">
              <Stop offset="0" stopColor="#ffffff" stopOpacity={0.05} />
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
    backgroundColor: glass.bg,
    borderWidth: glass.borderWidth,
    borderColor: glass.border,
    overflow: 'hidden',
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
