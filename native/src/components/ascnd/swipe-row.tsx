import * as Haptics from 'expo-haptics';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import type {
  SwipeableMethods,
  SwipeDirection,
} from 'react-native-gesture-handler/lib/typescript/components/ReanimatedSwipeable/ReanimatedSwipeableProps';
import type { LucideIcon } from 'lucide-react-native';
import { useCallback, useRef } from 'react';
import { Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';

import { Icon } from '@/components/ascnd/icon';
import { radius, spacing, type } from '@/constants/ascnd';
import { makeStyles } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';

/**
 * A row you can swipe, with the actions growing out from under it.
 *
 * ── what makes the iOS one feel the way it does ──
 *
 * Four things, and none of them is the easing curve:
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
 *   · **The row itself changes shape.** Dragged open it rounds its corners and
 *     reads as a card that has been pulled aside, not as a strip of list that
 *     slid. Chủ dự án chỉ đúng chi tiết này trong ảnh Nhắc nhở của iOS.
 *
 * ── why this wraps `ReanimatedSwipeable` instead of a pan handler ──
 *
 * The physics — friction, overshoot, the release decision, the interaction with
 * a scrolling parent — is the hard part and `react-native-gesture-handler` 2.32
 * already ships it, tested, with exactly the knobs above. Writing a
 * `Gesture.Pan()` version means reimplementing a scroll conflict resolver, and
 * this repository has spent whole sessions removing second implementations of
 * things it already had.
 *
 * What is ours is the presentation, and one thing the library does NOT have:
 * kéo dài ra để làm luôn, không cần bấm nút. Xem `FULL_SWIPE_AT`.
 *
 * ── a swipe is never the only way ──
 *
 * `today-meals.tsx` argued this and was right: "Not a swipe and not a
 * long-press. Both are invisible until guessed." So every action reachable by
 * swiping here is also on a button somewhere the eye can find it, and every one
 * of them is an `accessibilityAction` as well — VoiceOver never "sees" a
 * gesture. Xem `tools/swipe.mjs`.
 */

/**
 * Bề rộng một nút, và hình học bên trong nó.
 *
 * ── bản trước sai ở đâu ──
 *
 * Nút cũ là một viên thuốc CAO BẰNG CẢ HÀNG (`flex: 1`, `alignSelf: stretch`)
 * với icon và chữ chồng lên nhau ở giữa. Trên máy thật nó đọc ra là một khối
 * đen to bằng cả dòng, và chủ dự án gửi ảnh Nhắc nhở của iOS kèm yêu cầu: "icon
 * phải nhỏ hơn thẻ và chữ xuất hiện bên dưới icon", "các nút tách ra".
 *
 * Trong ảnh ấy mỗi nút là một ô VUÔNG bo góc chỉ chứa icon, icon nhỏ hơn ô khá
 * nhiều, và CHỮ nằm bên dưới ô chứ không nằm trong. Ba ô cách nhau rõ ràng.
 *
 * Các con số dưới đây đọc ra từ ảnh ấy bằng MẮT, không phải bằng phép đo pixel
 * — ảnh không nằm trên đĩa để đo. Tỉ lệ icon/ô ≈ 20/46, tức icon chiếm chưa
 * tới một nửa bề ngang ô, đúng cái làm nó "nhỏ hơn thẻ".
 */
const CAPSULE = 46;
const CAPSULE_ICON = 20;
/** Ô + khe + dòng chữ. Ba nút là 216 điểm trên một màn 393. */
const OPEN_W = 72;

/**
 * Where the action commits.
 *
 * Under this and letting go springs the row shut; over it and the row opens.
 * Two thirds rather than a half, so a flick that was really a scroll does not
 * leave a row hanging open; and well under the full width, so there is a moment
 * where you have decided but not finished — that is the moment the haptic and
 * the label are for.
 */
const COMMIT = OPEN_W * 0.66;

/** Movement before the gesture takes the row, so a scroll can drift. */
const HYSTERESIS = 10;

/**
 * Kéo quá đây là LÀM LUÔN, không cần bấm nút.
 *
 * ── vì sao phải tự dựng ──
 *
 * `UISwipeActionsConfiguration` của iOS có `performsFirstActionWithFullSwipe`,
 * và SwiftUI có `allowsFullSwipe`. `ReanimatedSwipeable` 2.32 thì KHÔNG —
 * đọc hết `ReanimatedSwipeableProps.d.ts` của đúng bản đang cài: có `friction`,
 * `leftThreshold`, `overshootLeft`, `overshootFriction`, các callback mở/đóng,
 * và `swipeableMethods` ({ close, openLeft, openRight, reset }). Không có cờ
 * nào cho cú kéo dài.
 *
 * Nên nó được ghép từ những thứ có: cho phép kéo quá bề rộng nút
 * (`overshootLeft`) với ma sát 8 để nó nặng dần lên như của Apple; theo dõi
 * `translation` — thứ thư viện đưa thẳng vào hàm dựng nút — và khi nó vượt
 * `FULL_SWIPE_AT` thì bật cờ cùng một tiếng haptic NẶNG hơn tiếng cam kết
 * thường, để ngón tay biết mình vừa bước qua một ngưỡng khác. Lúc thả,
 * `onSwipeableWillOpen` đọc cờ ấy, chạy hành động đầu tiên rồi `close()`.
 *
 * 0,45 chứ không phải 0,5: ngón cái với tới giữa màn là hết tầm thoải mái, và
 * một ngưỡng người ta phải rướn mới qua được thì không ai dùng lần thứ hai.
 */
const FULL_SWIPE_AT = 0.45;

/**
 * Một hành động vuốt.
 *
 * Là một KIỂU chứ không phải bốn prop rời, vì một hàng mở ra được nhiều nút mỗi
 * bên — thẻ "Cần làm hôm nay" đòi ba nút ở mép phải (sửa lại, hẹn giờ, bật/tắt
 * nhắc) và một nút ở mép trái.
 */
export type SwipeAction = {
  icon: LucideIcon;
  /**
   * Luôn phải có, kể cả khi KHÔNG vẽ ra.
   *
   * Nó là thứ VoiceOver đọc và là tên của accessibility action, nên một nút chỉ
   * có glyph vẫn phải khai. `glyphOnly` chỉ quyết định có in chữ ấy ra hay
   * không, chứ không quyết định nó có tồn tại hay không.
   */
  label: string;
  tint?: string;
  /**
   * Màu mực trên ô, khi mặc định không đúng.
   *
   * Mặc định là `primaryForeground`, và nó ĐẢO giữa hai diện mạo: trắng ở bản
   * sáng, gần đen ở bản tối. Với chữ trên nền đỏ điều đó đúng (5,78:1 bản tối).
   * Nhưng chủ dự án đặt hàng nút bỏ qua là "một dấu trừ màu TRẮNG nền đỏ", và
   * trắng ở cả hai diện mạo thì token đúng là `destructiveForeground` — thứ vốn
   * sinh ra cho mực trên mặt đỏ. Đo: 4,96:1 bản sáng · 3,48:1 bản tối, trên sàn
   * 3:1 của WCAG 1.4.11 cho một vật thể đồ hoạ mang nghĩa.
   */
  ink?: string;
  /** Chỉ vẽ ô và glyph, không in chữ bên dưới. */
  glyphOnly?: boolean;
  onPress: () => void;
};

/**
 * Bao nhiêu nút là quá nhiều.
 *
 * Apple để tối đa 3–4 nút mỗi mép. Ở đây chốt 3: mỗi nút rộng `OPEN_W`, nên ba
 * nút đã chiếm 216 điểm trên một màn 393 — hàng chỉ còn ~177 điểm để nhìn thấy
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

  const ink = action.ink ?? c.primaryForeground;

  return (
    <View style={styles.actionWrap}>
      <Animated.View style={[styles.capsule, { backgroundColor: action.tint ?? c.readinessRed }, grow]}>
        <Text
          accessibilityRole="button"
          accessibilityLabel={action.label}
          onPress={action.onPress}
          style={styles.hit}
        />
        <Icon icon={action.icon} size={CAPSULE_ICON} color={ink} />
      </Animated.View>
      {action.glyphOnly ? null : (
        <Animated.Text style={[styles.actionText, word]} numberOfLines={1}>
          {action.label}
        </Animated.Text>
      )}
    </View>
  );
}

/**
 * Chép `progress` của thư viện sang một shared value của MÌNH.
 *
 * Bo góc hàng phải chạy theo cú kéo, mà `progress` chỉ được thư viện đưa vào
 * hàm dựng nút — không đưa ra ngoài. Đây là cây cầu: một component (nên gọi
 * hook được) sống trong tấm nút, không vẽ gì cả, chỉ chuyển giá trị ra.
 *
 * Không vẽ gì nên không tốn một lớp nào trong cây.
 */
function Track({ from, to }: { from: SharedValue<number>; to: SharedValue<number> }) {
  useAnimatedReaction(
    () => from.value,
    (v) => {
      to.value = v;
    },
  );
  return null;
}

export function SwipeRow({
  children,
  right,
  left,
  fullSwipe = false,
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
  /**
   * Kéo dài qua mép trái là làm luôn hành động đầu tiên bên ấy.
   *
   * Chỉ bật ở nơi hành động ấy HOÀN TÁC ĐƯỢC. Một cú kéo dài là cú dễ lỡ tay
   * nhất trong cả bộ cử chỉ: nó bắt đầu giống hệt một cú vuốt thường và chỉ
   * khác ở chỗ ngón tay dừng lại. Xem `FULL_SWIPE_AT`.
   */
  fullSwipe?: boolean;
}) {
  /* One tick, when the row crosses into "letting go will open this". Fired from
     the will-open callback rather than from a progress watcher so it cannot
     repeat while the finger wobbles on the line. */
  const buzzed = useRef(false);
  /* Cú kéo dài: cờ được bật trên luồng UI, đọc lúc thả. */
  const armed = useRef(false);
  const methods = useRef<SwipeableMethods | null>(null);
  const width = useRef(0);
  const openness = useSharedValue(0);

  const rightSet = right.slice(0, MAX_ACTIONS);
  const leftSet = (left ?? []).slice(0, MAX_ACTIONS);
  const firstLeft = leftSet[0];

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

    Danh sách phụ thuộc chỉ có `firstLeft`, thứ DUY NHẤT hai hàm đọc ngoài các
    ref (ref thì danh tính cố định trọn đời component).
    `tools/runonjs-stable.mjs` canh để chỗ này không quay lại.
  */
  const onWillOpen = useCallback(
    (direction: SwipeDirection) => {
      if (armed.current && direction === 'left' && firstLeft) {
        armed.current = false;
        firstLeft.onPress();
        methods.current?.close();
        return;
      }
      if (buzzed.current) return;
      buzzed.current = true;
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    [firstLeft],
  );
  const onWillClose = useCallback(() => {
    buzzed.current = false;
    armed.current = false;
  }, []);

  /* Ngưỡng kéo-dài đã qua: một tiếng NẶNG hơn tiếng cam kết thường, vì đây là
     một ngưỡng khác chứ không phải cùng một ngưỡng lặp lại. */
  const armFull = useCallback((on: boolean) => {
    if (armed.current === on) return;
    armed.current = on;
    if (on) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, []);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    width.current = e.nativeEvent.layout.width;
  }, []);

  /*
    Hàng bo góc lại khi bị kéo ra.

    Đây là chi tiết chủ dự án chỉ trong ảnh Nhắc nhở của iOS: hàng không trượt
    đi như một dải danh sách, nó CO LẠI thành một tấm thẻ có góc bo. Bán kính
    chạy theo chính cú kéo (`openness`, chép từ `progress` của thư viện), nên nó
    là cùng một chuyển động chứ không phải một hiệu ứng chạy song song.

    Bo bằng MỘT LỚP CỦA MÌNH, không nhét vào `childrenContainerStyle` của thư
    viện: chỗ ấy chạy được (thư viện gắn thẳng vào một `Animated.View` —
    `ReanimatedSwipeable.js`: `style: [animatedStyle, childrenContainerStyle]`)
    nhưng kiểu của nó khai là `StyleProp<ViewStyle>`, nên đặt style động vào đó
    phải ép kiểu. Một cú ép kiểu ở đây là một lời hứa rằng tôi đã đọc mã thư
    viện và nó sẽ không đổi — lời hứa không ai kiểm được. Thêm một `Animated.View`
    có `overflow: hidden` thì đúng kiểu, và nó cũng CẮT nền hàng theo góc bo,
    thứ `borderRadius` trên lớp ngoài không tự làm được.
  */
  const rounded = useAnimatedStyle(() => ({
    borderRadius: interpolate(openness.value, [0, 1], [0, radius.md], 'clamp'),
  }));

  /*
    Mọi hành động vuốt cũng là một hành động TRỢ NĂNG.

    Một cú vuốt vô hình với VoiceOver: người dùng rotor không có cách nào đoán
    ra nó. `accessibilityActions` là cách hệ điều hành hỏi "hàng này làm được
    gì", nên mỗi nút ở đây phải có mặt trong câu trả lời ấy — xem chú thích
    "a swipe is never the only way" ở đầu tệp, và `tools/swipe.mjs`.
  */
  const all = [...leftSet, ...rightSet];

  const panel = (
    side: 'left' | 'right',
    set: SwipeAction[],
    progress: SharedValue<number>,
    translation: SharedValue<number>,
    api: SwipeableMethods,
  ) => {
    methods.current = api;
    return (
      <View style={side === 'left' ? styles_panelLeft : styles_panelRight}>
        <Track from={progress} to={openness} />
        {side === 'left' && fullSwipe ? (
          <FullSwipeWatch translation={translation} width={width} onArm={armFull} />
        ) : null}
        {set.map((a, i) => (
          <Action key={a.label} progress={progress} action={a} index={i} count={set.length} />
        ))}
      </View>
    );
  };

  return (
    <View
      onLayout={onLayout}
      accessibilityActions={all.map((a) => ({ name: a.label, label: a.label }))}
      onAccessibilityAction={(e) => {
        all.find((a) => a.label === e.nativeEvent.actionName)?.onPress();
      }}>
      <ReanimatedSwipeable
        friction={2}
        rightThreshold={COMMIT}
        dragOffsetFromRightEdge={HYSTERESIS}
        overshootRight={false}
        /* Kéo quá bề rộng nút chỉ có nghĩa khi cú kéo dài được bật; ma sát 8 là
           con số tài liệu của thư viện gọi là "for a native feel". */
        overshootLeft={fullSwipe}
        overshootFriction={8}
        {...(leftSet.length
          ? {
              leftThreshold: COMMIT,
              dragOffsetFromLeftEdge: HYSTERESIS,
              renderLeftActions: (
                progress: SharedValue<number>,
                translation: SharedValue<number>,
                api: SwipeableMethods,
              ) => panel('left', leftSet, progress, translation, api),
            }
          : null)}
        onSwipeableWillOpen={onWillOpen}
        onSwipeableWillClose={onWillClose}
        renderRightActions={(progress, translation, api) =>
          panel('right', rightSet, progress, translation, api)
        }>
        <Animated.View style={[styles_clip, rounded]}>{children}</Animated.View>
      </ReanimatedSwipeable>
    </View>
  );
}

/**
 * Canh cú kéo dài, trên luồng UI.
 *
 * Là một component riêng vì nó cần `useAnimatedReaction`, và vì nó chỉ được
 * dựng khi `fullSwipe` bật — một hook có điều kiện thì không hợp lệ, một
 * component có điều kiện thì hợp lệ.
 *
 * `onArm` phải ổn định (nó là `useCallback` ở trên): `runOnJS` gói lại một danh
 * tính hàm, và đổi danh tính giữa chừng là đúng lớp lỗi đã làm app thoát.
 */
function FullSwipeWatch({
  translation,
  width,
  onArm,
}: {
  translation: SharedValue<number>;
  width: React.RefObject<number>;
  onArm: (on: boolean) => void;
}) {
  const at = Math.max(width.current * FULL_SWIPE_AT, OPEN_W * 1.6);
  useAnimatedReaction(
    () => translation.value,
    (v, prev) => {
      const now = v > at;
      if (prev === null || now !== prev > at) runOnJS(onArm)(now);
    },
  );
  return null;
}

/*
  Thứ tự nút: cái ĐẦU danh sách nằm sát mép người ta vuốt từ đó.

  iOS dựng như thế (`UISwipeActionsConfiguration`: "the system arranges the
  actions from the outside edge inward"), nên ở mép PHẢI hàng phải đảo chiều —
  một `flexDirection: 'row'` thường sẽ đặt nút đầu vào trong cùng.
*/
const styles_panelRight = { flexDirection: 'row-reverse' } as const;
const styles_panelLeft = { flexDirection: 'row' } as const;
/* `overflow: hidden` là thứ biến `borderRadius` thành một cú CẮT: không có nó
   thì nền của hàng vẫn vuông và góc bo chẳng thấy đâu. */
const styles_clip = { overflow: 'hidden' } as const;

const stylesFor = makeStyles((c) => ({
  /* Ô + chữ xếp DỌC, căn giữa theo cả hai chiều của cột `OPEN_W`. `gap` là khe
     giữa ô và chữ; khe giữa các NÚT do `paddingHorizontal` tạo ra, nên ba nút
     tách rời nhau như trong ảnh chứ không dính thành một dải. */
  actionWrap: {
    width: OPEN_W,
    paddingHorizontal: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  capsule: {
    width: CAPSULE,
    height: CAPSULE,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* The whole capsule is the target, laid over it rather than wrapping it — a
     Pressable around an Animated.View would fight the swipe for the gesture. */
  hit: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  /* Chữ nằm NGOÀI ô, bên dưới nó, và mang màu chữ của trang chứ không mang mực
     của ô: nó đứng trên nền hàng, không đứng trên nền màu. */
  actionText: { ...type.caption, color: c.mutedForeground, fontWeight: '600' },
}));
