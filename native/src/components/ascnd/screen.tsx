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

import { AmbientLight } from '@/components/ascnd/ambient-light';
import { GlassBar } from '@/components/ascnd/glass-bar';
import { Icon } from '@/components/ascnd/icon';
import { BottomTabInset } from '@/constants/expo-template-theme';
import { colors, spacing, type } from '@/constants/ascnd';
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

/**
 * Height of the fixed header bar, matching UIKit's navigation bar.
 *
 * Named because it is now load-bearing in two places at once: the bar's own
 * height, and the top padding the content needs to clear it. The two are the
 * same number by definition — a literal in each place is a number that can
 * drift, and a sub-page whose first card hides under the bar is not obviously
 * a padding bug when you look at it.
 */
const HEADER_H = 44;

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
          <AmbientLight />
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
          <GlassBar height={insets.top} />
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
     * Sub-page header — a real glass bar the content scrolls underneath.
     *
     * It used to sit *above* the scroll view in the layout flow, holding its
     * own 44pt of space with a 6% white fill. That fill looked like frosted
     * glass only because nothing was ever behind it: the page simply started
     * below the bar, so there was nothing to frost. It also meant these pages
     * were the one place in the app where nothing passed under the status bar,
     * and so the one place with no notch treatment at all.
     *
     * Now the bar overlays the content, and `GlassBar` puts a real backdrop
     * blur across the status bar band above it, so what scrolls up past the
     * Dynamic Island softens instead of running into it sharp. Every layout
     * uses the same pane at the same height — the header simply happens to
     * have a chevron and a title below it.
     *
     * Nothing moves. The content's top padding gains exactly the height the bar
     * used to occupy in flow (`insets.top + HEADER_H`), so every sub-page opens
     * looking identical to before; the difference only appears once you scroll.
     */
    const headerH = insets.top + HEADER_H;
    return (
      <View style={styles.root}>
        <AmbientLight />
        <ScrollView
          ref={scroller}
          style={styles.scroller}
          contentContainerStyle={[
            styles.subContent,
            { paddingTop: headerH + spacing.stack, paddingBottom: insets.bottom + spacing.xl },
            style,
          ]}
          contentInsetAdjustmentBehavior="never"
          // Keep the scroll bar out from under the bar it would run beneath
          scrollIndicatorInsets={{ top: headerH }}
          automaticallyAdjustKeyboardInsets
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          {...props}>
          {children}
        </ScrollView>
        {/* Web PageHeader: glass bar, 44pt, back chevron + centered title */}
        <View style={[styles.pageHeader, { paddingTop: insets.top }]} pointerEvents="box-none">
          <GlassBar height={insets.top} />
          {headerBar}
        </View>
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
      <AmbientLight />
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
      <GlassBar height={insets.top} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  /**
   * Transparent, not `colors.background`.
   *
   * The wrapper behind it already paints the page colour, so this would only
   * be painting it a second time — and painting over anything the scaffold
   * ever puts between the two. Nothing looks different; there is one fewer
   * opaque layer in the way.
   */
  scroller: { flex: 1, backgroundColor: 'transparent' },

  /**
   * Sub-page header (web PageHeader) — overlays the content. No background of
   * its own: `GlassBar` covers the status bar band at the top of it, and the
   * chevron and title below that sit on the page.
   *
   * No bottom border. The glass fades out over its last stretch instead, and a
   * hairline across that fade would put back exactly the edge the fade exists
   * to remove. `overflow` is left alone for the same reason: clipping is an
   * edge too.
   */
  pageHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
  },
  pageHeaderRow: {
    height: HEADER_H,
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
