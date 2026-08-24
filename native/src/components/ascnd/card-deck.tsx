import { useState } from 'react';
import { ScrollView, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';

import { colors, radius } from '@/constants/ascnd';

/**
 * Several cards in one slot, swiped between.
 *
 * ── what this replaces ──
 *
 * The hero cards were stacked: the readiness gauge, then the activity rings,
 * then the day's sections underneath. Two full-height cards of the same kind of
 * thing — a ring and a number — spending two screens of vertical room before
 * the page has said anything else, and pushing everything real below the fold.
 *
 * They are one slot now. The same cards, the same order, one at a time.
 *
 * ── why the hero list needed no new setting ──
 *
 * `heroWidgets` was ALREADY the list of ring cards, ordered by the user in edit
 * mode. So the deck's pages are that list, unchanged: nothing is migrated,
 * nothing retired, no new key enters `WidgetKey`, and somebody who adds a third
 * hero gets a third page without this file knowing anything about it.
 *
 * `use-widget-config.ts` explains what the alternative costs — a key written
 * into a stored layout "stays there forever", and removing a card without
 * retiring it left a blank slot and a chip reading a raw identifier. The way to
 * not pay that is to not change the keys.
 *
 * ── the peek is the affordance ──
 *
 * The next card shows at the right edge. Without it this is a card that happens
 * to be swipeable, which on a phone means a card that is not — nothing says a
 * gesture is there, and the pips below could just as easily be decoration. The
 * sliver of a second card says what the pips cannot: there is more, that way.
 */
const PEEK = 26;
const GAP = 10;

/**
 * The pips are all the same size.
 *
 * The first draft widened the active one into a pill, which is the Material
 * idiom — and `tools/motion.mjs` refused it, correctly: that is an animated
 * `width`, a layout property, running on every frame of every swipe. The
 * obvious escape is `scaleX` on a rounded pill, and `progress-bar.tsx` already
 * measured that and rejected it, because scaling one axis of a fully-rounded
 * shape stretches its end caps into ovals.
 *
 * But the rule pointed at the better design rather than a workaround. UIKit's
 * own page control does not resize its dots — same size, and the current one is
 * simply opaque. Equal dots, opacity and a hair of scale: no layout animation,
 * no distorted caps, and it looks like the platform instead of like the other
 * one.
 */
const DOT = 6;

export function CardDeck({ children }: { children: React.ReactNode[] }) {
  const [w, setW] = useState(0);
  const x = useSharedValue(0);

  const pages = children.filter(Boolean);
  const onScroll = useAnimatedScrollHandler((e) => {
    x.value = e.contentOffset.x;
  });

  const measure = (e: LayoutChangeEvent) => {
    const next = e.nativeEvent.layout.width;
    setW((prev) => (Math.abs(prev - next) < 1 ? prev : next));
  };

  /* Nothing to deal. The hero list is user-editable and can be emptied. */
  if (pages.length === 0) return null;

  /* One card needs no deck. Returning it bare rather than as a one-page pager
     keeps a scroll view, a handler and a row of one pip out of the tree for the
     arrangement most people will never leave. */
  if (pages.length === 1) return <>{pages[0]}</>;

  /* Before the first layout there is no page width to give, and '100%' of a
     horizontal scroll view is its own width — so the first card is already
     correct and the rest are stacked behind it at the same size. One frame, and
     it is the frame nobody is swiping in. */
  const pageW = w > 0 ? w - PEEK : 0;
  const step = pageW + GAP;

  return (
    <View onLayout={measure}>
      <Animated.ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        /* Not `pagingEnabled`: that snaps to exactly the scroll view's width,
           which is the one width this cannot use — the page is narrower than
           the deck, because the difference is what the next card shows in. */
        snapToInterval={step > 0 ? step : undefined}
        snapToAlignment="start"
        decelerationRate="fast"
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={styles.track}>
        {pages.map((node, i) => (
          <View key={i} style={[styles.page, pageW > 0 ? { width: pageW } : styles.pageFull]}>
            {node}
          </View>
        ))}
      </Animated.ScrollView>

      <View style={styles.pips}>
        {pages.map((_, i) => (
          <Pip key={i} index={i} step={step} x={x} />
        ))}
      </View>
    </View>
  );
}

/**
 * One pip, brightening and stepping forward as its page arrives — NOT widening.
 *
 * The word matters because widening is what the first draft did and what the
 * note on `DOT` above spends a paragraph rejecting; a comment here promising a
 * width is a comment that sends the next reader looking for a bug in the part
 * that is deliberately correct.
 *
 * Driven by the scroll offset rather than by a settled page index, so it moves
 * with the finger instead of catching up after the release. `swipe-row.tsx`
 * made the same call for the same reason: an indicator that reports the
 * *outcome* of a gesture is a different feeling from one that reports the
 * gesture, and only the second reads as direct manipulation.
 */
function Pip({ index, step, x }: { index: number; step: number; x: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    /* Before the deck is measured every pip would divide by zero; the first is
       the one on screen, so it is the one lit. */
    const near = step > 0 ? Math.abs(x.value / step - index) : Number(index !== 0);
    const t = Math.min(1, near);
    return {
      opacity: interpolate(t, [0, 1], [1, 0.28]),
      /* Transform, not size. 25% of a 6pt dot is 1.5pt — small, but it is the
         difference between a dot that is merely brighter and one that is
         nearer, and the eye reads distance before it reads value. */
      transform: [{ scale: interpolate(t, [0, 1], [1.25, 1]) }],
    };
  });
  return <Animated.View style={[styles.pip, style]} />;
}

const styles = StyleSheet.create({
  track: { gap: GAP },
  /*
    Top-aligned, and the gap below a short page is a real cost that is not
    solved here.

    The deck is as tall as its tallest page and STAYS that height across a
    swipe — a container that resized per page would move every section below it
    while your thumb moved, which is the 94px-hole family `today-meals.tsx`
    measured.

    That leaves shorter pages with slack, and there is no arrangement of this
    file that hides it. Centring was tried and photographed: it splits the slack
    above and below, so the card floats in the middle of the deck instead of
    starting where every other card on the page starts, and it reads worse.
    Top-aligned keeps the cards' top edges agreeing with each other and with the
    rest of the page, and puts all the slack in one place.

    The slack itself comes from the two cards differing by about 150pt, and
    closing it is a change to what those cards CONTAIN — not to how they are
    laid out. Until that is decided, this is the honest arrangement.
  */
  page: { alignSelf: 'flex-start' },
  pageFull: { width: '100%' },
  pips: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5, paddingTop: 10 },
  pip: { width: DOT, height: DOT, borderRadius: radius.full, backgroundColor: colors.foreground },
});
