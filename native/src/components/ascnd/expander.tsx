import { useEffect, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { duration } from '@/constants/motion';

/**
 * A section that opens by animating a real height.
 *
 * ── why a height and not a layout animation ──
 *
 * `today-meals.tsx` measured the alternative and wrote down what happened:
 * Reanimated's `LinearTransition` on the card "looks right until you watch what
 * is under it. Measured on an open: the card below jumped straight to its final
 * position on the first frame while this one grew over a quarter second, so a
 * 94px hole opened between them and slowly closed. `layout` animates the view
 * it is on; it did not carry the sibling with it."
 *
 * A height does carry them, because a height is a layout value: whatever is
 * below is pushed down by exactly as much as this has grown, on every frame,
 * for free. That is why `tools/motion.mjs` has to be told about this file — it
 * bans layout properties inside `useAnimatedStyle`, and here the layout IS the
 * mechanism rather than a lazy way to make something appear.
 *
 * ── why this is a component and the other two are not ──
 *
 * Three screens want this and each had written its own. `template-list.tsx`
 * deliberately does something else and says why — a measured height "did not
 * show anything, and I could not find out why from reading the two", so it
 * staggers its rows instead. `today-meals.tsx` keeps its own because its rows
 * read the same `grow` shared value to land on a stagger, so the height and the
 * rows are one mechanism there rather than a container and its contents.
 *
 * This is for the ordinary case: something that opens, with nothing inside it
 * that needs to know how far open it is.
 *
 * ── the cost, and why it is the right one ──
 *
 * The body stays mounted while closed, clipped by a zero-high box, so there is
 * something to measure. That buys a measurement that is always current: content
 * that changed while closed opens to the right height rather than to the height
 * it had last time.
 */
const OPEN_EASE = Easing.out(Easing.cubic);

/**
 * The moving part, mounted only once the body has been measured.
 *
 * ── it is a separate component for the reason `tools/measured-worklet.mjs`
 *    exists ──
 *
 * `useAnimatedStyle` computes its style once, on the hook's first render, and
 * re-applies that frozen value on every later one. A worklet that reads a
 * `useState` written by `onLayout` therefore freezes at zero — which for this
 * component is a section that can never open. The first draft did exactly that
 * and the rule caught it.
 *
 * So the height arrives as a prop that is already real, and is then held in a
 * shared value: a plain prop would fix the frozen initial and leave a second
 * bug behind it, because the mapper is driven by shared values alone. Content
 * that grew while the section was already open would not move the height, since
 * `grow` had not changed.
 */
function Grow({
  open,
  height,
  children,
}: {
  open: boolean;
  height: number;
  children: React.ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  const grow = useSharedValue(open ? 1 : 0);
  const h = useSharedValue(height);

  useEffect(() => {
    h.value = height;
  }, [height, h]);

  useEffect(() => {
    const to = open ? 1 : 0;
    grow.value = reduceMotion ? to : withTiming(to, { duration: duration.move, easing: OPEN_EASE });
  }, [open, reduceMotion, grow]);

  const body = useAnimatedStyle(() => ({ height: grow.value * h.value, opacity: grow.value }));

  return <Animated.View style={[styles.clip, body]}>{children}</Animated.View>;
}

export function Expander({ open, children }: { open: boolean; children: React.ReactNode }) {
  const [bodyH, setBodyH] = useState(0);

  const measure = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    setBodyH((prev) => (Math.abs(prev - h) < 1 ? prev : h));
  };

  /* Absolutely positioned so its own height is never the box's height — the
     box's height is the animated one, and a child that pushed it open would
     make the measurement chase itself. */
  const body = (
    <View style={styles.body} onLayout={measure}>
      {children}
    </View>
  );

  /* Before the first measurement there is nothing to animate, so it is drawn at
     zero height purely to be measured. One frame, on a section that starts
     closed and therefore looks identical either way. */
  if (bodyH <= 0) return <View style={styles.clip}>{body}</View>;

  return (
    <Grow open={open} height={bodyH}>
      {body}
    </Grow>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  body: { position: 'absolute', left: 0, right: 0, top: 0 },
});
