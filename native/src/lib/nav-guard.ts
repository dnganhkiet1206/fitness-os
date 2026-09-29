/**
 * The rule that decides whether a navigation happens.
 *
 * Kept apart from `nav.ts` — and importing nothing at all — so a check can
 * compile it on its own and drive it through real event sequences against a
 * fake navigator. A rule about concurrency that is only ever reasoned about is
 * a rule nobody has tested.
 *
 * -- why not a clock (#157) --
 *
 * This used to hold each destination for 700ms. That is a guess about how
 * long the app takes, and every guess is wrong somewhere: on a slow phone the
 * stall outlasts the window and the queued presses leak through; on a fast one
 * the window blocks nothing that needed blocking. So the lock is now released
 * by what actually happened, never by elapsed time:
 *
 *   IDLE ──request──▶ NAVIGATING ──state committed──▶ TRANSITIONING ──transitionEnd──▶ IDLE
 *                         │                                 │
 *                         ├─ queue drained, state unchanged ├─ focus moved elsewhere (swipe, tab)
 *                         │  (no-op / dropped action) ─▶ IDLE
 *                         └─ dispatch threw ─────────────▶ IDLE
 *
 * NAVIGATING lasts until expo-router's queue has run and the navigator's state
 * object changed — or the queue ran and it did not, which is a no-op action,
 * and a lock held for an action that did nothing would never be released.
 *
 * TRANSITIONING exists only where a STACK moved and the platform animates it
 * (native). It is what makes four queued backs pop one screen: once the first
 * back commits, the next queued press would otherwise see a settled navigator
 * and pop again. During a push or pop animation UIKit takes no touches, so any
 * navigation that arrives then is one that was queued before it — the exact
 * press this guard exists to drop. A tab switch or a params change moves no
 * stack, so it never enters this phase and never waits for an event that
 * would not come.
 *
 * -- what is ignored --
 *
 * - a request while NAVIGATING or TRANSITIONING: the same destination is a
 *   duplicate, a different one is a conflicting transition (#157 §3.2);
 * - a navigation to the destination that is already on screen, read off the
 *   navigator's focused route rather than remembered here — so a screen that
 *   arrived by deep link, a tab or a swipe counts exactly like one this guard
 *   sent (#157 Test 10).
 *
 * Nothing else. Buttons that repeat on purpose are untouched, because the
 * guard sits on the navigation, not on the press.
 */

/** The part of a React Navigation state this rule reads. */
export interface NavState {
  type?: string;
  index?: number;
  routes: readonly { key: string; state?: NavState | Partial<NavState> }[];
}

/** What the rule needs from the running app, injected so a test can fake it. */
export interface NavEnv {
  /** The navigator's current root state; a new object after every change. */
  rootState(): NavState | undefined;
  /** The focused route as a destination key, in the same form as `request`'s `dest`. */
  activeDest(): string | null;
  /** Whether expo-router's routing queue has been run (is empty). */
  routerIdle(): boolean;
  /** Whether stack changes animate and report `transitionEnd` (native: yes, web: no). */
  animates: boolean;
}

export type NavPhase = 'idle' | 'navigating' | 'transitioning';
export type Verdict = 'accept' | 'duplicate' | 'busy' | 'active';

interface Pending {
  key: string;
  id: number;
  baseline: NavState | undefined;
}

let env: NavEnv | null = null;
let phase: NavPhase = 'idle';
let pending: Pending | null = null;
/** The focus path when the last change was seen: what "focus moved" is measured from. */
let committedPath: string[] = [];
let nextId = 0;

/** Keys of the focused route at every level, root first. */
export function focusPath(state: NavState | Partial<NavState> | undefined): string[] {
  const out: string[] = [];
  let s = state;
  while (s && s.routes && s.routes.length) {
    const r = s.routes[s.index ?? s.routes.length - 1];
    if (!r) break;
    out.push(r.key);
    s = r.state;
  }
  return out;
}

/*
  One path extending the other is the same place, not a move: a screen that
  mounts a nested navigator adds a level below the route it already was.
*/
function samePlace(a: string[], b: string[]): boolean {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Whether going from `a` to `b` moved a STACK (a push, pop or replace) rather than a tab. */
export function stackMoved(a: NavState | undefined, b: NavState | undefined): boolean {
  let x: NavState | Partial<NavState> | undefined = a;
  let y: NavState | Partial<NavState> | undefined = b;
  while (x?.routes?.length && y?.routes?.length) {
    const rx = x.routes[x.index ?? x.routes.length - 1];
    const ry = y.routes[y.index ?? y.routes.length - 1];
    if (!rx || !ry) return false;
    if (rx.key !== ry.key) return y.type === 'stack';
    x = rx.state;
    y = ry.state;
  }
  return false;
}

function finalize(state: NavState | undefined): void {
  const p = pending!;
  pending = null;
  committedPath = focusPath(state);
  phase = env!.animates && stackMoved(p.baseline, state) ? 'transitioning' : 'idle';
}

/*
  Brought up to date on every entry point rather than on a timer: whatever
  happened since the last call is read off the navigator itself.
*/
function reconcile(): void {
  if (!env) return;
  if (phase === 'navigating' && pending) {
    const s = env.rootState();
    if (s !== pending.baseline) finalize(s);
    /* The queue ran and nothing changed: the action was a no-op or was
       dropped (expo-router drops one it cannot resolve without a word). */
    else if (env.routerIdle()) {
      pending = null;
      phase = 'idle';
    }
  }
}

/**
 * Ask to navigate. `key` names the act (verb and destination); `dest` names
 * the place, or null for a back. Only `'accept'` may be followed by a dispatch,
 * and an accepted dispatch that throws must be reported with `failed`.
 */
export function request(key: string, dest: string | null): Verdict {
  if (!env) return 'accept';
  reconcile();
  if (phase === 'navigating') return pending?.key === key ? 'duplicate' : 'busy';
  if (phase === 'transitioning') return 'busy';
  if (dest !== null && dest === env.activeDest()) return 'active';
  pending = { key, id: ++nextId, baseline: env.rootState() };
  phase = 'navigating';
  return 'accept';
}

/** The accepted dispatch threw: nothing is in flight any more. */
export function failed(): void {
  if (phase === 'navigating') {
    pending = null;
    phase = 'idle';
  }
}

/** The navigator committed a new state (container `state` event). */
export function onState(): void {
  if (!env) return;
  reconcile();
  const path = focusPath(env.rootState());
  if (!samePlace(path, committedPath)) {
    /* Focus moved somewhere this guard did not send it — a swipe back, a tab,
       a deep link, the auth gate swapping the tree. An animation we were
       waiting on was overtaken by it. */
    committedPath = path;
    if (phase === 'transitioning') phase = 'idle';
  }
}

/** A stack screen finished appearing or disappearing (`transitionEnd`). */
export function onTransitionEnd(): void {
  reconcile();
  if (phase === 'transitioning') phase = 'idle';
}

/** Connect to the running app. Returns the disconnect. */
export function attach(e: NavEnv): () => void {
  env = e;
  reset();
  committedPath = focusPath(e.rootState());
  return () => {
    if (env === e) {
      env = null;
      reset();
    }
  };
}

export function reset(): void {
  phase = 'idle';
  pending = null;
  committedPath = [];
}

/** For checks and diagnostics only. */
export function snapshot(): { phase: NavPhase; pending: string | null; requestId: number } {
  return { phase, pending: pending?.key ?? null, requestId: pending?.id ?? nextId };
}
