import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { colors, glass, radius, spacing } from '@/constants/ascnd';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { heightFor, hydrateWidgetHeights, useWidgetHeightsVersion } from '@/lib/widget-heights';

/**
 * The shape of the page, while the page is still arriving.
 *
 * ── what this replaced ──
 *
 * Nothing. Today rendered its greeting and then, until `useDailyLog` resolved,
 * empty screen. On a warm cache that is a frame nobody sees; on a cold launch,
 * a slow network or a phone that just woke up, it is several seconds of an app
 * that looks like it failed to load.
 *
 * The widgets were hidden on purpose — see `widget-heights.ts` — and the fix is
 * not to unhide them. It is to occupy the space they are about to take, at the
 * size they are about to take it, so that when they arrive nothing moves.
 *
 * ── the pulse, and when there isn't one ──
 *
 * One opacity value, shared by every block on the page, breathing between 0.55
 * and 1 over three seconds. Opacity only, so it composites on the UI thread and
 * costs nothing per block; one driver, so twelve blocks do not run twelve
 * animations out of phase with each other, which reads as static rather than as
 * one surface.
 *
 * Under Reduce Motion there is no animation at all — the blocks sit at a fixed
 * opacity. A skeleton exists to say "this is loading", and it still says that
 * standing still. `cancelAnimation` on unmount for the same reason the aura
 * cancels: an animation nobody is looking at is a warm phone.
 */
function useBreath(): SharedValue<number> {
  const v = useSharedValue(1);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) {
      v.value = 0.8;
      return;
    }
    v.value = withRepeat(withTiming(0.55, { duration: 1500, easing: Easing.inOut(Easing.quad) }), -1, true);
    return () => cancelAnimation(v);
  }, [reduceMotion, v]);

  return v;
}

/** One block, at a height somebody has already measured. */
export function SkeletonBlock({ height, style }: { height: number; style?: object }) {
  const opacity = useBreath();
  const anim = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[styles.block, { height }, anim, style]} />;
}

/**
 * Today's page, in outline.
 *
 * Built from the same config the real page renders, so a reordered dashboard is
 * still the right shape while it loads, and a widget somebody removed does not
 * leave a block waiting for it.
 */
export function TodaySkeleton({
  heroWidgets,
  groups,
}: {
  heroWidgets: string[];
  groups: { id: string; widgets: string[] }[];
}) {
  /* Pulls the remembered heights in from storage and re-renders once they
     land — see the note in `widget-heights.ts` about the read arriving after
     the first frame. */
  useWidgetHeightsVersion();
  useEffect(() => {
    hydrateWidgetHeights();
  }, []);

  return (
    /* Not announced to a screen reader. A skeleton is a statement about
       rendering, not about content, and VoiceOver reading twelve empty boxes is
       worse than it reading nothing and then reading the page. */
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {heroWidgets.map((key) => (
        <SkeletonBlock key={key} height={heightFor(key)} style={styles.stacked} />
      ))}
      {groups.map((group) => (
        <View key={group.id} style={styles.group}>
          {/* the group header's own row: an icon and a short title */}
          <SkeletonBlock height={18} style={styles.header} />
          {group.widgets.map((key) => (
            <SkeletonBlock key={key} height={heightFor(key)} />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  /* The card's own geometry, so a block sits exactly where its card will:
     same radius, same hairline, and a fill a shade above the page rather than
     a grey rectangle painted on top of it. */
  block: {
    borderRadius: glass.radius ?? radius.lg,
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  stacked: { marginBottom: spacing.stack },
  group: { gap: spacing.sm + 4, marginTop: spacing.xs, marginBottom: spacing.stack },
  header: { width: 132, borderWidth: 0, backgroundColor: 'rgba(255,255,255,0.06)' },
});
