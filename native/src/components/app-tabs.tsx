import Tabs from 'expo-router/js-tabs';

import { LiquidTabBar } from '@/components/ascnd/liquid-tab-bar';
import { colors } from '@/constants/ascnd';

/**
 * Tabs shell — renders the web app's floating liquid-glass pill bar
 * (LiquidTabBar) instead of the system tab bar, so the navigation looks
 * identical to the original design. Screens stay native.
 */
export default function AppTabs() {
  return (
    <Tabs
      tabBar={(props) => <LiquidTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.background },
      }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="nutrition" />
      <Tabs.Screen name="workouts" />
      <Tabs.Screen name="progress" />
      {/*
        Settings is the fifth tab, which is Apple's maximum for iPhone.

        Their guidance is that tabs are peer *sections* of content and settings
        is a utility, so strictly it belongs behind a button rather than in the
        bar. It is here because it was asked for, and the cost is worth naming:
        one of five equal slots now goes to a screen people open rarely.
      */}
      <Tabs.Screen name="settings" />
    </Tabs>
  );
}
