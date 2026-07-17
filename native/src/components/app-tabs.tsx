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
    </Tabs>
  );
}
