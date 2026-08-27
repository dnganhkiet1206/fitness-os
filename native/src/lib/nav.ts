/**
 * Navigation that survives a stalled main thread.
 *
 * -- the bug --
 *
 * The app hitches: a big query lands, a screenful of art decodes, the JS thread
 * is busy for half a second. The button does not respond, so the person presses
 * it again. And again. Four presses is not impatience - it is the only
 * information they have, because a screen that has not moved and a screen that
 * is about to move look identical.
 *
 * Then the thread frees. Every queued press runs, milliseconds apart, and each
 * one pushes a route. You land four screens deep on the same page and have to
 * press back four times to get out. On a stack that keeps state - the workout
 * builder, a half-written log sheet - the copies underneath are LIVE, so backing
 * out walks you through four of them.
 *
 * This is not a rare case. It is the guaranteed consequence of the app ever
 * being slow, and the slower the device the more reliably it happens: exactly
 * the people who can least afford it.
 *
 * -- why the guard is here and not on the button --
 *
 * The obvious place is the press: make `PressScale` ignore a second tap for
 * 300ms. That is wrong, and wrong in a way that would be found late. Plenty of
 * buttons in this app are MEANT to repeat - the rest timer's plus and minus
 * fifteen, the water quick-add, the set-count steppers, every plus and minus in
 * the builder. A guard on the press punishes all of those to fix a problem none
 * of them have.
 *
 * The thing that must not happen twice is not the press. It is the NAVIGATION.
 * So the guard sits on the navigation, once, and every button in the app keeps
 * behaving exactly as it did.
 *
 * -- what it drops, and what it must never drop --
 *
 * A push is dropped only when it names the SAME destination as the one just
 * accepted, within `GUARD_MS`. Two different destinations in quick succession
 * are somebody changing their mind, and both still happen.
 *
 * `back` is guarded on the same clock for the same reason - four queued back
 * presses pop four screens, which is this bug pointing the other way.
 *
 * The window is deliberately short enough that a real second visit is never
 * blocked: opening a screen, reading it, coming back and opening it again
 * cannot happen inside 700ms.
 */
import { router, type Href } from 'expo-router';

import { allow } from '@/lib/nav-guard';

/**
 * What makes two navigations "the same one".
 *
 * The params are part of it: `/exercises?group=chest` and
 * `/exercises?group=back` are two destinations, and somebody tapping two
 * different muscle tiles quickly must get the second one. Serialised in sorted
 * key order so one target can never produce two different keys.
 */
export function navKey(href: Href): string {
  if (typeof href === 'string') return href;
  const { pathname, params } = href as { pathname: string; params?: Record<string, unknown> };
  if (!params) return String(pathname);
  const parts = Object.keys(params)
    .sort()
    .map((k) => `${k}=${String(params[k])}`);
  return `${pathname}?${parts.join('&')}`;
}

/**
 * The app's way of navigating.
 *
 * An object rather than loose exports, for one practical reason: a dozen files
 * already have a local `push`, `back` or `replace`, and a bare import would
 * shadow or be shadowed by them. `nav.push(...)` reads at the call site as
 * exactly what it replaced, and `tools/nav-guard.mjs` can then forbid the
 * unguarded spelling outright.
 */
export const nav = {
  push(href: Href): void {
    if (allow(navKey(href))) router.push(href);
  },
  replace(href: Href): void {
    if (allow(`replace:${navKey(href)}`)) router.replace(href);
  },
  navigate(href: Href): void {
    if (allow(`navigate:${navKey(href)}`)) router.navigate(href);
  },
  /*
    One key for every back, because they are all the same act: leave this
    screen. Four queued backs must pop one screen, not four.
  */
  back(): void {
    if (allow(' back')) router.back();
  },
  dismissAll(): void {
    if (allow('dismissAll')) router.dismissAll();
  },
  canGoBack(): boolean {
    return router.canGoBack();
  },
};
