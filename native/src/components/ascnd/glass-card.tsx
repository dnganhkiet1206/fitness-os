import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { StyleSheet, View, type ViewProps } from 'react-native';

import { colors, radius, spacing } from '@/constants/ascnd';

/**
 * Card surface. On iOS 26+ this is REAL system Liquid Glass; elsewhere it
 * falls back to the app's dark card surface with a hairline border.
 */
export function GlassCard({ style, children, ...props }: ViewProps) {
  if (isLiquidGlassAvailable()) {
    return (
      <GlassView glassEffectStyle="regular" colorScheme="dark" style={[styles.card, style]} {...props}>
        {children}
      </GlassView>
    );
  }
  return (
    <View style={[styles.card, styles.fallback, style]} {...props}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    padding: spacing.md,
    overflow: 'hidden',
  },
  fallback: {
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
});
