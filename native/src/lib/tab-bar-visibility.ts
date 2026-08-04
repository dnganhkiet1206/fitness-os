import { makeMutable, withSpring } from 'react-native-reanimated';

/**
 * Scroll-aware tab-bar visibility — port of the web BottomTabBar behavior:
 * scrolling down past a threshold hides the bar, scrolling up (or being near
 * the top) shows it, and it always reappears after ~800ms of scroll
 * inactivity.
 *
 * ── it no longer drives the tab bar ──
 *
 * The bar is a `UITabBarController` now and hides itself, through
 * `minimizeBehavior`. This briefly drove it instead, through `NativeTabs`'
 * `hidden` prop — and that prop is React state, so every change of scroll
 * direction re-rendered the navigator hosting all five tabs. It flickered.
 *
 * `tabBarVisible` is kept because it costs nothing and it is the right shape
 * for anything that wants to animate with the bar on the UI thread — the
 * old hand-drawn bar in `ascnd/liquid-tab-bar` still reads it. `useTabBarHidden`
 * is gone: nothing should be turning a scroll position into React state.
 */

const SPRING = { stiffness: 400, damping: 32 };
const THRESHOLD = 16;

/** 1 = visible, 0 = hidden */
export const tabBarVisible = makeMutable(1);

let lastY = 0;
let idleTimer: ReturnType<typeof setTimeout> | undefined;

export function handleTabScroll(y: number) {
  const delta = y - lastY;
  if (delta > THRESHOLD && y > 80) {
    tabBarVisible.value = withSpring(0, SPRING);
  } else if (delta < -THRESHOLD || y < 30) {
    tabBarVisible.value = withSpring(1, SPRING);
  }
  lastY = y;
  if (idleTimer) clearTimeout(idleTimer);
  // Back after a pause, so a bar hidden by one flick is never stuck there
  idleTimer = setTimeout(() => {
    tabBarVisible.value = withSpring(1, SPRING);
  }, 800);
}

/** Called on tab switch — the web resets visibility per route */
export function resetTabBar() {
  lastY = 0;
  tabBarVisible.value = withSpring(1, SPRING);
}
