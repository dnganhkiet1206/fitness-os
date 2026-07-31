import { router, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ChevronLeft } from 'lucide-react-native';
import { useCallback, useRef } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ScrollViewProps,
  type ViewProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ascnd/icon';
import { TopEdgeBlur } from '@/components/ascnd/top-edge-blur';
import { BottomTabInset } from '@/constants/expo-template-theme';
import { colors, glass, spacing, type } from '@/constants/ascnd';
import { setActiveScroller } from '@/lib/scroll-to-top';
import { handleTabScroll } from '@/lib/tab-bar-visibility';

/**
 * ── do not reintroduce `maintainVisibleContentPosition` here ──
 *
 * It was added to all three scroll views in this file to stop pages drifting
 * while they loaded. It did not fix the drift, and it broke scrolling.
 *
 * The drift was never a content-above-the-viewport problem: Today swaps a
 * ~100pt widget placeholder for a 208pt ring gauge the moment the daily log
 * resolves, and that is what moved the page. It is fixed at the source by
 * holding the widgets back until `useDailyLog` settles (`dayPending` in
 * `(tabs)/index.tsx`), so nothing changes height under your thumb.
 *
 * What the prop *did* do is what the user reported as "cuộn không có điểm
 * dừng": on iOS it re-adjusts `contentOffset` on every layout pass, so a page
 * never settles at the end of its content — the scroll keeps being nudged and
 * there is no stop. Applying it blanket-wise to every page in the app made
 * that true everywhere.
 *
 * If a specific page ever genuinely needs anchoring (a chat-style list that
 * prepends), put it on that list, not on this scaffold.
 */

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
  /**
   * Forwarded to the page's ScrollView, along with `scrollEventThrottle`.
   *
   * `ViewProps` does not carry these, and they already reach the ScrollView
   * through `...props` — this only makes them typed. `mascot-room` uses them
   * to stop the studio's clocks once the stage has scrolled out of sight; a
   * page that does not pass them is unaffected.
   */
  onScroll?: ScrollViewProps['onScroll'];
  onScrollBeginDrag?: ScrollViewProps['onScrollBeginDrag'];
  scrollEventThrottle?: number;
}

/**
 * Page scaffold matching the web app's two header patterns.
 */
export function Screen({ title, eyebrow, headerRight, back, transparentHeader, onHeaderHeight, contentScrollEnabled = true, children, style, ...props }: ScreenProps) {
  const insets = useSafeAreaInsets();

  /**
   * Lend this page's scroll view to the tab bar, so tapping the tab you are
   * already on returns to the top. Claimed on focus and released on blur, so
   * the slot always points at the page in front of you — see `scroll-to-top`.
   *
   * Every branch below gets the ref, not just the tab layout: a pushed page is
   * not reachable from the tab bar today, but a scaffold that only sometimes
   * supports its own affordance is the kind of thing that surprises the next
   * person to use it.
   */
  const scroller = useRef<ScrollView>(null);
  useFocusEffect(
    useCallback(() => {
      setActiveScroller(() => scroller.current?.scrollTo({ y: 0, animated: true }));
      return () => setActiveScroller(null);
    }, []),
  );

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
            ref={scroller}
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
          {/* Between the content and the floating header, so the hero softens
              under the notch while the chevron and the title stay sharp. */}
          <TopEdgeBlur />
          <View
            style={[styles.pageHeaderFloat, { paddingTop: insets.top }]}
            pointerEvents="box-none"
            onLayout={(ev) => onHeaderHeight?.(ev.nativeEvent.layout.height)}>
            {headerBar}
          </View>
        </View>
      );
    }

    /*
     * The one layout with no notch blur, on purpose.
     *
     * Here the header is a solid glass bar stacked *above* the scroll view
     * rather than over it — it already owns the safe-area inset, and nothing
     * ever passes under the status bar for a blur to act on. A strip here would
     * have nothing to soften and would only lay a second pane of glass over the
     * first, lightening the bar for no reason.
     */
    return (
      <View style={styles.root}>
        {/* Web PageHeader: glass bar, 44pt, back chevron + centered title */}
        <View style={[styles.pageHeader, { paddingTop: insets.top }]}>{headerBar}</View>
        <ScrollView
          ref={scroller}
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

  /*
   * A tab page scrolls all the way up to the status bar, so it is the layout
   * the notch blur exists for. The scroll view used to be this branch's root;
   * it now sits in a wrapper purely so the strip has somewhere to hang that is
   * not inside the scroll (anything inside would scroll away with the diary).
   */
  return (
    <View style={styles.root}>
      <ScrollView
        ref={scroller}
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
      <TopEdgeBlur />
    </View>
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
