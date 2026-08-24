import { useState } from 'react';
import { BlurView } from 'expo-blur';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';

import { colors, radius } from '@/constants/ascnd';

/**
 * The ring cards, one at a time, swiped between — and the page's colour comes
 * with them.
 *
 * ── what this stopped being, and why ──
 *
 * It was a STACK: cards layered, each lifted above the one in front, edges
 * peeking. That was read off an App Store montage, and it cost something the
 * screenshots then measured. A stack has to occlude — a card must hide the ones
 * behind it — so every card needed an opaque backing. With the deck moved to
 * the top of Today and the readiness aura behind it, that backing covered the
 * aura: measured on the shipped build, the day's colour survived in a 55px
 * strip above the card and everything below it was `rgb(44,44,46)`, flat grey.
 *
 * An opaque card and a coloured page are exclusive. The reference has the ring
 * ON the colour, so the cards are separate pages now — side by side, clipped,
 * never overlapping. Nothing needs to hide anything, so nothing needs to be
 * opaque, so the aura reaches the glass.
 *
 * ── the colour follows the swipe ──
 *
 * `progress` is owned by the caller, not by this component. That is the whole
 * mechanism: Today creates it, hands it here, and reads it to cross-fade one
 * aura layer per page. The alternative — an `onPage` callback firing when the
 * swipe settles — would change the background AFTER the card had arrived, and
 * a background that catches up is worse than one that does not move.
 *
 * ── the gesture ──
 *
 * `Gesture.Pan` rather than a scroll view. `swipe-row.tsx` explains why that is
 * normally the wrong call — it means owning the conflict with the vertical
 * scroll rather than getting it for free — and it is right here because these
 * pages are absolutely positioned in one clipped box, so there is no scrollable
 * content for a scroll view to hold. The conflict is handled the way the
 * platform does it, by direction: the pan must travel sideways before it
 * activates and gives up entirely if the finger goes vertical first.
 *
 * And this needs `GestureHandlerRootView` at the app root or it throws on
 * mount. `tools/gesture-root.mjs` is the rule; it exists because the web
 * screenshot runner cannot see that crash.
 */

/** Past this fraction of the deck's width, the release commits to the next page. */
const COMMIT = 0.28;

/** Sideways travel before the pan takes the gesture from the page's scroll. */
const HYSTERESIS = 12;

const DOT = 6;

export function CardDeck({
  children,
  progress,
}: {
  children: React.ReactNode[];
  /** Where the deck is, as a float index. Pass one in to drive something else
   *  from the same swipe — Today drives the background colour off it. */
  progress?: SharedValue<number>;
}) {
  const pages = children.filter(Boolean);
  const [w, setW] = useState(0);
  const [h, setH] = useState(0);

  const own = useSharedValue(0);
  const at = progress ?? own;
  const from = useSharedValue(0);

  const last = pages.length - 1;

  const pan = Gesture.Pan()
    .activeOffsetX([-HYSTERESIS, HYSTERESIS])
    .failOffsetY([-HYSTERESIS, HYSTERESIS])
    .onBegin(() => {
      from.value = at.value;
    })
    .onUpdate((e) => {
      const span = w > 0 ? w : 1;
      const next = from.value - e.translationX / span;
      /* Soft past either end: the page still moves, a third as far, so the deck
         answers the finger instead of feeling stuck. */
      at.value = next < 0 ? next / 3 : next > last ? last + (next - last) / 3 : next;
    })
    .onEnd((e) => {
      const span = w > 0 ? w : 1;
      const moved = -e.translationX / span;
      const flung = Math.abs(e.velocityX) > 550;
      const step = flung || Math.abs(moved) > COMMIT ? Math.sign(moved) : 0;
      const target = Math.min(last, Math.max(0, Math.round(from.value) + step));
      at.value = withSpring(target, { damping: 22, stiffness: 190, mass: 0.7 });
    });

  const measureW = (e: LayoutChangeEvent) => {
    const next = e.nativeEvent.layout.width;
    setW((prev) => (Math.abs(prev - next) < 1 ? prev : next));
  };

  /* The tallest page sets the height, and it only ever grows: a card that
     renders short for a frame while its data lands would otherwise pull the
     deck up and drop everything below it. */
  const measureH = (e: LayoutChangeEvent) => {
    const next = e.nativeEvent.layout.height;
    setH((prev) => (next > prev + 0.5 ? next : prev));
  };

  if (pages.length === 0) return null;

  /* One page is not a deck: no gesture, no pips, no clipped box around a
     carousel that cannot move. */
  if (pages.length === 1) return <>{pages[0]}</>;

  return (
    <View onLayout={measureW}>
      <GestureDetector gesture={pan}>
        <View style={[styles.stage, h > 0 ? { height: h } : null]}>
          {pages.map((node, i) => (
            <Page key={i} index={i} at={at} width={w} onHeight={measureH}>
              {node}
            </Page>
          ))}
        </View>
      </GestureDetector>

      <View style={styles.pips}>
        {pages.map((_, i) => (
          <Pip key={i} index={i} at={at} />
        ))}
      </View>
    </View>
  );
}

/** One page, parked a full deck-width away for every step it is from the front. */
function Page({
  index,
  at,
  width,
  onHeight,
  children,
}: {
  index: number;
  at: SharedValue<number>;
  width: number;
  onHeight: (e: LayoutChangeEvent) => void;
  children: React.ReactNode;
}) {
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: (index - at.value) * (width || 1) }],
  }));
  return (
    <Animated.View style={[styles.page, style]}>
      {/*
        Một dải kính PHẲNG, không phải một cái thẻ.

        `LiquidGlass` có viền và một mặt sáng chéo — đó là thứ làm một tấm kính
        trông NỔI LÊN khỏi trang, và ở đây hero không nổi lên khỏi trang: nó
        chạm hai mép và là phần trên cùng của chính trang đó. Nên chỉ có
        `BlurView` trần: không viền, không bo góc, không gradient bắt sáng.

        Blur chứ không phải một lớp phủ mờ, vì thứ nằm sau nó là aura có MÀU và
        màu đó đổi khi bạn vuốt. `liquid-glass.tsx` đã đo chuyện này: "a flat
        white fill over moving colour is a sheet of tracing paper: the light
        goes under it and nothing comes through."
      */}
      <BlurView intensity={18} tint="dark" style={StyleSheet.absoluteFill} />
      <View onLayout={onHeight}>{children}</View>
    </Animated.View>
  );
}

/**
 * One pip, brightening and stepping forward as its page arrives — NOT widening.
 *
 * The word matters because widening is what a first draft did and what
 * `tools/motion.mjs` refused: an animated `width` is a layout property running
 * on every frame of every swipe, and the obvious escape — `scaleX` on a rounded
 * pill — is the thing `progress-bar.tsx` already measured and rejected, because
 * scaling one axis of a fully-rounded shape pulls its end caps into ovals.
 * UIKit's own page control does not resize its dots either.
 */
function Pip({ index, at }: { index: number; at: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const t = Math.min(1, Math.abs(at.value - index));
    return {
      opacity: interpolate(t, [0, 1], [1, 0.28]),
      transform: [{ scale: interpolate(t, [0, 1], [1.25, 1]) }],
    };
  });
  return <Animated.View style={[styles.pip, style]} />;
}

const styles = StyleSheet.create({
  /* Clipped, and that is what replaces the opaque backing the stack needed: a
     page one step away sits a full width to the side and is simply cut off, so
     no card has to paint over another and none of them has to be solid. */
  stage: { position: 'relative', overflow: 'hidden' },
  page: { position: 'absolute', left: 0, right: 0, top: 0 },
  pips: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5, paddingTop: 12 },
  pip: { width: DOT, height: DOT, borderRadius: radius.full, backgroundColor: colors.foreground },
});
