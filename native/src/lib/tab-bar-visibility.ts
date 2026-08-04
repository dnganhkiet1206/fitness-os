import { useSyncExternalStore } from 'react';
import { makeMutable, withSpring } from 'react-native-reanimated';

/**
 * Scroll-aware tab-bar visibility — port of the web BottomTabBar behavior:
 * scrolling down past a threshold hides the bar, scrolling up (or being near
 * the top) shows it, and it always reappears after ~800ms of scroll
 * inactivity.
 *
 * ── two readers, because the bar became the system's ──
 *
 * `tabBarVisible` is a Reanimated mutable, so the old hand-drawn bar could
 * animate itself on the UI thread without a JS frame. A `UITabBarController`
 * cannot be animated from JS at all: it is shown or it is not, through
 * `NativeTabs`' `hidden` prop, which is React state. So the same decision is
 * published twice — as the mutable for anything still animating, and as a
 * boolean through `useTabBarHidden` for the navigator.
 *
 * The boolean only changes when the decision changes, not on every scroll
 * event, so a whole gesture is two renders of the navigator at most.
 *
 * ── why not iOS 26's own minimise ──
 *
 * `minimizeBehavior="onScrollDown"` is the platform's version of this and it
 * is better — the bar shrinks into a pill rather than leaving. It needs UIKit
 * to find the scroll view it should track, and it does not find these: the
 * same reason the native scroll-to-top does not fire on them. Rather than have
 * two mechanisms where one silently does nothing, the navigator asks for
 * `never` and this drives it.
 */

const SPRING = { stiffness: 400, damping: 32 };
const THRESHOLD = 16;

/** 1 = visible, 0 = hidden */
export const tabBarVisible = makeMutable(1);

let hidden = false;
const listeners = new Set<() => void>();

function publish(next: boolean) {
  tabBarVisible.value = withSpring(next ? 0 : 1, SPRING);
  if (next === hidden) return;
  hidden = next;
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Whether the tab bar should be out of the way right now. */
export function useTabBarHidden() {
  return useSyncExternalStore(subscribe, () => hidden);
}

let lastY = 0;
let idleTimer: ReturnType<typeof setTimeout> | undefined;

export function handleTabScroll(y: number) {
  const delta = y - lastY;
  if (delta > THRESHOLD && y > 80) {
    publish(true);
  } else if (delta < -THRESHOLD || y < 30) {
    publish(false);
  }
  lastY = y;
  if (idleTimer) clearTimeout(idleTimer);
  // Back after a pause, so a bar hidden by one flick is never stuck there
  idleTimer = setTimeout(() => publish(false), 800);
}

/** Called on tab switch — the web resets visibility per route */
export function resetTabBar() {
  lastY = 0;
  publish(false);
}
