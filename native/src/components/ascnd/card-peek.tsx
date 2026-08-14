import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { MascotFigure } from '@/components/ascnd/mascot-figure';
import { radius } from '@/constants/ascnd';
import { duration } from '@/constants/motion';
import { useMascot } from '@/hooks/use-mascot';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import type { MascotEmotion } from '@/lib/mascot-emotion';
import type { QuestKey } from '@/lib/mascot-room';
import {
  PEEK,
  PEEK_EMOTION,
  PEEK_FIGURE,
  PEEK_HOLD_MS,
  PEEK_TAIL_MS,
  peekFrame,
} from '@/lib/peek-frame';
import { usePeekSignal } from '@/lib/quest-peek';

/**
 * Koa comes up from behind a card, reacts, and drops back out of sight.
 *
 * ── how it hides ──
 *
 * The obvious build is to put the figure behind the card and let the card cover
 * it. That does not work here: `GlassCard` is glass — a 3.5–16% white fill — so
 * a character parked behind one is plainly visible through it, and the whole
 * illusion is that there is nothing there until there is.
 *
 * So the *clip* does the hiding, not the card. This renders a band that ends
 * exactly at the card's top edge, `overflow: 'hidden'`, with the figure parked
 * one full band below its hanging spot. Nothing shows. When it rises, it rises
 * out of that edge — which is the same thing to look at as "out from behind the
 * card" and is true whatever the card is made of.
 *
 * Where exactly it hangs from, and why from the top, is `lib/peek-frame.ts` —
 * along with the version of this that shipped and could not work.
 *
 * The band sits in the parent's padding, so it costs no layout: `position:
 * absolute`, anchored to the top of the child, and `pointerEvents="none"` so a
 * character standing over a card never eats a tap meant for the card.
 *
 * ── the motion ──
 *
 * Up on a spring, down on a curve, and that asymmetry is the whole character of
 * it. A spring up overshoots and settles, which reads as somebody popping their
 * head over a wall; the same spring on the way down reads as the head being
 * pulled on a rubber band. Down is `Easing.in` — accelerating away, the shape
 * gravity has — and quicker than the rise, because an exit that takes as long
 * as an entrance is an exit you wait through.
 *
 * The tilt is the reason it does not look like a lift. A rise with no rotation
 * is a freight elevator; a few degrees each way across the hold makes it a
 * creature leaning in to look at what you did. It runs on the same clock as the rise, so it cannot
 * drift out of step with it.
 *
 * ── and it is allowed to be skipped ──
 *
 * Under Reduce Motion nothing travels: the figure fades in at its resting spot,
 * holds, and fades out. The information — Koa noticed — survives; the movement
 * that carried it does not, which is exactly the trade the setting asks for.
 */

export function CardPeek({
  /** changes to a new non-zero value to fire one peek; 0 never fires */
  signal,
  /** which face comes up — the achievement decides, see `PEEK_EMOTION` */
  emotion = 'celebrate',
  /** coins just earned, shown beside the head; 0 shows nothing */
  coins = 0,
  children,
}: {
  signal: number;
  emotion?: MascotEmotion;
  coins?: number;
  children: React.ReactNode;
}) {
  const { enabled, mascot } = useMascot();
  const reduced = useReducedMotion();

  /** 0 = parked below the clip, 1 = fully up */
  const rise = useSharedValue(0);
  /** −1..1, the lean, driven off the same firing so it cannot desync */
  const lean = useSharedValue(0);

  /*
    ── mounted only while it is playing ──

    The band renders a whole `KoaFigure`: a large animated SVG with a frame
    clock of its own. Seven widgets on the dashboard take part in the peek, so
    leaving it mounted meant seven characters drawing and ticking permanently,
    clipped out of view, on the screen people scroll the most. Nothing was
    visible and everything was being rendered.

    So the figure exists for one performance and is taken down after it. The
    shared values and the animated style stay put across that, which is what
    keeps the frozen-first-evaluation trap (`tools/measured-worklet.mjs`) out of
    it: the style is not recreated when the child comes back.
  */
  const [playing, setPlaying] = useState(false);

  /* Latched, because the store's `coins` returns to 0 the moment another quest
     claims the stage — and this card is still on its way back down. */
  const [shownCoins, setShownCoins] = useState(0);
  useEffect(() => {
    if (signal && coins > 0) setShownCoins(coins);
  }, [signal, coins]);

  useEffect(() => {
    if (!signal) return;

    setPlaying(true);
    const done = setTimeout(() => setPlaying(false), PEEK_TAIL_MS);

    if (reduced) {
      rise.value = withSequence(
        withTiming(1, { duration: duration.appear }),
        withDelay(PEEK_HOLD_MS, withTiming(0, { duration: duration.appear })),
      );
      return () => clearTimeout(done);
    }

    rise.value = withSequence(
      // up, with the overshoot a spring gives for free
      withSpring(1, { stiffness: 180, damping: 13, mass: 0.9 }),
      // and away, accelerating, faster than it arrived
      withDelay(PEEK_HOLD_MS, withTiming(0, { duration: duration.move, easing: Easing.in(Easing.cubic) })),
    );

    /* The lean is one composed gesture, so its four steps are named beats
       rather than free numbers: hold while the spring lands, over, across, back.
       `swap` in the middle because the far side of a lean is the longest part of
       it — a lean that crosses as fast as it starts reads as a twitch. */
    lean.value = withSequence(
      withTiming(0, { duration: duration.toggle }),
      withTiming(1, { duration: duration.move, easing: Easing.inOut(Easing.quad) }),
      withTiming(-1, { duration: duration.swap, easing: Easing.inOut(Easing.quad) }),
      withTiming(0, { duration: duration.move, easing: Easing.inOut(Easing.quad) }),
    );

    return () => clearTimeout(done);
    // `signal` alone: the shared values and `reduced` are stable for a firing,
    // and listing them would replay the peek when Reduce Motion is toggled.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signal]);

  const figure = useAnimatedStyle(() => {
    const f = peekFrame(rise.value, lean.value);
    return {
      opacity: reduced ? rise.value : 1,
      transform: [
        { translateY: f.translateY },
        { rotate: `${f.rotate}deg` },
        { scaleY: f.scaleY },
      ],
    };
  });

  // No character, no band: the peek is the mascot, and a mascot switched off in
  // settings does not get to come back through a different door. Nothing playing
  // is the same answer for the same reason — there is nothing to draw.
  if (!enabled || !playing) return <>{children}</>;

  return (
    <View style={styles.wrap}>
      <View pointerEvents="none" style={styles.clip}>
        <Animated.View style={[styles.figure, figure]}>
          <MascotFigure mascot={mascot} size={PEEK_FIGURE} emotion={emotion} animated />
        </Animated.View>
        {shownCoins > 0 ? (
          <Animated.View style={[styles.coins, figure]}>
            <Text style={styles.coinsText}>+{shownCoins}</Text>
          </Animated.View>
        ) : null}
      </View>
      {children}
    </View>
  );
}

/**
 * `CardPeek` with the signal already looked up.
 *
 * The lookup is a hook, so it cannot live in the `withPeek` helper on the
 * dashboard — that helper runs inside a `switch` and a `map`, and a hook called
 * there would be called a different number of times whenever somebody
 * rearranged their widgets. A component of its own gets its own, stable, hook
 * position.
 */
export function PeekHost({ quest, children }: { quest: QuestKey; children: React.ReactNode }) {
  const { signal, coins } = usePeekSignal(quest);
  return (
    <CardPeek signal={signal} emotion={PEEK_EMOTION[quest]} coins={coins}>
      {children}
    </CardPeek>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative' },
  /* The band, ending flush with the card's top edge. `bottom: '100%'` of the
     wrapper would be the whole card; anchoring to `top: -PEEK` with a fixed
     height puts the lower edge exactly on the card and keeps the band out of
     the layout entirely. */
  clip: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: -PEEK,
    height: PEEK,
    overflow: 'hidden',
    alignItems: 'center',
    /* Hung from the top, not stood on the bottom — `lib/peek-frame.ts`. */
    justifyContent: 'flex-start',
  },
  /* Beside the head rather than under it: the band is `PEEK` tall and the head
     fills it, so a coin count below the chin would be outside the window. It
     rides the same animated style as the figure, so it cannot arrive on its own.

     Anchored to the *head* — half the figure's width out from the centre line —
     rather than to a percentage of the card. A percentage was fine on a
     full-width widget and sat on Koa's cheek the moment the card was narrower;
     the head is always in the middle, so measuring from there holds at any
     width. */
  coins: {
    position: 'absolute',
    left: '50%',
    marginLeft: PEEK_FIGURE / 2 - 2,
    bottom: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,209,102,0.16)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,209,102,0.34)',
  },
  coinsText: { fontSize: 12, fontWeight: '800', color: '#ffd166' },
  /* The figure is taller than the band and must stay that way: a flex child
     that shrinks to its container would squash Koa down to the band's height
     instead of being cropped to it. React Native already defaults to 0, and this says so
     out loud next to the one layout that would break if it ever did not. */
  figure: { flexShrink: 0 },
});
