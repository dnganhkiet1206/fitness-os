import { Stack } from 'expo-router';

import { colors } from '@/constants/ascnd';

/**
 * The training tab is a stack, and it is the only tab that is one.
 *
 * ── what this buys, and why nothing else needs it ──
 *
 * `NativeTabs` mounts a real `UITabBarController`, and everything else in this
 * app is pushed on the *root* stack — on top of that controller. That is right
 * for what those screens are: `/log-meal`, `/settings`, `/exercises` are places
 * you go and come back from, and covering the bar while you are there is what
 * iOS does with a presented screen.
 *
 * Plan is not one of those. It is the training tab's own content, one level
 * down, and a root push would take the tab bar away with it — so while you were
 * reading your week, Tập luyện would stop being lit and there would be nothing
 * on screen saying which tab you were in. That is the whole difference between
 * "a page in the tab" and "a page over the tabs", and it is visible from across
 * the room.
 *
 * Nested, UIKit gives the tab its own navigation controller: the bar stays, the
 * tab stays selected, the swipe-back gesture works, and tapping Tập luyện while
 * Plan is open pops back to the tab's page — the pop-to-root the tab bar has
 * always promised and could not deliver for a route it did not own.
 *
 * ── no header ──
 *
 * `headerShown: false` for the same reason the root stack sets it: `Screen`
 * draws this app's header, with its own back button, title and aura. A second
 * one from the navigator would sit above it.
 */
export default function WorkoutsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        /* The page colour, so the gap between one screen leaving and the next
           arriving is not the system's default white — the same reason
           `app-tabs.tsx` sets `contentStyle` on every trigger. */
        contentStyle: { backgroundColor: colors.background },
      }}
    />
  );
}
