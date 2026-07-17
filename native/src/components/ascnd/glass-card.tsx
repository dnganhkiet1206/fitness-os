import { StyleSheet, View, type ViewProps } from 'react-native';

import { glass, spacing } from '@/constants/ascnd';

/**
 * Card surface — a faithful match of the web app's `.metric-card` /
 * `.glass-card`: a 6% white overlay, a 0.5px 12% white hairline border,
 * a 20px radius, and a faint bright line along the top inner edge (the
 * web's `--glass-inner-shadow`/specular). No native blur is used because
 * the card sits over a flat near-black background, so a backdrop blur
 * would be a visual no-op.
 */
export function GlassCard({ style, children, ...props }: ViewProps) {
  return (
    <View style={[styles.card, style]} {...props}>
      <View style={styles.highlight} pointerEvents="none" />
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
  highlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: glass.highlight,
  },
});
