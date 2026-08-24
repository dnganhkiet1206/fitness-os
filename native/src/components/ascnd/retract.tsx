import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  withTiming,
  type EntryAnimationsValues,
  type ExitAnimationsValues,
} from 'react-native-reanimated';

import { duration } from '@/constants/motion';

/**
 * An inline picker that grows out of the control that opened it, and retracts
 * back into it when you choose.
 *
 * ── what was there before ──
 *
 * `FadeIn` in, `FadeOut` out. Two things went wrong with that, and only the
 * second one is obvious once you look:
 *
 *   - **It faded in place.** Nothing connected the panel to the chip you
 *     tapped. It appeared *near* the chip, which is not the same as coming
 *     *from* it, so on a card holding three sets it was never quite clear which
 *     row had opened.
 *   - **Its height snapped.** A fade leaves the box at full height for the
 *     whole exit and then removes it in one frame, so everything below jumps up
 *     the moment the fade ends. The panel dissolved politely and the list under
 *     it flinched.
 *
 * ── what Apple actually does, and the part that surprised me ──
 *
 * I had assumed the picked option should highlight for a beat before anything
 * moved — confirm, then dismiss. WWDC20's *Design with iOS pickers, menus and
 * actions* says the opposite: menus dismiss **immediately** on selection, and
 * the transition is "very fast and light, it's shorter but it still feels
 * smooth, and it's less drastic". The confirmation is not a beat inside the
 * dismissal; it is the control you land back on, already showing the new value.
 *
 * That is why nothing here delays the close, and why the exit is shorter than
 * the entrance rather than symmetrical with it.
 *
 * ── the three parts, each doing one job ──
 *
 * **Height** is what makes the list close smoothly instead of flinching: it is
 * a layout value, so whatever sits below is pulled up by exactly as much as
 * this shrank, on every frame. `expander.tsx` reaches for a real height for the
 * same reason and `today-meals.tsx` has the measurement behind it — a layout
 * animation on the panel alone left a 94px hole while the sibling jumped.
 *
 * **Scale**, anchored top-right, is what points at the chip. The chips sit at
 * the right end of the set row and this panel opens directly beneath them, so
 * shrinking toward that corner is shrinking toward the thing you pressed. A
 * centred scale would be a panel collapsing into itself, which says nothing.
 *
 * **Opacity** carries the "light" half. Alone it was the whole animation, which
 * was the bug; alongside geometry it is the part that keeps a 90pt block from
 * feeling heavy on the way out.
 *
 * ── why a component and not two exported animations ──
 *
 * The three pieces only work together, and one of them is a plain style
 * (`overflow: hidden`, without which an animated height clips nothing and the
 * contents simply hang out of the box). Handing out `growIn` and `retractOut`
 * for a call site to remember to pair with the right style is three things to
 * get right; this is one import that cannot be half-used.
 *
 * ── not covered by `tools/motion.mjs` ──
 *
 * That rule bans layout properties inside `useAnimatedStyle`, which is a
 * different mechanism: a style worklet that re-runs layout on the JS-driven
 * path. Entering/exiting animations are Reanimated's own layout machinery and
 * animating a height is what they are *for*. `tools/retract.mjs` is the rule
 * that covers this file.
 */
const OPEN_EASE = Easing.out(Easing.cubic);

/* Accelerating away, where the open decelerated into place. This asymmetry is
   the whole feel of "retracts into the chip": the last half of the exit is the
   fastest part of it, so the panel looks pulled in rather than let go of. */
const SHUT_EASE = Easing.in(Easing.cubic);

/* A disclosure opening — `duration.move`'s own description, and the value
   `expander.tsx` already opens at. Two disclosures in one app running at two
   speeds is a thing you feel without being able to name. */
const OPEN_MS = duration.move;

/* Shorter, per the line quoted above. It stays in the token set rather than
   inventing a number: `appear` is the band for something arriving or leaving,
   and this is the leaving half. */
const SHUT_MS = duration.appear;

/**
 * 0.96 — about 13pt of travel on the left edge of a card-width panel.
 *
 * Deliberately not the press tokens. `press.scale` is 0.97 and `press.deep` is
 * 0.92, and both answer a different question: how far a surface gives under a
 * finger that is still on it. This is a panel moving to a place, and the eye
 * reads the distance rather than the ratio — at 0.98 the corner it is heading
 * for is a guess, and at 0.92 a panel that is also losing its height reads as
 * falling over.
 */
const SHRUNK = 0.96;

const growIn = (values: EntryAnimationsValues) => {
  'worklet';
  return {
    initialValues: { height: 0, opacity: 0, transform: [{ scale: SHRUNK }] },
    animations: {
      height: withTiming(values.targetHeight, { duration: OPEN_MS, easing: OPEN_EASE }),
      opacity: withTiming(1, { duration: OPEN_MS, easing: OPEN_EASE }),
      transform: [{ scale: withTiming(1, { duration: OPEN_MS, easing: OPEN_EASE }) }],
    },
  };
};

const retractOut = (values: ExitAnimationsValues) => {
  'worklet';
  return {
    initialValues: { height: values.currentHeight, opacity: 1, transform: [{ scale: 1 }] },
    animations: {
      height: withTiming(0, { duration: SHUT_MS, easing: SHUT_EASE }),
      opacity: withTiming(0, { duration: SHUT_MS, easing: SHUT_EASE }),
      transform: [{ scale: withTiming(SHRUNK, { duration: SHUT_MS, easing: SHUT_EASE }) }],
    },
  };
};

export function Retract({
  style,
  children,
}: {
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  return (
    <Animated.View entering={growIn} exiting={retractOut} style={[styles.clip, style]}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  clip: {
    /* Without this the animated height is a number that changes and nothing
       else: the contents keep their full size and spill past the box. */
    overflow: 'hidden',
    /* The corner the chips are in. See the note on scale above. */
    transformOrigin: 'top right',
  },
});
