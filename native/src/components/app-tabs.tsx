import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { colors } from '@/constants/ascnd';
import { useI18n } from '@/hooks/use-app-settings';

/**
 * Real UITabBarController tabs — system Liquid Glass, scroll edge effects
 * and haptics come for free from iOS.
 */
export default function AppTabs() {
  const i18n = useI18n();
  return (
    <NativeTabs
      backgroundColor={colors.background}
      labelStyle={{ selected: { color: colors.foreground } }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>{i18n.navToday}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'house', selected: 'house.fill' }}
          src={require('@/assets/images/tabIcons/home.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="nutrition">
        <NativeTabs.Trigger.Label>{i18n.navNutrition}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'fork.knife', selected: 'fork.knife' }}
          src={require('@/assets/images/tabIcons/explore.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="workouts">
        <NativeTabs.Trigger.Label>{i18n.navWorkouts}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'dumbbell', selected: 'dumbbell.fill' }}
          src={require('@/assets/images/tabIcons/explore.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="progress">
        <NativeTabs.Trigger.Label>{i18n.navProgress}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'chart.line.uptrend.xyaxis', selected: 'chart.line.uptrend.xyaxis' }}
          src={require('@/assets/images/tabIcons/explore.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
