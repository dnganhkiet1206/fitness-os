import { useEffect, useState } from 'react';
import { FadeInDown } from 'react-native-reanimated';

/**
 * Standard card entrance — the same gentle cascade the Today dashboard
 * uses. Wrap each card in place with `<Animated.View entering={rise(i)}>`
 * (never via a Children.toArray helper, which disturbs the gap layout on
 * iOS). The delay is capped so long lists don't leave late cards lagging.
 */
export const rise = (i: number) =>
  FadeInDown.springify().damping(26).stiffness(180).delay(Math.min(i, 10) * 60);

/**
 * The same cascade, except it does not run on the screen's FIRST paint.
 *
 * ── the bug this exists for ──
 *
 * An entering animation mounts its view at the START of the animation:
 * `FadeInDown` means opacity 0 and an offset, and `rise(5)` means holding that
 * for three hundred milliseconds before the spring is even allowed to begin.
 * If the frames in that window are dropped, what is left on screen is the
 * initial value — the content is mounted, it occupies its space, and it is
 * invisible.
 *
 * That is not theoretical. Reported twice from the device, on the two screens
 * that stagger the most: Progress opens dim or blank and comes back only after
 * switching tabs and switching back, because that path unmounts and remounts
 * and the second run happens on a thread that is no longer busy. Progress has
 * twelve of these; Nutrition runs one per plan.
 *
 * `index.tsx` had already found this and written the reason down: *"một hiệu
 * ứng vào là TRANG TRÍ, nên nó không bao giờ được là thứ quyết định nội dung có
 * nhìn thấy hay không"* — an entrance is decoration, so it must never be the
 * thing that decides whether content can be seen. On the very first paint there
 * is no previous state to soften: the person just opened the screen and has
 * never seen anything else.
 *
 * So the first paint is instant, and everything after it animates. Switching
 * the Progress tab strip, adding a card, changing a filter — those all mount
 * into a screen that is already there, which is exactly where the cascade earns
 * its keep.
 *
 * ── and it is the cheapest fix available for the stutter ──
 *
 * Twelve springs starting inside the first second of a screen that is also
 * running its queries is a large part of what made the frames drop in the first
 * place. Removing them from the first paint removes the cause as well as the
 * symptom.
 *
 * Usage is one line at the top of the screen, and the call sites do not change:
 *
 *     const rise = useRise();
 *     …
 *     <Animated.View entering={rise(0)}>
 */
export function useRise(): (i: number) => ReturnType<typeof rise> | undefined {
  const [painted, setPainted] = useState(false);
  useEffect(() => {
    setPainted(true);
  }, []);
  return (i: number) => (painted ? rise(i) : undefined);
}
