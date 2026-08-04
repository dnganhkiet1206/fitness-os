import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { colors } from '@/constants/ascnd';
import { useI18n } from '@/hooks/use-app-settings';
import { scrollActiveToTop } from '@/lib/scroll-to-top';
import { resetTabBar } from '@/lib/tab-bar-visibility';

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
    // A tab you arrive at starts with its bar showing, whatever the last page
    // left it as
    resetTabBar();
    if (navigation.isFocused()) scrollActiveToTop();
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
export default function AppTabs() {
  const i18n = useI18n();

  return (
    <NativeTabs
      /*
        Selected is near-white, unselected is the muted grey.

        It was `colors.primary`, the brand silver — and against the unselected
        grey that is a contrast of 1.74:1, which is to say the selected tab was
        barely a different colour from the other four. Nothing was wrong with
        the bar; you simply could not see which tab you were on. Foreground
        against the same grey is 3.28:1.

        Monochrome on purpose, rather than reaching for one of the neon
        signals. Those colours mean something everywhere else in the app — a
        state, a metric, a warning — and a tab bar tinted green would be the
        one green on screen that does not mean "good".
      */
      tintColor={colors.foreground}
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
      minimizeBehavior="onScrollDown">
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
