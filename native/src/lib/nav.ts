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
 * The rule itself lives in `nav-guard.ts` (#157): a lock held from the moment a
 * navigation is accepted until the navigator has really moved — its state
 * committed and, on native, the stack animation finished — and released by
 * those events, never by a clock. While it is held, another navigation is
 * ignored: the same destination is a duplicate, a different one conflicts
 * with the transition in progress. After it, a push to the destination that
 * is already on screen is ignored too. Everything else goes through.
 *
 * `back` is guarded the same way for the same reason - four queued back
 * presses pop four screens, which is this bug pointing the other way.
 *
 * The lock is fed by `useNavGuard()` in the root layout, which connects it to
 * the navigation container. Before that has run there is no navigator to race,
 * and the guard lets everything through.
 */
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { router, useNavigationContainerRef, type Href } from 'expo-router';
/* No "exports" map in expo-router's package.json, so this deep path is the
   module `router.push` itself adds to — not a copy. It is read, never written. */
import { routingQueue } from 'expo-router/build/global-state/routingQueue';
import { getRouteInfoFromState } from 'expo-router/build/global-state/getRouteInfoFromState';

import { attach, failed, onState, onTransitionEnd, request, type NavState } from '@/lib/nav-guard';

/**
 * What makes two navigations "the same one".
 *
 * The params are part of it: `/exercises?group=chest` and
 * `/exercises?group=back` are two destinations, and somebody tapping two
 * different muscle tiles quickly must get the second one. Serialised in sorted
 * key order so one target can never produce two different keys.
 */
export function navKey(href: Href): string {
  if (typeof href === 'string') {
    const q = href.indexOf('?');
    if (q < 0) return placeKey(href, {});
    return placeKey(href.slice(0, q), Object.fromEntries(new URLSearchParams(href.slice(q + 1))));
  }
  const { pathname, params } = href as { pathname: string; params?: Record<string, unknown> };
  return placeKey(String(pathname), params ?? {});
}

/*
  One spelling per place, so the key of a press and the key of the screen now
  focused can be compared: route groups and a trailing `index` are not part of
  where you are (`/(tabs)/workouts/index` is `/workouts`, which is what the
  navigator reports), and params are in sorted order.
*/
function placeKey(pathname: string, params: Record<string, unknown>): string {
  const path = pathname.replace(/\/\([^/]+\)/g, '').replace(/\/index$/, '') || '/';
  const parts = Object.keys(params)
    .filter((k) => params[k] !== undefined)
    .sort()
    .map((k) => `${k}=${String(params[k])}`);
  return parts.length ? `${path}?${parts.join('&')}` : path;
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
/*
  Ask, dispatch, and release on the error path. The success path is released
  by the navigator (see `useNavGuard`), not here: returning from `router.push`
  only means the action was queued.
*/
function go(key: string, dest: string | null, dispatch: () => void): void {
  if (request(key, dest) !== 'accept') return;
  try {
    dispatch();
  } catch (e) {
    failed();
    throw e;
  }
}

export const nav = {
  push(href: Href): void {
    const dest = navKey(href);
    go(`push:${dest}`, dest, () => router.push(href));
  },
  replace(href: Href): void {
    const dest = navKey(href);
    go(`replace:${dest}`, dest, () => router.replace(href));
  },
  navigate(href: Href): void {
    const dest = navKey(href);
    go(`navigate:${dest}`, dest, () => router.navigate(href));
  },
  /*
    One key for every back, because they are all the same act: leave this
    screen. Four queued backs must pop one screen, not four.

    With nowhere to go back to, nothing is dispatched and nothing is locked:
    `GO_BACK` would reach no navigator, and a lock taken for an action that
    cannot happen is a lock waiting on an event that will not come.
  */
  back(): void {
    if (!router.canGoBack()) return;
    go('back', null, () => router.back());
  },
  /*
    KHÔNG có `dismissAll` ở đây, và chỗ trống này là cố ý.

    Nó từng có, gọi từ hai chỗ trong Cài đặt sau `signOut`, và gây ra một lỗi
    thật trên máy: "The action 'POP_TO_TOP' was not handled by any navigator."

    Cổng ở `_layout.tsx` là `if (!user) return <AuthScreen />` — mất phiên thì
    cả cây điều hướng bị THAY, không phải bị pop. expo-router xếp hàng lệnh
    điều hướng và xả ở lần focus kế tiếp, lúc ngăn xếp đã biến mất.

    Ai cần dismiss một chồng sheet thì cứ thêm lại — nhưng đọc đoạn này trước,
    và đừng gọi nó sau `signOut`.
  */
  canGoBack(): boolean {
    return router.canGoBack();
  },
};

/**
 * Connects the guard to the navigation container. Called once, in the root
 * layout, which renders inside the container for the app's whole life.
 */
export function useNavGuard(): void {
  const ref = useNavigationContainerRef();
  useEffect(() => {
    const detach = attach({
      rootState: () => (ref.isReady() ? (ref.getRootState() as unknown as NavState) : undefined),
      /* The same reading `usePathname` + `useGlobalSearchParams` make. */
      activeDest: () => {
        if (!ref.isReady()) return null;
        const info = getRouteInfoFromState(ref.getRootState() as Parameters<typeof getRouteInfoFromState>[0]);
        return placeKey(info.pathname, info.params);
      },
      routerIdle: () => routingQueue.snapshot().length === 0,
      animates: Platform.OS !== 'web',
    });
    const offState = ref.addListener('state', onState);
    return () => {
      offState();
      detach();
    };
  }, [ref]);
}

/**
 * `screenListeners` for every `<Stack>`: the end of a push or pop animation
 * is what releases the lock on native. `tools/nav-guard.mjs` checks each stack
 * layout passes it.
 */
export const navGuardScreenListeners = { transitionEnd: onTransitionEnd };
