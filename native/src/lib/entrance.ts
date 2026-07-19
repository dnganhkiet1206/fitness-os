import { FadeInDown } from 'react-native-reanimated';

/**
 * Standard card entrance — the same gentle cascade the Today dashboard
 * uses. Wrap each card in place with `<Animated.View entering={rise(i)}>`
 * (never via a Children.toArray helper, which disturbs the gap layout on
 * iOS). The delay is capped so long lists don't leave late cards lagging.
 */
export const rise = (i: number) =>
  FadeInDown.springify().damping(26).stiffness(180).delay(Math.min(i, 10) * 60);
