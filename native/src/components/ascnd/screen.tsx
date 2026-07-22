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
  /**
   * Floating header — the 44pt bar (back chevron + title + accessory) is
   * transparent and overlays the content, which starts at the very top so a
   * full-bleed hero can render behind it. Title/chevron get a shadow for
   * legibility. Requires `back`.
   */
  transparentHeader?: boolean;
  /** report the header height (insets.top + 44) so content can offset under it */
  onHeaderHeight?: (h: number) => void;
  /** transparentHeader only — set false to lock page scroll (e.g. while a
   *  fixed game surface at the top is being touched) */
  contentScrollEnabled?: boolean;
}

/**
 * Page scaffold matching the web app's two header patterns.
 */
export function Screen({ title, eyebrow, headerRight, back, transparentHeader, onHeaderHeight, contentScrollEnabled = true, children, style, ...props }: ScreenProps) {
  const insets = useSafeAreaInsets();

  if (back) {
    const headerBar = (
      <View style={styles.pageHeaderRow}>
        <Pressable
          hitSlop={8}
          style={({ pressed }) => [styles.backBtn, pressed && styles.backPressed]}
          onPress={() => {
            Haptics.selectionAsync();
            router.back();
          }}>
          <Icon icon={ChevronLeft} size={22} color={transparentHeader ? '#fff' : colors.primary} />
        </Pressable>
        <Text style={[styles.pageTitle, transparentHeader && styles.pageTitleFloat]} numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.pageHeaderRight}>{headerRight}</View>
      </View>
    );

    if (transparentHeader) {
      // Header floats over a full-bleed hero; content starts at the very top.
      return (
        <View style={styles.root}>
          <ScrollView
            style={styles.scroller}
            contentContainerStyle={[styles.subContentFlush, { paddingBottom: insets.bottom + spacing.xl }, style]}
            contentInsetAdjustmentBehavior="never"
            scrollEnabled={contentScrollEnabled}
            automaticallyAdjustKeyboardInsets
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            {...props}>
            {children}
          </ScrollView>
          <View
            style={[styles.pageHeaderFloat, { paddingTop: insets.top }]}
            pointerEvents="box-none"
            onLayout={(ev) => onHeaderHeight?.(ev.nativeEvent.layout.height)}>
            {headerBar}
          </View>
        </View>
      );
    }

    return (
      <View style={styles.root}>
        {/* Web PageHeader: glass bar, 44pt, back chevron + centered title */}
        <View style={[styles.pageHeader, { paddingTop: insets.top }]}>{headerBar}</View>
        <ScrollView
          style={styles.scroller}
          contentContainerStyle={[styles.subContent, { paddingBottom: insets.bottom + spacing.xl }, style]}
          contentInsetAdjustmentBehavior="never"
          automaticallyAdjustKeyboardInsets
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
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
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
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
  pageTitleFloat: {
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  pageHeaderFloat: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    backgroundColor: 'transparent',
  },
  subContentFlush: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.stack,
    gap: spacing.stack,
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
