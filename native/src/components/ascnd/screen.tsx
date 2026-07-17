import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ChevronLeft } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, Text, View, type ViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ascnd/icon';
import { BottomTabInset } from '@/constants/expo-template-theme';
import { colors, glass, spacing, type } from '@/constants/ascnd';
import { handleTabScroll } from '@/lib/tab-bar-visibility';

interface ScreenProps extends ViewProps {
  title: string;
  /** Optional line above the large title (date, context) */
  eyebrow?: string;
  /** Accessory rendered on the right of the header */
  headerRight?: React.ReactNode;
  /**
   * Sub-page mode — mirrors the web PageHeader: fixed 44pt bar with a
   * back chevron on the left and the 17px semibold title centered.
   * Tabs keep the large-title layout (web LargeTitle).
   */
  back?: boolean;
}

/**
 * Page scaffold matching the web app's two header patterns.
 */
export function Screen({ title, eyebrow, headerRight, back, children, style, ...props }: ScreenProps) {
  const insets = useSafeAreaInsets();

  if (back) {
    return (
      <View style={styles.root}>
        {/* Web PageHeader: glass bar, 44pt, back chevron + centered title */}
        <View style={[styles.pageHeader, { paddingTop: insets.top }]}>
          <View style={styles.pageHeaderRow}>
            <Pressable
              hitSlop={8}
              style={({ pressed }) => [styles.backBtn, pressed && styles.backPressed]}
              onPress={() => {
                Haptics.selectionAsync();
                router.back();
              }}>
              <Icon icon={ChevronLeft} size={22} color={colors.primary} />
            </Pressable>
            <Text style={styles.pageTitle} numberOfLines={1}>{title}</Text>
            <View style={styles.pageHeaderRight}>{headerRight}</View>
          </View>
        </View>
        <ScrollView
          style={styles.scroller}
          contentContainerStyle={[styles.subContent, { paddingBottom: insets.bottom + spacing.xl }, style]}
          contentInsetAdjustmentBehavior="never"
          {...props}>
          {children}
        </ScrollView>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.scroller}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + spacing.sm, paddingBottom: BottomTabInset + insets.bottom + spacing.lg },
        style,
      ]}
      contentInsetAdjustmentBehavior="never"
      onScroll={(e) => handleTabScroll(e.nativeEvent.contentOffset.y)}
      scrollEventThrottle={16}
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
  root: { flex: 1, backgroundColor: colors.background },
  scroller: { flex: 1, backgroundColor: colors.background },

  // Sub-page header (web PageHeader)
  pageHeader: {
    backgroundColor: glass.bg,
    borderBottomWidth: glass.borderWidth,
    borderBottomColor: glass.border,
  },
  pageHeaderRow: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  backPressed: { opacity: 0.6, transform: [{ scale: 0.88 }] },
  pageTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.2,
    color: colors.foreground,
    textAlign: 'center',
  },
  pageHeaderRight: {
    minWidth: 44,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingRight: spacing.sm,
  },
  subContent: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.stack,
    gap: spacing.stack,
  },

  // Tab-page large title (web LargeTitle)
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
  headerText: { flex: 1, gap: 2 },
  eyebrow: { ...type.footnote, color: colors.mutedForeground, textTransform: 'capitalize' },
  title: { ...type.largeTitle, color: colors.foreground },
});
