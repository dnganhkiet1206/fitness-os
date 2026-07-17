import { makeMutable, withSpring } from 'react-native-reanimated';

/**
 * Scroll-aware tab-bar visibility — port of the web BottomTabBar
 * behavior: scrolling down past a threshold hides the floating pill,
 * scrolling up (or being near the top) shows it, and it always
 * reappears after ~800ms of scroll inactivity. Shared between every
 * tab screen's ScrollView and the LiquidTabBar via a Reanimated
 * mutable so the animation runs on the UI thread.
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
  idleTimer = setTimeout(() => {
    tabBarVisible.value = withSpring(1, SPRING);
  }, 800);
}

/** Called on tab switch — the web resets visibility per route */
export function resetTabBar() {
  lastY = 0;
  tabBarVisible.value = withSpring(1, SPRING);
}
