import { Easing, makeMutable, withSpring, withTiming } from 'react-native-reanimated';

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

/**
 * Chrome ở ĐỈNH màn hình — hàng nút của Today. Cùng luật hướng, khác độ nhạy.
 *
 * ── vì sao không dùng thẳng `tabBarVisible` ──
 *
 * Đã thử, và người dùng báo lại: "ẩn hơi chậm, nó phải ẩn lập tức sau khi
 * người dùng cuộn". Ba nguồn trễ, và cả ba đều đúng cho thanh tab:
 *
 *   1. `y > 80` — phải cuộn 80 điểm rồi thanh mới được phép ẩn. Với thanh tab
 *      ở đáy thì hợp lý: nó là điều hướng, không nên biến mất vì một cú chạm
 *      hụt. Với hàng nút ở ĐỈNH thì 80 điểm là quãng người ta đã đọc xong hai
 *      dòng, và suốt quãng ấy ba cái nút vẫn nằm nguyên trên nội dung.
 *   2. `THRESHOLD = 16` điểm MỖI KHUNG HÌNH. Một cú cuộn chậm không bao giờ
 *      vượt 16 điểm trong 16ms, nên nó không bao giờ ẩn được hàng nút.
 *   3. Lò xo ζ≈0.8 — nó *tới nơi* đúng lúc, nhưng nó rời đi thong thả.
 *
 * ── và vì sao đây KHÔNG phải bộ đếm hướng thứ hai ──
 *
 * Đó là điều luật ở `tools/hero-scroll.mjs` cấm, và cấm đúng: hai luật hướng
 * riêng sẽ lệch nhau, rồi chrome trên và chrome dưới rời màn hình vào hai lúc
 * khác nhau.
 *
 * Ở đây chỉ có MỘT phép đo hướng: cùng một khung hình, cùng một `delta`, tính
 * đúng một lần ở `tabScrollFrame`. Hai hàm `decide` chỉ khác NGƯỠNG — tức khác
 * mức nhạy, không khác chiều. Chúng không thể bất đồng về việc người dùng đang
 * đi lên hay đi xuống, vì chúng đọc chung một con số.
 */
export const topChromeVisible = makeMutable(1);

/**
 * Ngưỡng riêng của hàng nút đỉnh.
 *
 * `4` điểm: gần như "trang vừa nhúc nhích". Hàng nút nằm ngay đỉnh nên chính
 * việc nội dung bắt đầu trôi dưới nó đã là tín hiệu; không cần chờ thêm.
 *
 * ── và đường về chỉ có MỘT ──
 *
 * Hàng nút quay lại khi người dùng cuộn về ĐẦU TRANG, không quay lại vì một
 * lý do nào khác. Đây là bản sửa thứ hai của cùng một câu hỏi, nên cả hai bản
 * bị loại đều đáng ghi lại:
 *
 *   · **Ngừng cuộn thì hiện lại** (thừa hưởng hẹn giờ nghỉ 800ms của thanh
 *     tab). Đọc ra là: dừng lại đọc một tấm thẻ giữa trang thì ba cái nút tự
 *     bò vào góc, đè lên nội dung, không ai gọi chúng. Với thanh tab thì hẹn
 *     giờ ấy đúng — điều hướng phải luôn với tới được — nhưng ba cái nút này
 *     không phải điều hướng.
 *
 *   · **Cuộn lên một chút thì hiện lại.** Gần đúng, và vẫn không phải thứ
 *     Apple làm: tiêu đề lớn của iOS chỉ nở lại khi bạn về tới đỉnh, chứ không
 *     nở ra mỗi lần bạn nhích ngược lại vài dòng để đọc lại một câu.
 *
 * Nên `decideTop` chỉ còn hai vế: đi khi trang trôi xuống, về khi trang chạm
 * đỉnh. Không có vế thứ ba, và không có hẹn giờ nào chạm vào nó.
 */
const TOP_AT = 4;
const TOP_HIDE_DELTA = 2;
/** Nhịp `toggle` — hàng nút cao 44 điểm, đi hết 52 điểm; quãng ngắn, nhịp ngắn. */
const TOP_MS = 180;
/** `out` nên nó XUẤT PHÁT ở tốc độ cao nhất: cú đi bắt đầu ngay ở khung hình
 *  đầu, thứ mà "ẩn lập tức" thật sự đang nói tới. */
const TOP_EASE = Easing.out(Easing.cubic);

const topTarget = makeMutable(1);

function decideTop(y: number, delta: number): 0 | 1 | null {
  'worklet';
  if (delta > TOP_HIDE_DELTA && y > TOP_AT) return 0;
  /* Đường về DUY NHẤT — xem `topChromeVisible`. Không có nhánh cuộn-lên, và
     không hẹn giờ nào gọi tới hàm này. */
  if (y <= TOP_AT) return 1;
  return null;
}

/** Áp đích mới cho hàng nút đỉnh; trả về true nếu nó vừa ẩn đi. */
function applyTop(next: 0 | 1 | null): boolean {
  'worklet';
  if (next === null || next === topTarget.value) return false;
  topTarget.value = next;
  topChromeVisible.value = withTiming(next, { duration: TOP_MS, easing: TOP_EASE });
  return next === 0;
}

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
    /* Hàng nút đỉnh KHÔNG về theo nhịp nghỉ này, và đó là điểm khác nhau giữa
       hai tầng chrome. Thanh tab là điều hướng: nó phải luôn với tới được, nên
       ngừng cuộn 800ms là nó quay lại. Ba cái nút ở góc trên không phải điều
       hướng — chúng chỉ có một đường về, là đỉnh trang. Bản trước gọi cả hai ở
       đây, và đọc ra là: dừng lại đọc một tấm thẻ giữa trang thì ba cái nút tự
       bò vào góc đè lên nội dung. */
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
  /* MỘT `delta`, đọc một lần, cho cả hai quyết định. Đây là chỗ bảo đảm hai
     tầng chrome không bao giờ bất đồng về CHIỀU — chúng chỉ khác ngưỡng. */
  const delta = y - lastYUI.value;
  const next = decide(y, delta);
  const nextTop = decideTop(y, delta);
  lastYUI.value = y;
  lastScrollAt.value = now;
  /* Hàng nút đỉnh trước, vì nó nhạy hơn: nó thường ẩn ở khung hình mà thanh
     tab còn chưa quyết định gì. */
  const topHid = applyTop(nextTop);
  /* Chỉ khi ĐÍCH thật sự đổi — xem ghi chú ở `target`. */
  if (next === null || next === target.value) return topHid;
  target.value = next;
  tabBarVisible.value = withSpring(next, SPRING);
  return next === 0 || topHid;
}

/**
 * The same rule for screens that scroll on the JS thread.
 *
 * `screen.tsx` passes a plain `onScroll`, so there is no worklet to run in and
 * nothing to gain from one. It keeps the timer-per-call shape it always had,
 * which is fine at the rate a non-worklet `onScroll` actually fires.
 */
export function handleTabScroll(y: number) {
  const delta = y - lastY;
  const next = decide(y, delta);
  lastY = y;
  lastScrollAt.value = Date.now();
  if (next !== null && next !== target.value) {
    target.value = next;
    tabBarVisible.value = withSpring(next, SPRING);
  }
  /* Cùng `delta`, cùng một lần đo — xem `topChromeVisible`. Màn nào cuộn ở
     luồng JS cũng phải nuôi cả hai tầng chrome, nếu không thì rời Today rồi
     quay lại, hàng nút có thể kẹt ở trạng thái của màn khác. */
  applyTop(decideTop(y, delta));
  armTabBarRestore();
}

/** Called on tab switch — the web resets visibility per route */
export function resetTabBar() {
  lastY = 0;
  lastYUI.value = 0;
  target.value = 1;
  tabBarVisible.value = withSpring(1, SPRING);
  topTarget.value = 1;
  topChromeVisible.value = withTiming(1, { duration: TOP_MS, easing: TOP_EASE });
}
