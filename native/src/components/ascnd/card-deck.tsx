import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';

import { colors, glass, radius } from '@/constants/ascnd';

/**
 * The ring cards as a deck you deal through, not a row you scroll.
 *
 * ── what the reference actually shows ──
 *
 * The first version of this was a horizontal carousel: pages side by side, the
 * next one peeking at the right edge. It worked, and it was the wrong shape.
 * The picture it was meant to match has the cards LAYERED — each one behind the
 * front card and lifted a little above it, so you see three top edges before
 * you see anything else. A carousel says "there is more, to the right"; a stack
 * says "these are the same kind of thing, and there are three of them", which
 * is what a group of rings is.
 *
 * ── why the stack solves what the carousel could not ──
 *
 * The carousel had a gap nothing could hide: the deck was as tall as the
 * tallest page, so a shorter card ended partway down and left background under
 * it. Cards were tried top-aligned and centred, photographed both ways, and
 * both read as a card that failed to fill its space.
 *
 * Stacked, the slack is not empty any more — it is where the other cards are.
 * The lift zone at the top holds the edges of the cards behind, and the front
 * card sits under them at its own height. Nothing is stretched, nothing floats.
 *
 * ── the gesture ──
 *
 * `Gesture.Pan` rather than a ScrollView, and `swipe-row.tsx` explains why that
 * is normally the wrong call — it means owning the conflict with the vertical
 * scroll rather than getting it for free. It is right here because a stack has
 * no scrollable content: the cards are in one place, on top of each other, and
 * there is no offset for a scroll view to hold. The conflict is handled the way
 * the platform does it, by direction: the pan has to travel sideways before it
 * activates, and it gives up entirely if the finger goes vertical first.
 */

/**
 * How far each card behind rises above the one in front of it.
 *
 * 11 first, and the screenshot said it was not enough: every card here is the
 * same dark surface, so unlike the reference — where the cards behind are other
 * COLOURS and separate themselves — the only thing distinguishing one edge from
 * the next is the sliver itself. 15 gives each edge enough height to read as a
 * card rather than as a thicker border, and two of them still cost only 30pt.
 */
const LIFT = 15;

/** And how much narrower it is, so the lift reads as depth and not as a list. */
const SHRINK = 0.045;

/**
 * Two visible behind, however many pages there are.
 *
 * A fourth edge adds no information — it is the same sliver again — and every
 * card behind is a real card being laid out and drawn. The ones past this are
 * parked in the same place as the last visible one and faded out, so a deck of
 * six costs the same on screen as a deck of three.
 */
const BEHIND = 2;

/** Past this fraction of the deck's width, the release commits to the next card. */
const COMMIT = 0.28;

/** Sideways travel before the pan takes the gesture from the page's scroll. */
const HYSTERESIS = 12;

const DOT = 6;

export function CardDeck({ children }: { children: React.ReactNode[] }) {
  const pages = children.filter(Boolean);
  const [w, setW] = useState(0);
  const [h, setH] = useState(0);

  /** Where the deck is, as a float index — 1.4 means "between the second and third". */
  const at = useSharedValue(0);
  const from = useSharedValue(0);

  const last = pages.length - 1;

  const pan = Gesture.Pan()
    /* Sideways only, and only after it has meant it. Today is a long vertical
       scroll and this sits near the top of it, so a pan that grabbed on the
       first pixel would steal every flick that started on a card. */
    .activeOffsetX([-HYSTERESIS, HYSTERESIS])
    .failOffsetY([-HYSTERESIS, HYSTERESIS])
    .onBegin(() => {
      from.value = at.value;
    })
    .onUpdate((e) => {
      const span = w > 0 ? w : 1;
      const next = from.value - e.translationX / span;
      /* Clamped with a soft edge: past either end the card still moves, a
         third as far, so the deck answers the finger instead of feeling stuck. */
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

  /* The tallest card sets the deck's height, and it only ever grows: a card
     that briefly renders short while its data lands would otherwise pull the
     whole deck up and drop the page below it. */
  const measureH = (e: LayoutChangeEvent) => {
    const next = e.nativeEvent.layout.height;
    setH((prev) => (next > prev + 0.5 ? next : prev));
  };

  if (pages.length === 0) return null;

  /* One card is not a deck. No gesture, no pips, no lift zone reserved above a
     stack that does not exist. */
  if (pages.length === 1) return <>{pages[0]}</>;

  const lift = LIFT * BEHIND;

  return (
    <View onLayout={measureW}>
      <GestureDetector gesture={pan}>
        <View style={[styles.stage, h > 0 ? { height: h + lift } : null]}>
          {/* Painted back-to-front: the last page is drawn first so the first
              page ends up on top, which is what an index of 0 should mean.
              Doing it with z-index instead would be an animated layout property
              on every frame of every swipe. */}
          {pages
            .map((node, i) => ({ node, i }))
            .reverse()
            .map(({ node, i }) => (
              <Card key={i} index={i} at={at} width={w} top={lift} onHeight={measureH}>
                {node}
              </Card>
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

/**
 * One card in the stack.
 *
 * `d` is how far behind the front this card is: 0 is the one you are reading, 1
 * and 2 are the edges above it, and a negative `d` is a card you have already
 * swiped past, which leaves to the left.
 */
function Card({
  index,
  at,
  width,
  top,
  onHeight,
  children,
}: {
  index: number;
  at: SharedValue<number>;
  width: number;
  top: number;
  onHeight: (e: LayoutChangeEvent) => void;
  children: React.ReactNode;
}) {
  const style = useAnimatedStyle(() => {
    const d = index - at.value;

    if (d < 0) {
      /* Gone forward. It slides out to the left and fades, and it keeps
         travelling a little past the edge so the corner does not sit visible
         against the screen border. */
      return {
        opacity: Math.max(0, 1 + d * 1.6),
        transform: [{ translateX: d * (width || 1) * 1.05 }, { translateY: 0 }, { scale: 1 }],
      };
    }

    /* Behind. Capped so a deck of six looks like a deck of three: everything
       past the last visible slot is parked there and faded out. */
    const depth = Math.min(d, BEHIND);
    return {
      opacity: interpolate(d, [BEHIND, BEHIND + 1], [1, 0], 'clamp'),
      transform: [
        { translateX: 0 },
        { translateY: -depth * LIFT },
        { scale: 1 - depth * SHRINK },
      ],
    };
  });

  return (
    <Animated.View style={[styles.card, { top }, style]}>
      <View onLayout={onHeight}>{children}</View>
    </Animated.View>
  );
}

/**
 * One pip, brightening and stepping forward as its card arrives — NOT widening.
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
  /* The stage reserves the lift zone at the top; the front card starts below it
     and the cards behind rise into it. Without the reservation the top edges
     would be clipped by whatever sits above the deck. */
  stage: { position: 'relative' },
  /*
    Each card carries an OPAQUE backing, and without it the stack does not work
    at all.

    `GlassCard` is translucent by design — that is the whole surface language of
    this app. Stacked, that meant the card behind was not behind anything: the
    activity rings and their numbers read straight through the readiness card
    sitting on top of them, two sets of text in the same place. The screenshot
    was unreadable.

    So the slot under each card is filled with the page's own card colour, at
    the same radius, and clipped to it. The glass still does its job against
    that backing — it is the same colour the card would have been sitting on
    anyway — and a card now hides the ones behind it, which is the one thing a
    stack has to do.
  */
  card: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: colors.card,
    borderRadius: glass.radius,
    overflow: 'hidden',
    /* The line that separates one edge from the next. The glass card inside
       draws its own border, but it is drawn against the card behind rather than
       against the page, and at that contrast two stacked edges merge into one
       thick one. This is the same hairline the rest of the app uses for the
       boundary between surfaces. */
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: glass.border,
  },
  pips: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5, paddingTop: 12 },
  pip: { width: DOT, height: DOT, borderRadius: radius.full, backgroundColor: colors.foreground },
});
