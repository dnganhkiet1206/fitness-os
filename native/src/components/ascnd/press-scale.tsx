import * as Haptics from 'expo-haptics';
import {
  Pressable as RNPressable,
  StyleSheet,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
/*
  Hai bản Pressable, và việc chọn giữa chúng là một phạm vi chứ không phải một
  sở thích.

  ── vì sao cần bản của gesture-handler ──

  Deck ở đầu Today nằm trong một `GestureDetector`. Một `Pressable` của React
  Native bên trong đó ĐUA với hệ cử chỉ chứ không hợp tác: hai hệ chạm khác nhau
  cùng đòi một cú chạm, và cú chạm đầu tiên bị nuốt. Trên máy thật là bấm hai
  lần vẫn không đi được.

  ── vì sao KHÔNG đổi cả app ──

  Tôi đã đổi cả app, và bộ chạy bắt được ngay: BỐN kịch bản hỏng cùng lúc, tất
  cả đều là "bấm mà không có gì xảy ra" — nút Sign In, viên chọn segmented, nút
  đổi ngôn ngữ, tab ở màn Tiến trình. Không cái nào nằm trong một
  GestureDetector. Tôi đã sửa một lỗi ở một chỗ bằng cách đổi nền móng của gần
  ba trăm chỗ khác.

  Nên bản của gesture-handler chỉ dùng ở nơi có lý do dùng: `inGesture`. Mặc
  định là bản React Native, thứ ba trăm chỗ kia đã chạy đúng từ đầu.
*/
import { Pressable as GHPressable } from 'react-native-gesture-handler';

import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { press } from '@/constants/motion';

const AnimatedRN = Animated.createAnimatedComponent(RNPressable);
const AnimatedGH = Animated.createAnimatedComponent(GHPressable);

/**
 * A thing you press that presses back.
 *
 * ── what this replaced ──
 *
 * Nearly three hundred `Pressable`s, and about a hundred and sixty of them
 * doing feedback the same way:
 *
 *     style={({ pressed }) => [styles.card, pressed && styles.pressed]}
 *     …
 *     pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] }
 *
 * That looks like an animation and is not one. `styles.pressed` is a static
 * style swapped in by a re-render, so the card *jumps* to 0.98 and jumps back.
 * There is no interpolation at any point. It is the single most-repeated
 * interaction in the app and it was the one place with no motion in it at all.
 *
 * The scale was also whatever each file had decided: 0.92 in `steps`, 0.95 in
 * `shop`, 0.98 in `today-widgets`. Three different answers to one question,
 * which is what happens when the answer lives in fifty StyleSheets.
 *
 * ── why a spring and not a timing ──
 *
 * Because a press has no duration — it lasts as long as the finger stays down.
 * A timing has to assume one, so a quick tap gets interrupted mid-curve and the
 * release fights the press. A spring is defined by where it is going and how it
 * gets there, so lifting your finger at any moment just changes the target and
 * the motion continues from wherever it actually is. That continuity is most of
 * what "responsive" means on iOS: you can never catch it in a wrong state.
 *
 * ── the animated style is on the Pressable itself ──
 *
 * Not on a wrapper `View` inside it. A wrapper would take the layout styles or
 * leave them behind, and either way some of the fifty call sites would shift by
 * a pixel — `flex: 1`, `alignSelf`, and margins all behave differently one node
 * down. Animating the Pressable keeps the tree exactly the shape it was.
 */
export function PressScale({
  children,
  style,
  haptic = 'none',
  to = press.scale,
  disabled,
  onPressIn,
  onPressOut,
  onPress,
  inGesture = false,
  ...rest
}: Omit<PressableProps, 'style'> & {
  /** dùng bản Pressable của gesture-handler — chỉ khi nằm trong một
   *  `GestureDetector`; xem ghi chú ở đầu file về vì sao không phải mặc định */
  inGesture?: boolean;
  style?: StyleProp<ViewStyle>;
  /** the depth of the press; the default is the one the app speaks with */
  to?: number;
  /**
   * Which tap it feels like — and **off by default**, on purpose.
   *
   * Seventy files already fire their own `Haptics` in `onPress`, so a component
   * that helpfully added one would double up on almost every site it replaced.
   * Two taps of feedback on one press does not read as emphasis; it reads as a
   * stutter, and it would have arrived silently in the middle of a migration.
   *
   * `selection` for choosing among things, `impact` for something committing.
   */
  haptic?: 'selection' | 'impact' | 'none';
}) {
  /* One driver for both properties. Two shared values could drift apart under
     a fast tap — the dim arriving while the scale is still going out — and the
     press is short enough that any disagreement reads as a glitch. */
  const t = useSharedValue(0);

  /**
   * The opacity the caller already asked for, multiplied rather than replaced.
   *
   * The animated style is applied last, so an `opacity` in it *wins* over
   * anything in the style passed in. The first version therefore silently
   * cancelled every disabled state in the app: twenty-two styles carry an
   * `opacity` between 0.35 and 0.55 to say "you cannot press this", and at rest
   * this component was writing 1 straight over the top of them. Nothing errors,
   * nothing looks broken in isolation — a disabled button simply looks exactly
   * like a live one, on about twenty screens.
   *
   * Flattening on the JS side is enough: this is a render-time read of a style
   * that only changes when the caller re-renders, and it makes the press a
   * *proportion* of whatever the caller wanted. A disabled control at 0.4 dims
   * to 0.34 under a press instead of jumping to 0.85.
   */
  const base = StyleSheet.flatten(style)?.opacity;
  const baseOpacity = typeof base === 'number' ? base : 1;

  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - t.value * (1 - to) }],
    opacity: baseOpacity * (1 - t.value * (1 - press.opacity)),
  }));

  /*
    Ép kiểu, và đây là lý do chứ không phải để cho qua tsc.

    Hai bản Pressable nhận cùng những prop này ở RUNTIME, nhưng khai kiểu sự
    kiện khác nhau: React Native dùng `GestureResponderEvent`, gesture-handler
    dùng `PressableEvent`. Component này không đọc sự kiện — nó chỉ chuyển tiếp
    — nên khác biệt đó không chạm tới gì ở đây, và ba trăm chỗ gọi vẫn viết theo
    kiểu React Native như từ trước tới nay.
  */
  const Base = (inGesture ? AnimatedGH : AnimatedRN) as typeof AnimatedRN;

  return (
    <Base
      {...rest}
      disabled={disabled}
      style={[style, animated]}
      onPressIn={(e) => {
        /* Disabled things must not move. A control that answers a press it is
           going to ignore is telling you something untrue about itself. */
        if (!disabled) t.value = withSpring(1, press.spring);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        t.value = withSpring(0, press.spring);
        onPressOut?.(e);
      }}
      onPress={(e) => {
        if (haptic === 'selection') Haptics.selectionAsync();
        else if (haptic === 'impact') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.(e);
      }}>
      {children}
    </Base>
  );
}
