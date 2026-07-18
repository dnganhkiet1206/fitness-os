import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

/**
 * Wraps a list row so it rises in with a light spring, staggered by its
 * index — the same entrance the Today dashboard cards use. Entrance runs
 * once per mount, so it plays when the screen opens and never re-fires on
 * data refresh (same row instance persists).
 */
export function StaggerItem({
  index,
  children,
  style,
  step = 55,
  max = 12,
}: {
  index: number;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  step?: number;
  max?: number;
}) {
  // Cap the delay so long lists don't leave later rows visibly lagging
  const delay = Math.min(index, max) * step;
  return (
    <Animated.View
      style={style}
      entering={FadeInDown.springify().damping(26).stiffness(180).delay(delay)}>
      {children}
    </Animated.View>
  );
}
