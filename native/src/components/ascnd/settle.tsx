import { useIsFocused } from 'expo-router';
import { useEffect } from 'react';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

/**
 * A section arriving on a page that was already there.
 *
 * ── this is the effect `screen.tsx` says to build, and not the two it says
 *    not to ──
 *
 * That file records two failed attempts at giving tab changes motion: a fade
 * on focus from 0, and a `key` that remounts the content so `entering` replays.
 * Both blink, and for one reason — `FadeInDown` and its family **begin at
 * invisible**. That is correct for a screen arriving from nothing, and wrong
 * on a page a `UITabBarController` has kept mounted, because replaying an
 * entrance there has to un-draw the page first. The note ends by naming what
 * would work: *"an animation that starts from the page as it is — a small
 * settle, not an entrance."*
 *
 * So this never goes near zero. It starts at 0.86 opacity and 12pt low, which
 * is close enough to the finished state that the first frame reads as the page
 * rather than as a flash, and lands over 340ms. Leaving the tab resets it, so
 * coming back settles again — and the reset is invisible because it happens on
 * a screen nobody is looking at.
 *
 * ── why not put this in `Screen` ──
 *
 * Because it would then run on all five tabs, and four of them are pages you
 * flick between constantly. Motion on every switch is the thing iOS
 * deliberately does not do. The Health Assistant is the one that *hides the tab
 * bar* when you open it — arriving there is a change of place rather than a
 * change of pane, and it is worth marking.
 */
export function Settle({
  index = 0,
  children,
}: {
  /** stagger position; each step waits 55ms longer than the last */
  index?: number;
  children: React.ReactNode;
}) {
  const focused = useIsFocused();
  const t = useSharedValue(0);

  useEffect(() => {
    if (focused) {
      t.value = withDelay(
        index * 55,
        withTiming(1, { duration: 340, easing: Easing.out(Easing.cubic) }),
      );
    } else {
      // instant, not animated: this runs on a screen that is off-view, and an
      // animation nobody sees is a timer nobody needed
      t.value = 0;
    }
  }, [focused, index, t]);

  const style = useAnimatedStyle(() => ({
    opacity: 0.86 + t.value * 0.14,
    transform: [{ translateY: (1 - t.value) * 12 }],
  }));

  return <Animated.View style={style}>{children}</Animated.View>;
}
