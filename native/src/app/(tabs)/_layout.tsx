import { View } from 'react-native';

import AppTabs from '@/components/app-tabs';
import { HealthAssistantFab } from '@/components/ascnd/health-assistant-fab';

/**
 * The tabs, and the health assistant floating off the right end of the bar.
 *
 * The button lives here rather than inside `AppTabs` because `NativeTabs`
 * renders a native navigator: anything passed as a child that is not a
 * `Trigger` or the system's own accessory has no place to go. As a sibling it
 * simply floats over whichever tab is showing, which is what a control that
 * belongs to none of them should do.
 */
export default function TabsLayout() {
  return (
    <View style={{ flex: 1 }}>
      <AppTabs />
      <HealthAssistantFab />
    </View>
  );
}
