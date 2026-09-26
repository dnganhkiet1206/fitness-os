import {
  Tabs,
  TabList,
  TabTrigger,
  TabSlot,
  TabTriggerSlotProps,
  TabListProps,
} from 'expo-router/ui';
import { SymbolView } from 'expo-symbols';
import { Pressable, useColorScheme, View, StyleSheet } from 'react-native';

import { ExternalLink } from './external-link';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { Colors, MaxContentWidth, Spacing } from '@/constants/expo-template-theme';

export default function AppTabs() {
  return (
    <Tabs>
      {/* #147: thanh tab của bộ đo nằm TRONG dòng chảy, dưới nội dung — không
          phủ lên đầu mọi màn. Bản cũ `position: absolute` ở trên cùng đè lên
          nút Cài đặt, Tìm, Thông báo…: lượt bấm thử thấy chúng "bị che", và ảnh
          chụp của bộ đo mất một dải đầu trang. iOS không dùng tệp này. */}
      <TabSlot style={{ flex: 1 }} />
      <TabList asChild>
        <CustomTabList>
          <TabTrigger name="index" href="/" asChild>
            <TabButton>Today</TabButton>
          </TabTrigger>
          <TabTrigger name="nutrition" href="/nutrition" asChild>
            <TabButton>Nutrition</TabButton>
          </TabTrigger>
          <TabTrigger name="workouts" href="/workouts" asChild>
            <TabButton>Workouts</TabButton>
          </TabTrigger>
          <TabTrigger name="community" href="/community" asChild>
            <TabButton>Community</TabButton>
          </TabTrigger>
          {/* #117: tab thứ năm, như trên iOS (`app-tabs.tsx`: Trợ lý là ô
              `role="search"` đứng cạnh viên nang). Thiếu nó, `/assistant` trên
              web bị chuyển về `/`, và bộ chạy `live.mjs` đo màn Hôm nay dưới
              nhãn "/assistant" — màn Trợ lý chưa từng được quét. Thanh tab này
              chỉ có trên bản web, tức bộ đo; app ship trên iOS không đổi. */}
          <TabTrigger name="assistant" href="/assistant" asChild>
            <TabButton>Assistant</TabButton>
          </TabTrigger>
        </CustomTabList>
      </TabList>
    </Tabs>
  );
}

export function TabButton({ children, isFocused, ...props }: TabTriggerSlotProps) {
  return (
    <Pressable {...props} style={({ pressed }) => pressed && styles.pressed}>
      <ThemedView
        type={isFocused ? 'backgroundSelected' : 'backgroundElement'}
        style={styles.tabButtonView}>
        <ThemedText type="small" themeColor={isFocused ? 'text' : 'textSecondary'}>
          {children}
        </ThemedText>
      </ThemedView>
    </Pressable>
  );
}

export function CustomTabList(props: TabListProps) {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];

  return (
    /* `harness-tabs`: live.mjs (#147) nhận ra thanh này — một nút bị NÓ che là
       hình học của bộ đo (thanh tab web khác chiều cao thanh tab iOS mà Koa
       chừa chỗ cho), không phải một nút vô hình của app. */
    <View {...props} nativeID="harness-tabs" style={styles.tabListContainer}>
      <ThemedView type="backgroundElement" style={styles.innerContainer}>
        <ThemedText type="smallBold" style={styles.brandText}>
          ASCND
        </ThemedText>

        {props.children}

      </ThemedView>
    </View>
  );
}

const styles = StyleSheet.create({
  tabListContainer: {
    width: '100%',
    padding: Spacing.three,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
  },
  innerContainer: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.five,
    borderRadius: Spacing.five,
    flexDirection: 'row',
    alignItems: 'center',
    flexGrow: 1,
    gap: Spacing.two,
    maxWidth: MaxContentWidth,
  },
  brandText: {
    marginRight: 'auto',
  },
  pressed: {
    opacity: 0.7,
  },
  tabButtonView: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
  },
  externalPressable: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.one,
    marginLeft: Spacing.three,
  },
});
