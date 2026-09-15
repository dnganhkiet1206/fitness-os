import * as Haptics from 'expo-haptics';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import type { LucideIcon } from 'lucide-react-native';
import { useCallback, useRef } from 'react';
import { Text, View } from 'react-native';
import Animated, { interpolate, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { Icon } from '@/components/ascnd/icon';
import { radius, spacing, type } from '@/constants/ascnd';
import { makeStyles } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';

/**
 * A row you can swipe, with the action growing out from under it.
 *
 * ── what makes the iOS one feel the way it does ──
 *
 * Three things, and none of them is the easing curve:
 *
 *   · **It tracks the finger.** Not "animates to a state on release" — the
 *     action is exactly as far open as you have dragged, on every frame. That
 *     is why `renderRightActions` is handed Reanimated shared values rather
 *     than a React number: the button's size is computed on the UI thread from
 *     the same drag the row is following, so the two can never lag apart.
 *   · **It commits before you let go.** Past the threshold the row is going to
 *     open whatever you do next, and it says so — the label appears and a tick
 *     of haptic fires. The reference material puts the same rule on the haptic:
 *     fire it on the causal event, on the same frame as the visual.
 *   · **A little hysteresis.** About ten points of movement before the gesture
 *     commits to a direction, so a vertical scroll that wanders sideways does
 *     not peel rows open on the way past.
 *
 * ── why this wraps `ReanimatedSwipeable` instead of a pan handler ──
 *
 * The physics — friction, overshoot, the release decision, the interaction with
 * a scrolling parent — is the hard part and `react-native-gesture-handler` 2.32
 * already ships it, tested, with exactly the knobs above. Writing a
 * `Gesture.Pan()` version means reimplementing a scroll conflict resolver, and
 * this repository has spent the whole session removing second implementations
 * of things it already had.
 *
 * What is ours is the presentation: the action is a capsule that grows, and the
 * word only appears once the row is committed.
 *
 * ── a swipe is never the only way ──
 *
 * `today-meals.tsx` argued this and was right: "Not a swipe and not a
 * long-press. Both are invisible until guessed." So every action reachable by
 * swiping here is also on a button somewhere the eye can find it. The swipe is
 * the fast path for people who know it is there, not the path.
 */

/** How far the row opens at rest. One action, one thumb's width. */
const OPEN_W = 84;

/**
 * Where the action commits.
 *
 * Two thirds of the open width. Below it a release springs shut, above it a
 * release opens — and the label appearing is what tells you which side of the
 * line you are on before you find out by letting go.
 */
const COMMIT = OPEN_W * 0.66;

/** Movement before the gesture takes the row, so a scroll can drift. */
const HYSTERESIS = 10;

/**
 * Một hành động vuốt.
 *
 * Là một KIỂU chứ không phải bốn prop rời, vì từ bản này một hàng mở ra được
 * nhiều nút mỗi bên — thẻ "Cần làm hôm nay" đòi ba nút ở mép phải (sửa lại,
 * hẹn giờ, bật/tắt nhắc) và một nút ở mép trái. Bốn prop rời thì con số ấy
 * không diễn đạt được.
 */
export type SwipeAction = {
  icon: LucideIcon;
  label: string;
  tint?: string;
  onPress: () => void;
};

/**
 * Bao nhiêu nút là quá nhiều.
 *
 * Apple để tối đa 3–4 nút mỗi mép. Ở đây chốt 3: mỗi nút rộng `OPEN_W`, nên ba
 * nút đã chiếm 252 điểm trên một màn 393 — hàng chỉ còn 141 điểm để nhìn thấy
 * mình là hàng nào. Nút thứ tư biến cú vuốt thành một thực đơn.
 */
const MAX_ACTIONS = 3;

function Action({
  progress,
  action,
  index,
  count,
}: {
  progress: SharedValue<number>;
  action: SwipeAction;
  index: number;
  count: number;
}) {
  const c = usePalette();
  const styles = stylesFor(c);
  /*
    `progress` is 1 at the open position and 0 closed, so the capsule reaches
    full size exactly when the row does — the two are the same drag.

    ── và vì sao có `lag` ──

    Nhiều nút xuất hiện CÙNG một lúc đọc ra là một khối đặc trượt vào. iOS thì
    mở lần lượt từ mép vào trong. `lag` đẩy điểm bắt đầu của từng nút theo thứ
    tự ấy — nút ngoài cùng (index 0, sát mép) mở trước — nhưng cả ba vẫn về
    đích ở cùng `progress` 1, nên không nút nào còn đang bò khi hàng đã dừng.
  */
  const lag = (index / Math.max(count, 1)) * 0.35;
  const grow = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(progress.value, [lag, 1], [0.72, 1], 'clamp') }],
    opacity: interpolate(progress.value, [lag, lag + 0.35, 1], [0, 0.6, 1], 'clamp'),
  }));
  /* The word arrives only once the row is committed. Before that it would be a
     label on a button you have not decided to press. */
  const word = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.66, 0.95], [0, 1], 'clamp'),
  }));

  return (
    <View style={styles.actionWrap}>
      <Animated.View style={[styles.action, { backgroundColor: action.tint ?? c.readinessRed }, grow]}>
        <Text
          accessibilityRole="button"
          accessibilityLabel={action.label}
          onPress={action.onPress}
          style={styles.hit}
        />
        <Icon icon={action.icon} size={17} color={c.primaryForeground} />
        <Animated.Text style={[styles.actionText, word]} numberOfLines={1}>
          {action.label}
        </Animated.Text>
      </Animated.View>
    </View>
  );
}

export function SwipeRow({
  children,
  right,
  left,
}: {
  children: React.ReactNode;
  /**
   * Mép PHẢI — vuốt từ phải sang trái.
   *
   * Apple để mép này cho thao tác kết thúc ngữ cảnh hoặc phá huỷ (Xoá, Lưu
   * trữ) và cho nhóm nhiều nút. Nút ĐẦU danh sách nằm ngoài cùng, sát mép,
   * đúng thứ tự `UISwipeActionsConfiguration` dựng.
   */
  right: SwipeAction[];
  /**
   * Mép TRÁI — vuốt từ trái sang phải. Thường chỉ MỘT nút.
   *
   * Apple để mép này cho một lối tắt ngữ cảnh: Ghim, Đã đọc, Yêu thích. Không
   * phải chỗ của thao tác phá huỷ, và không phải chỗ của một thực đơn.
   */
  left?: SwipeAction[];
}) {
  /* One tick, when the row crosses into "letting go will open this". Fired from
     the will-open callback rather than from a progress watcher so it cannot
     repeat while the finger wobbles on the line. */
  const buzzed = useRef(false);

  /*
    ── HAI HÀM NÀY PHẢI ỔN ĐỊNH, và đó là một lỗi ĐÃ LÀM APP THOÁT ──

    `onSwipeableWillOpen`/`WillClose` KHÔNG phải callback thường: thư viện gọi
    chúng qua `runOnJS` từ trong một worklet (`ReanimatedSwipeable.tsx`,
    `dispatchImmediateEvents`), và cái worklet ấy `useCallback` trên đúng danh
    tính của hai prop này. Truyền arrow inline ⇒ mỗi lần render là một danh
    tính mới ⇒ worklet dựng lại ⇒ một `SerializableRemoteFunction` MỚI, cái cũ
    bị thả. Một lệnh đã lên lịch còn đang bay lúc ấy sẽ đi tìm một hàm không
    còn nữa — `SIGABRT` trong `JSScheduler::scheduleOnJS`, đúng chữ ký A9
    trong hai báo cáo sự cố từ máy thật.

    Bản rà 11/09 không bắt được chỗ này vì nó đi tìm chữ `runOnJS` VIẾT TRONG
    code app. Ở đây không có chữ ấy: `runOnJS` nằm trong thư viện, còn app chỉ
    truyền một hàm. Cùng một lỗi, khác chỗ nhìn.

    `[]` là danh sách ĐÚNG, không phải danh sách rỗng cho tiện: `buzzed` là
    `useRef` nên danh tính của nó cố định trọn đời component, và hai hàm không
    đọc gì khác. `tools/runonjs-stable.mjs` canh để chỗ này không quay lại.
  */
  const onWillOpen = useCallback(() => {
    if (buzzed.current) return;
    buzzed.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);
  const onWillClose = useCallback(() => {
    buzzed.current = false;
  }, []);

  const rightSet = right.slice(0, MAX_ACTIONS);
  const leftSet = (left ?? []).slice(0, MAX_ACTIONS);

  /*
    Mọi hành động vuốt cũng là một hành động TRỢ NĂNG.

    Một cú vuốt vô hình với VoiceOver: người dùng rotor không có cách nào đoán
    ra nó. `accessibilityActions` là cách hệ điều hành hỏi "hàng này làm được
    gì", nên mỗi nút ở đây phải có mặt trong câu trả lời ấy — xem chú thích
    "a swipe is never the only way" ở đầu tệp, và `tools/swipe.mjs`.
  */
  const all = [...leftSet, ...rightSet];

  return (
    <View
      accessibilityActions={all.map((a) => ({ name: a.label, label: a.label }))}
      onAccessibilityAction={(e) => {
        all.find((a) => a.label === e.nativeEvent.actionName)?.onPress();
      }}>
      <ReanimatedSwipeable
        friction={2}
        rightThreshold={COMMIT}
        dragOffsetFromRightEdge={HYSTERESIS}
        overshootRight={false}
        {...(leftSet.length
          ? {
              leftThreshold: COMMIT,
              dragOffsetFromLeftEdge: HYSTERESIS,
              overshootLeft: false,
              renderLeftActions: (progress: SharedValue<number>) => (
                <View style={styles_panelLeft}>
                  {leftSet.map((a, i) => (
                    <Action key={a.label} progress={progress} action={a} index={i} count={leftSet.length} />
                  ))}
                </View>
              ),
            }
          : null)}
        onSwipeableWillOpen={onWillOpen}
        onSwipeableWillClose={onWillClose}
        renderRightActions={(progress) => (
          <View style={styles_panelRight}>
            {rightSet.map((a, i) => (
              <Action key={a.label} progress={progress} action={a} index={i} count={rightSet.length} />
            ))}
          </View>
        )}>
        {children}
      </ReanimatedSwipeable>
    </View>
  );
}

/*
  Thứ tự nút: cái ĐẦU danh sách nằm sát mép người ta vuốt từ đó.

  iOS dựng như thế (`UISwipeActionsConfiguration`: "the system arranges the
  actions from the outside edge inward"), nên ở mép PHẢI hàng phải đảo chiều —
  một `flexDirection: 'row'` thường sẽ đặt nút đầu vào trong cùng.
*/
const styles_panelRight = { flexDirection: 'row-reverse' } as const;
const styles_panelLeft = { flexDirection: 'row' } as const;

const stylesFor = makeStyles((c) => ({
  actionWrap: { width: OPEN_W, justifyContent: 'center', alignItems: 'center' },
  action: {
    flex: 1,
    marginVertical: 2,
    marginLeft: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    alignSelf: 'stretch',
  },
  /* The whole capsule is the target, laid over it rather than wrapping it — a
     Pressable around an Animated.View would fight the swipe for the gesture. */
  hit: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  actionText: { ...type.caption, color: c.primaryForeground, fontWeight: '700' },
}));
