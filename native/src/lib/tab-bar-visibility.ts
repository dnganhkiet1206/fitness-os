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
/** How long after the last scroll event the bar comes back. */
const IDLE_MS = 800;

/** 1 = visible, 0 = hidden */
export const tabBarVisible = makeMutable(1);

let lastY = 0;
let idleTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * When the most recent scroll event arrived, in ms.
 *
 * A shared value rather than a JS variable because the worklet below writes it
 * from the UI thread — and it is what lets one timer do the work that used to
 * take one timer per frame.
 */
const lastScrollAt = makeMutable(0);

/**
 * The worklet's own `lastY`; the JS entry point keeps a separate one.
 *
 * Declared ABOVE the worklet that reads it, and that is a requirement rather
 * than tidiness: a worklet captures the variables it references when it is
 * created, so a `const` sitting below it is still in the temporal dead zone at
 * that moment and the screen dies with a `ReferenceError` before it paints.
 * `tools/worklet-tdz.mjs` exists in this repository because of exactly that.
 */
const lastYUI = makeMutable(0);

/**
 * Thanh tab ĐANG hướng tới đâu: 1 hiện, 0 ẩn.
 *
 * ── vì sao cần nhớ đích, chứ không chỉ đọc điều kiện ──
 *
 * Luật hướng đúng ở mức từng khung hình, nhưng trong một cú vuốt MẠNH thì
 * `delta > THRESHOLD` đúng ở rất nhiều khung hình liên tiếp. Không nhớ đích thì
 * mỗi khung hình ấy lại `withSpring(0)` một lần nữa — lò xo bị khởi động lại
 * liên tục, không bao giờ chạy hết, nên thứ nó điều khiển (thanh tab, và độ mờ
 * của Koa qua `koa-companion`) rung theo ngón tay thay vì trôi một nhịp.
 *
 * Nhớ đích thì một cú vuốt mạnh sinh ĐÚNG MỘT lò xo, và cú nhảy sang JS để lên
 * dây hẹn giờ cũng chỉ xảy ra một lần thay vì mỗi khung hình.
 */
const target = makeMutable(1);

/** The direction rule, shared by both callers so it cannot exist twice. */
function decide(y: number, delta: number): 0 | 1 | null {
  'worklet';
  if (delta > THRESHOLD && y > 80) return 0;
  if (delta < -THRESHOLD || y < 30) return 1;
  return null;
}

/**
 * The bar comes back once scrolling has actually stopped.
 *
 * ── one timer, not one per frame ──
 *
 * This used to be `clearTimeout` + `setTimeout` inside the per-frame handler:
 * at sixty frames a second that is sixty native timers created and sixty
 * cancelled, every second, for a thing whose whole job is to fire once when
 * nothing has happened for eight hundred milliseconds.
 *
 * So the timer is armed once and re-arms itself only if the last scroll event
 * turns out to be newer than it expected. Same behaviour — the bar returns
 * `IDLE_MS` after the last event, not `IDLE_MS` after the first — at one timer
 * per idle period instead of one per frame.
 */
export function armTabBarRestore() {
  if (idleTimer) return;
  const tick = () => {
    const quietFor = Date.now() - lastScrollAt.value;
    if (quietFor < IDLE_MS) {
      idleTimer = setTimeout(tick, IDLE_MS - quietFor);
      return;
    }
    idleTimer = undefined;
    target.value = 1;
    tabBarVisible.value = withSpring(1, SPRING);
  };
  idleTimer = setTimeout(tick, IDLE_MS);
}

/**
 * The scroll rule, run **on the UI thread**.
 *
 * ── what this replaces ──
 *
 * `Today` drove the bar with `runOnJS(handleTabScroll)(y)` inside its scroll
 * worklet, which is a UI→JS hop on every frame of every scroll, each one
 * landing on the same JS thread that React renders on. That is the thread whose
 * dropped frames leave an entering animation stuck at its initial value — the
 * blank-screen bug `lib/entrance.ts` documents — so the two are one problem.
 *
 * `tabBarVisible` is a shared value, and `withSpring` runs in a worklet, so the
 * common case needs no JS at all: the decision and the write both happen where
 * the scroll event already is. The only thing JS is still needed for is the
 * idle timer, and that is armed once per hide rather than once per frame.
 *
 * Returns `true` when the caller should arm that timer.
 */
export function tabScrollFrame(y: number, now: number): boolean {
  'worklet';
  const next = decide(y, y - lastYUI.value);
  lastYUI.value = y;
  lastScrollAt.value = now;
  /* Chỉ khi ĐÍCH thật sự đổi — xem ghi chú ở `target`. */
  if (next === null || next === target.value) return false;
  target.value = next;
  tabBarVisible.value = withSpring(next, SPRING);
  return next === 0;
}

/**
 * The same rule for screens that scroll on the JS thread.
 *
 * `screen.tsx` passes a plain `onScroll`, so there is no worklet to run in and
 * nothing to gain from one. It keeps the timer-per-call shape it always had,
 * which is fine at the rate a non-worklet `onScroll` actually fires.
 */
export function handleTabScroll(y: number) {
  const next = decide(y, y - lastY);
  lastY = y;
  lastScrollAt.value = Date.now();
  if (next !== null && next !== target.value) {
    target.value = next;
    tabBarVisible.value = withSpring(next, SPRING);
  }
  armTabBarRestore();
}

/** Called on tab switch — the web resets visibility per route */
export function resetTabBar() {
  lastY = 0;
  lastYUI.value = 0;
  target.value = 1;
  tabBarVisible.value = withSpring(1, SPRING);
}
