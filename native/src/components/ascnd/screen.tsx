import { ScrollView, StyleSheet, Text, View, type ViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomTabInset } from '@/constants/expo-template-theme';
import { colors, spacing, type } from '@/constants/ascnd';

interface ScreenProps extends ViewProps {
  /** Large title shown at the top (Apple Fitness style) */
  title: string;
  /** Optional line above the title (date, context) */
  eyebrow?: string;
  /** Optional accessory rendered on the right of the large title */
  headerRight?: React.ReactNode;
}

/**
 * Standard scrollable page scaffold: dark surface, safe-area aware,
 * large title, clearance for the native tab bar.
 */
export function Screen({ title, eyebrow, headerRight, children, style, ...props }: ScreenProps) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + spacing.sm, paddingBottom: BottomTabInset + insets.bottom + spacing.lg },
        style,
      ]}
      contentInsetAdjustmentBehavior="never"
      {...props}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
          <Text style={styles.title}>{title}</Text>
        </View>
        {headerRight}
      </View>
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing.md,
    gap: spacing.stack,
  },
  header: {
    marginBottom: spacing.xs,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  eyebrow: {
    ...type.footnote,
    color: colors.mutedForeground,
    textTransform: 'capitalize',
  },
  title: {
    ...type.largeTitle,
    color: colors.foreground,
  },
});
