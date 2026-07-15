/**
 * Single source of truth for per-route layout behavior.
 * Consumed by App.tsx (transitions, scroll container), AppLayout.tsx
 * (tab bar, keyboard padding) and SwipeBack.tsx (edge-swipe back).
 */

/** Root tab destinations — switching between them cross-fades (like a native
 *  UITabBarController); everything else animates as an iOS push/pop. */
export const TAB_ROUTES = new Set(['/', '/nutrition', '/workouts', '/progress']);

/** Routes that own their full layout: internal scrolling, keyboard handling.
 *  They are NOT wrapped in the shared per-route scroll container. */
export const CUSTOM_LAYOUT_ROUTES = new Set(['/ai-coach']);

/** Full-screen flows where the floating tab bar must not show
 *  (and no bottom clearance is reserved for it). */
export const NO_TAB_BAR_ROUTES = new Set(['/onboarding']);

/** Routes where the tab bar must not auto-hide on scroll. */
export const NO_AUTOHIDE_ROUTES = new Set(['/ai-coach']);

/** Routes where the edge swipe-back gesture is disabled (root/entry pages). */
export const NO_SWIPE_ROUTES = new Set(['/', '/auth', '/onboarding']);

/** Vertical space (px, before safe-area inset) the floating tab bar occupies:
 *  bar ≈56px + 8px bottom margin + breathing room. Keep in sync with
 *  BottomTabBar's dimensions. */
export const TAB_BAR_CLEARANCE_PX = 84;
