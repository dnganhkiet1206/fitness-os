import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { CoachAccessory } from '@/components/ascnd/coach-accessory';
import { colors } from '@/constants/ascnd';
import { useI18n } from '@/hooks/use-app-settings';

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
 *   - scroll-to-top and pop-to-root on tapping the tab you are already on
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
        iOS 26's own hide-on-scroll. The app had a hand-written version — a
        shared value driven from every page's `onScroll`, animating the bar's
        opacity and offset — which the system now does from the scroll view
        directly, with no JS frame in the loop.
      */
      minimizeBehavior="onScrollDown">
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon sf="house" />
        <NativeTabs.Trigger.Label>{i18n.navToday}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="nutrition">
        <NativeTabs.Trigger.Icon sf="fork.knife" />
        <NativeTabs.Trigger.Label>{i18n.navNutrition}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="workouts">
        <NativeTabs.Trigger.Icon sf="dumbbell" />
        <NativeTabs.Trigger.Label>{i18n.navWorkouts}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="progress">
        <NativeTabs.Trigger.Icon sf="chart.line.uptrend.xyaxis" />
        <NativeTabs.Trigger.Label>{i18n.navProgress}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      {/*
        Settings is the fifth tab, which is Apple's maximum for iPhone.

        Their guidance is that tabs are peer *sections* of content and settings
        is a utility, so strictly it belongs behind a button rather than in the
        bar. It is here because it was asked for, and the cost is worth naming:
        one of five equal slots now goes to a screen people open rarely.
      */}
      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Icon sf="gearshape" />
        <NativeTabs.Trigger.Label>{i18n.settingsTitle}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      {/*
        The coach, in the system's own accessory slot above the bar.

        It opens a sheet of four actions — scan a meal, ask the coach, log
        biometrics, see sleep — and an action is not a destination. It used to
        be the middle item of the bar, which made one of five equal-looking
        slots behave unlike the other four: tap it and nothing navigates. iOS
        26 has a place for exactly this shape, so the accessory minimises and
        expands with the bar instead of being a capsule of ours floating near
        it.
      */}
      <NativeTabs.BottomAccessory>
        <CoachAccessory />
      </NativeTabs.BottomAccessory>
    </NativeTabs>
  );
}
