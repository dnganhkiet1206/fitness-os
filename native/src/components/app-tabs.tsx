import { usePathname } from 'expo-router';
import { useRef } from 'react';
import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { colors } from '@/constants/ascnd';
import { useI18n } from '@/hooks/use-app-settings';
import { scrollActiveToTop } from '@/lib/scroll-to-top';
import { resetTabBar, showTopChrome } from '@/lib/tab-bar-visibility';

/**
 * Tapping the tab you are already on goes back to the top of it.
 *
 * The native bar has `disableScrollToTop`, defaulted to off, so UIKit does try
 * — by hunting for the first scroll view inside the tab and scrolling that.
 * It does not find these pages: `Screen` puts the ambient light in front of
 * its scroll view and the tab screens nest one or two levels deeper than the
 * search goes, so the tap did nothing and the feature disappeared with the old
 * hand-drawn bar that used to do it explicitly.
 *
 * So it stays explicit. `Screen` lends its scroll view to a single slot on
 * focus and takes it back on blur (see `lib/scroll-to-top`), and this asks
 * that slot to scroll.
 *
 * Guarded on `isFocused`, which is the whole subtlety: `tabPress` fires on
 * every tap, including the ones that are navigating *away from* somewhere
 * else. Ungated, tapping Nutrition from Today would scroll Today to the top on
 * the way out — invisible now, and waiting for you the next time you came
 * back to it.
 */
/**
 * The page colour, behind every tab's content.
 *
 * The old navigator set this through `screenOptions.sceneStyle` and the switch
 * to `NativeTabs` dropped it, which left each tab's container with no
 * background of its own. What shows through in the gap between one tab's view
 * going away and the next one drawing is then whatever the system's default
 * is — a pale flash on a dark app, on every single tab change.
 */
const CONTENT = { backgroundColor: colors.background } as const;

const scrollToTopOnRetap = ({ navigation }: { navigation: { isFocused: () => boolean } }) => ({
  tabPress: () => {
    // A tab you arrive at starts with its BAR showing, whatever the last page
    // left it as — the bar is navigation and must always be reachable.
    resetTabBar();
    /* Hàng nút góc trên thì không: nó là hàm của vị trí cuộn, và vị trí cuộn
       được giữ nguyên khi đổi tab. Chỉ cú chạm-lại-tab-đang-mở mới đưa nó về,
       vì chỉ cú ấy mới thật sự đưa trang về đỉnh. */
    if (navigation.isFocused()) {
      scrollActiveToTop();
      showTopChrome();
    }
  },
});

/**
 * The tab bar is UIKit's, not ours.
 *
 * ── why this replaced a hand-drawn one ──
 *
 * There was a custom bar here: a floating capsule with a glass fill, a
 * selection pill, labels, hide-on-scroll and haptics, all written by hand.
 * Every round of "make it more like Apple's" was another measurement copied
 * off a screenshot — 25pt glyph, 50pt row, 21pt inset, a capsule behind the
 * selected item — and each was right for about a week, because those numbers
 * are not a design. They are a snapshot of one iOS version's private metrics.
 *
 * `NativeTabs` mounts a real `UITabBarController`. Everything that was being
 * chased comes from the system and stays correct without being maintained:
 *
 *   - Liquid Glass, the actual material, with the lensing and specular edge no
 *     stack of `GlassView`s reproduces
 *   - the selection capsule, which on iOS 26 the framework draws and will not
 *     let an app remove
 *   - the metrics, in whatever they are this year
 *   - minimise-on-scroll, Apple's own, replacing a hand-rolled hide/show
 *   - pop-to-root on tapping the tab you are already on
 *   - Dynamic Type, Reduce Transparency, and VoiceOver's "tab, 2 of 5,
 *     selected" — all of which had to be re-declared by hand on a `Pressable`
 *
 * ── the icons ──
 *
 * SF Symbols, outline throughout, and the same weight on every tab.
 *
 * The filled-when-selected convention is the nicer one and it could not be had
 * evenly here: `house`, `dumbbell` and `gearshape` have `.fill` variants,
 * `fork.knife` and `chart.line.uptrend.xyaxis` do not. Three tabs solidifying
 * on selection while two stay hollow is the kind of thing nobody can name and
 * everybody notices. The alternative was swapping those two for symbols that
 * do fill — a carrot for the food diary, a bar chart for a page of line charts
 * — and a worse glyph is a worse glyph every time you look at it, while an
 * uneven flourish is only wrong on the tap.
 *
 * So the tint and the system's capsule carry the selection, and all five tabs
 * behave identically.
 *
 * Lucide stays for content: the tab bar is chrome, and chrome belongs to the
 * platform.
 *
 * ── four tabs, and Settings is not one of them ──
 *
 * It was the fifth for a while. Apple's guidance is that tabs are peer
 * *sections* of content and settings is a utility, so it never sat right: one
 * of five equal slots going to a screen people open rarely, while the four
 * that carry the app got a fifth less room each.
 *
 * It is reached from the Today header, where its button had always been, and
 * `/settings` is unchanged — every link to it still works.
 *
 * ── what it costs ──
 *
 * `expo-router/unstable-native-tabs` is what its name says: the API can change
 * in a minor version, and this is the app's entire navigation. So the way back
 * is worth stating — it is this one file, and the previous bar is still in
 * `ascnd/liquid-tab-bar`, untouched.
 *
 * Android gets Material 3's bottom bar from the same component. Its own
 * platform's bar, which is the same bargain.
 */
/**
 * The five routes that *are* tabs.
 *
 * Everything else in the app is pushed on the root stack, on top of the whole
 * `UITabBarController` — so while one of those is open, whether the bar is
 * hidden is invisible either way. What is *not* invisible is **changing** it:
 * see `hidden` below.
 */
const TAB_ROUTES = ['/', '/nutrition', '/workouts', '/progress', '/assistant'];

export default function AppTabs() {
  const pathname = usePathname();
  const i18n = useI18n();

  /*
    ── the bar's visibility is frozen while anything is pushed over it ──

    `hidden={pathname === '/assistant'}` was the obvious version and it caused a
    visible flash: push `/ai-coach` from the assistant and `pathname` becomes
    `/ai-coach`, so `hidden` flips to false and the bar comes *back* — sliding
    up underneath the screen that is still sliding in, for about a third of a
    second, on a page that had deliberately hidden it.

    This was always happening; the `animated:YES` patch is what made it
    visible. Before, the bar snapped back in one frame during a transition
    nobody was looking at the bottom of. Three hundred milliseconds of movement
    is a different matter, and this is the cost of that patch showing up
    somewhere it was not expected — worth knowing before reaching for it again.

    Every push from the assistant did it, not only the coach: the metric tiles
    and the tools grid all open root-stack routes.

    So the last *tab* is what decides, and a push does not change it. The ref is
    written during render on purpose — `usePathname` re-renders on every
    navigation, so when the pathname is a tab this recomputes with the new
    value, and when it is a pushed route it keeps the old one. No effect, no
    extra render, and nothing to get out of step.
  */
  const lastTab = useRef('/');
  if (TAB_ROUTES.includes(pathname)) lastTab.current = pathname;
  const hidden = lastTab.current === '/assistant';

  return (
    <NativeTabs
      /*
        Tab đang chọn mang BẠC THƯƠNG HIỆU — cùng màu với glyph ngôi nhà ở
        Health Assistant, thứ người dùng chỉ vào khi xin thay đổi này.

        `colors.primary` (#a8afbd) đúng là đầu tối của dải màu glyph ấy:
        `GLYPH_TINT.home = ['#f2f3f6', '#a8afbd']` trong `assistant-icons.tsx`.
        Và bảng màu tự nó đã ghi vì sao bạc là thương hiệu: "brand silver là một
        BẢN SẮC, không phải một tín hiệu".

        ── và đây là lần đảo ngược của chính ghi chú đứng ở đây ──

        Ghi chú cũ nói: từng là `colors.primary`, đổi sang `foreground` vì bạc
        so với xám chưa chọn chỉ 1,74:1 — "bạn đơn giản là không thấy mình đang
        ở tab nào". Con số ấy ĐÚNG, và tôi tính lại được y hệt. Nhưng TIỀN ĐỀ
        của nó thì không phải thứ đang chạy.

        Đo pixel trên ảnh chụp máy thật (lấy điểm sáng nhất của mỗi glyph):

            tab chưa chọn   rgb(255,255,255)   L = 1.000   ← TRẮNG, không phải
                                                            xám mutedForeground
            tab đang chọn   rgb(232,232,232)   L = 0.807

        Tức `iconColor={{ default: mutedForeground }}` bên dưới KHÔNG có tác
        dụng trên iOS 26 của máy này — glyph chưa chọn vẫn trắng nguyên. Nên
        con số thật của cái ray đang chạy là:

            foreground so với trắng   1,17:1   ← gần như không phân biệt được
            primary   so với trắng    2,20:1

        Nghĩa là màu người dùng xin không chỉ hợp bản sắc, nó còn tách tab đang
        chọn ra RÕ HƠN gấp đôi so với thứ đang có. Và nó không mâu thuẫn với ghi
        chú cũ: 1,74:1 là bạc so với XÁM, còn 2,20:1 là bạc so với TRẮNG.

        ── cái bẫy còn lại, ghi ra thay vì để nó nằm im ──

        Nếu một ngày `iconColor` bên dưới bắt đầu có tác dụng (đổi phiên bản
        iOS, đổi expo-router, hoặc chạy trên Android nơi
        `appearance.android.js` có dùng nó), tab chưa chọn thành xám và bạc tụt
        về đúng 1,74:1 mà ghi chú cũ đã bác. Lúc ấy phải chọn lại một trong hai,
        không được giữ cả hai: hoặc chưa chọn TRẮNG + đang chọn BẠC (2,20:1),
        hoặc chưa chọn XÁM + đang chọn NHẠT (3,28:1).

        ── vì sao là `tintColor` chứ không phải `iconColor.selected` ──

        `tintColor` nhuộm CẢ glyph lẫn nhãn của mục đang chọn — navigator đọc nó
        thành `selectedIconColor` và `selectedLabelStyle.color`. Đó đúng là thứ
        Apple Music làm: đo trên ảnh chụp, cả icon lẫn chữ "Home" đều
        rgb(254,92,124). Nhuộm mỗi icon thì nhãn ở lại một màu khác và mục đang
        chọn nói hai giọng.

        ── và vì sao KHÔNG lấy một màu neon ──

        Ghi chú cũ đúng ở điểm này và nó được giữ nguyên: những màu kia mang
        nghĩa ở khắp nơi trong app — một trạng thái, một chỉ số, một cảnh báo —
        nên một thanh tab xanh lá sẽ là màu xanh lá duy nhất trên màn hình không
        có nghĩa "tốt".
      */
      tintColor={colors.primary}
      iconColor={{ default: colors.mutedForeground }}
      labelStyle={{ default: { color: colors.mutedForeground } }}
      /*
        Out of the way when you scroll down, back when you scroll up.

        This is the platform's own, and it has to be: the alternative was
        driving `hidden` from a scroll listener, which is React state, which
        re-renders the whole navigator every time the direction changes. On a
        long page that is several re-renders of the thing hosting all five tabs
        during one flick, and it flickered.

        `onScrollDown` costs nothing per frame — UIKit tracks the scroll view
        itself, with no JS in the loop. If it turns out not to fire on these
        pages, the answer is to make the scroll view findable, not to animate
        the bar from JavaScript.
      */
      minimizeBehavior="onScrollDown"
      /*
        Gone while the Health Assistant is open.

        That page is full-bleed — the aura runs to all four edges and the ask
        bar sits where the capsule would be — so the bar is not furniture there,
        it is something covering the screen. Its own back button returns to
        Today, which is the only way out and is meant to be.

        ── this is not the thing the comment above warns against ──

        Driving `hidden` from a *scroll* listener re-renders this navigator
        several times per flick, which is what flickered. This is driven by the
        route, so it changes exactly once per tab switch — the same frequency as
        the navigation that caused it. `usePathname` rather than
        `useSegments()`: the tab's own path is what decides, and a path is a
        string comparison rather than an array to reason about.

        ── it slides, and that took a patch ──

        `react-native-screens` hard-codes `animated:NO` on both paths that apply
        this prop, so the bar went from there to not-there between two frames.
        Nothing in JS can soften that: the bar is a `UITabBar` owned by a
        `UITabBarController`, outside the React view hierarchy entirely, so
        there is no view here to animate and no opacity here to drive.

        `patches/react-native-screens+4.25.2.patch` changes those two calls to
        `animated:YES` and UIKit slides the capsule off the bottom edge instead.
        The patch is two lines and it is pinned to the version in its filename —
        bump the package and `patch-package` fails loudly at `postinstall`
        rather than quietly restoring the blink. `tools/check.mjs` checks it is
        still there, because the failure mode is a thing you only notice by
        looking.

        The arrival on the other side is timed to it: ~300ms for the bar,
        340ms for the assistant's cards, 420ms for its light. See `settle.tsx`.
      */
      hidden={hidden}>
      <NativeTabs.Trigger name="index" listeners={scrollToTopOnRetap} contentStyle={CONTENT}>
        <NativeTabs.Trigger.Icon sf="house" />
        <NativeTabs.Trigger.Label>{i18n.navToday}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="nutrition" listeners={scrollToTopOnRetap} contentStyle={CONTENT}>
        <NativeTabs.Trigger.Icon sf="fork.knife" />
        <NativeTabs.Trigger.Label>{i18n.navNutrition}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="workouts" listeners={scrollToTopOnRetap} contentStyle={CONTENT}>
        <NativeTabs.Trigger.Icon sf="dumbbell" />
        <NativeTabs.Trigger.Label>{i18n.navWorkouts}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="progress" listeners={scrollToTopOnRetap} contentStyle={CONTENT}>
        <NativeTabs.Trigger.Icon sf="chart.line.uptrend.xyaxis" />
        <NativeTabs.Trigger.Label>{i18n.navProgress}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      {/*
        The health assistant, drawn as an island beside the capsule.

        `role="search"` is doing the work. It is the only role iOS 26 lays out
        that way — the tab capsule shrinks and this one is drawn as a separate
        circle to its right — and that layout cannot be built from this side:
        nothing in an app can ask a `UITabBarController` to stand aside for a
        button floating over it. Giving it a fifth item and letting it move
        itself is the whole mechanism.

        The role brings a fixed system title with it, which is why the label is
        hidden and the name comes from `accessibilityLabel` instead. The icon
        it would have supplied is overridden; the title cannot be.

        This is also why the four actions became a page rather than a sheet: a
        tab is a destination, and the system will navigate to it. It was never
        really an action anyway — it was a menu of four screens.
      */}
      <NativeTabs.Trigger
        name="assistant"
        role="search"
        accessibilityLabel={i18n.nHealthAssistant}
        listeners={scrollToTopOnRetap}
        contentStyle={CONTENT}>
        <NativeTabs.Trigger.Icon sf="heart.text.square" />
        <NativeTabs.Trigger.Label hidden>{i18n.nHealthAssistant}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

    </NativeTabs>
  );
}
