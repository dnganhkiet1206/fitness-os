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
import { Icon } from '@/components/ascnd/icon';
import { StatusScrim } from '@/components/ascnd/status-scrim';
import { BottomTabInset } from '@/constants/expo-template-theme';
import { useI18n } from '@/hooks/use-app-settings';
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

/**
 * ── do not put `automaticallyAdjustKeyboardInsets` back on these ──
 *
 * It was on all three scroll views, and it is what made pages scroll on past
 * the end of their content into empty space.
 *
 * On iOS it works by adding to the scroll view's bottom `contentInset` when
 * the keyboard appears, and it does not survive
 * `contentInsetAdjustmentBehavior="never"` — which every branch here sets,
 * because these pages lay out their own safe-area padding. The inset it adds
 * is not reliably taken back off, so each appearance of the keyboard leaves
 * more room below the content to scroll into.
 *
 * It was first narrowed to the six pages that have a text input, on the
 * assumption that the other nineteen were collateral. Nutrition was one of the
 * six and went on doing it, which is what settled the question: the prop is
 * the fault, not the number of pages carrying it.
 *
 * What is lost: nothing scrolls itself up when the keyboard covers it. Every
 * text field on these pages sits near the top — a search box under the tab
 * bar, the first field of a short form — so none of them are behind it. If a
 * form ever grows long enough for that to stop being true, wrap that form's
 * fields in a `KeyboardAvoidingView`; do not put this prop back on the
 * scaffold.
 */

/**
 * Height of the fixed header bar, matching UIKit's navigation bar.
 *
 * Only the bar's own height now — while the bar overlaid the content this also
 * had to be the content's top padding, and the two had to agree. It stays a
 * constant because a magic 44 in a stylesheet is a number nobody can look up.
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
  /**
   * Set false to lock the page while something on it is being dragged.
   *
   * It used to be honoured only by the floating-header layout, which made it a
   * prop that silently did nothing on every other page. The weight chart's
   * scrubber is why that mattered: on iOS a ScrollView pans with a *native*
   * gesture recogniser, so a child refusing to give up the JS responder does
   * not stop it. Nothing in the responder system can. The page has to be told.
   */
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
  const i18n = useI18n();

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
          accessibilityRole="button"
          accessibilityLabel={i18n.a11yBack}
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
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            {...props}>
            {children}
          </ScrollView>
          {/*
            The hero runs under the clock here by design, so this is the one
            sub-page layout that needs the strip. It sits under the floating
            header (zIndex 10 against 20), so the chevron and title stay crisp
            on top of it.
          */}
          <StatusScrim />
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
     * Sub-page header — a solid bar above the scroll view, in layout flow.
     *
     * It briefly overlaid the content instead, with a blur behind it so text
     * softened as it slid underneath. The blur is gone, and an overlaying bar
     * with nothing behind it is just a title with content running through it,
     * so the bar owns its 44pt again and the page starts below it.
     */
    return (
      <View style={styles.root}>
        <AmbientLight />
        {/* Web PageHeader: glass bar, 44pt, back chevron + centered title */}
        <View style={[styles.pageHeader, { paddingTop: insets.top }]}>{headerBar}</View>
        <ScrollView
          ref={scroller}
          style={styles.scroller}
          contentContainerStyle={[styles.subContent, { paddingBottom: insets.bottom + spacing.xl }, style]}
          contentInsetAdjustmentBehavior="never"
          scrollEnabled={contentScrollEnabled}
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
   * `StatusScrim` exists for. The scroll view used to be this branch's root; it
   * sits in a wrapper so the light and the strip have somewhere to hang that is
   * not inside the scroll — anything inside would scroll away with the content.
   *
   * The strip is the wrapper's *last* child on purpose. Order is what stacks
   * siblings in React Native, and `zIndex` only reorders within the same
   * parent, so a strip written above the ScrollView would be painted under it
   * and cover nothing at all.
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
        scrollEnabled={contentScrollEnabled}
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
      <StatusScrim />
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

  // Sub-page header (web PageHeader)
  pageHeader: {
    backgroundColor: glass.bg,
    borderBottomWidth: glass.borderWidth,
    borderBottomColor: glass.border,
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
