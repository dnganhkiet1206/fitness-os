import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, type StyleProp, type TextStyle } from 'react-native';
import Animated, {
  runOnJS,
  Easing,
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { useAppSettings } from '@/hooks/use-app-settings';

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

/* Same curve the rings and bars fill on, so a number and the ring beside it
   arrive together instead of racing. */
const EASE = Easing.bezier(0.16, 1, 0.3, 1);

/**
 * A number that counts to its value instead of appearing at it.
 *
 * ── why this is worth having ──
 *
 * Every number in the app snapped. The readiness score, the calories, the step
 * count — the readings people actually open the app for — arrived fully formed
 * while the ring beside them took a second and a half to fill. The ring was
 * saying "this is being measured" and the number was saying "this was always
 * here", about the same fact.
 *
 * Counting is also the one animation that carries information rather than
 * decoration: the direction tells you whether the figure went up or down since
 * you last looked, before you have read either value.
 *
 * ── why a TextInput ──
 *
 * Because `<Text>` has no animatable prop for its content. Reanimated can drive
 * a `TextInput`'s `text` prop from the UI thread, which means the digits change
 * without a React render per frame — sixty renders a second of a screen this
 * dense is the thing that would make counting cost more than it is worth.
 *
 * That borrowed component brings two things that have to be shut off, and both
 * are silent when you forget:
 *
 *   - `pointerEvents="none"`, because these sit inside pressable cards and a
 *     text field on top of a card eats the tap that was meant for the card.
 *   - a real `accessibilityLabel`, because a screen reader meeting a text field
 *     announces it as one, and reads whatever digit the animation happens to be
 *     passing through. The label is the settled value, so assistive tech gets
 *     the answer rather than the animation.
 *
 * ── grouping is done here, by hand ──
 *
 * `toLocaleString` is not available on the UI thread, so the separator is
 * inserted in the worklet. Vietnamese groups with `.` and English with `,`;
 * getting that from the app's own language setting rather than the device's
 * keeps it consistent with every other number on the screen.
 */
export function AnimatedNumber({
  value,
  decimals = 0,
  group = true,
  duration = 1000,
  delay = 0,
  style,
  prefix = '',
  suffix = '',
  maxFontSizeMultiplier,
}: {
  value: number;
  decimals?: number;
  /** thousands separators; off for years, ids, and anything not a quantity */
  group?: boolean;
  /** to line up with a ring or bar that waits before it starts filling */
  delay?: number;
  /**
   * Matches `ProgressBar`'s fill by default, since a counter almost always sits
   * beside one and the two should land together.
   */
  duration?: number;
  style?: StyleProp<TextStyle>;
  /** trần phóng chữ, cho số nằm trong một hình — xem `RING_TEXT_MAX_SCALE` */
  maxFontSizeMultiplier?: number;
  prefix?: string;
  suffix?: string;
}) {
  const { lang } = useAppSettings();
  const sep = lang === 'vi' ? '.' : ',';
  const dot = lang === 'vi' ? ',' : '.';

  /*
    Chỉ là TextInput KHI ĐANG ĐẾM. Xong thì thành `<Text>`.

    ── vì sao ──

    `<Text>` không có prop nào đổi được nội dung từ worklet, nên để đếm mượt thì
    phải mượn `TextInput` — ghi chú ở đầu tệp giải thích chỗ đó. Nhưng bản trước
    mượn VĨNH VIỄN: số đứng yên từ lâu vẫn còn là một `TextInput`.

    Trên iOS mỗi cái là một `UITextField` thật. Deck ở Dashboard có ba thẻ dùng
    `HeroPanel`, mỗi thẻ bốn con số — nên một cú vuốt kéo theo khoảng mười hai
    text field native qua lại. `readiness-gauge` dùng hai, `activity-rings`
    không dùng cái nào, và người dùng báo giật đúng ở ba thẻ HeroPanel còn hai
    thẻ kia mượt. Thứ tự ấy khớp với số text field trên mỗi thẻ.

    ── vì sao harness không thấy ──

    `tools/deck-swipe.mjs` đo cả 8 cặp chuyển trang, 3 lượt mỗi cặp: 0 bậc chiều
    cao, 0 khựng, 0 khung rớt. Trên web `TextInput` chỉ là một `<input>`, rẻ
    như chữ thường, nên chi phí này KHÔNG tồn tại ở đó để mà đo. Đây là lý do
    bản sửa này chỉ xác nhận được trên máy thật.

    ── vì sao đổi qua lại không làm nhảy chữ ──

    Style `base` bên dưới đã zero hoá padding, margin và viền của `TextInput`
    đúng để nó "drop into a layout built for `<Text>` without moving anything" —
    câu đó có sẵn từ trước, và giờ nó thành thứ được dùng theo cả hai chiều.
  */
  const [counting, setCounting] = useState(true);

  const n = useSharedValue(0);
  useEffect(() => {
    setCounting(true);
    /* `withTiming` honours the system's Reduce Motion setting on its own — with
       it on this lands on the value immediately, which is the correct reading
       of "less motion" for a counter: the number is the point, the counting is
       not. */
    n.value = withDelay(
      delay,
      withTiming(value, { duration, easing: EASE }, (done) => {
        /* Chỉ hạ cờ khi hoạt ảnh CHẠY XONG, không phải khi nó bị cắt ngang bởi
           một giá trị mới — cắt ngang thì lượt sau sẽ tự hạ. */
        if (done) runOnJS(setCounting)(false);
      }),
    );
  }, [value, duration, delay, n]);

  const settled = format(value, decimals, group, sep, dot);

  const animatedProps = useAnimatedProps(() => {
    return { text: prefix + format(n.value, decimals, group, sep, dot) + suffix } as never;
  });

  if (!counting) {
    return (
      <Text
        accessible
        accessibilityLabel={prefix + settled + suffix}
        maxFontSizeMultiplier={maxFontSizeMultiplier}
        style={[styles.base, style]}>
        {prefix + settled + suffix}
      </Text>
    );
  }

  return (
    <AnimatedTextInput
      animatedProps={animatedProps}
      editable={false}
      pointerEvents="none"
      accessible
      accessibilityLabel={prefix + settled + suffix}
      /* The initial render, before the first frame of the worklet: the settled
         value rather than a zero, so a screen that mounts without animating
         (Reduce Motion, or a re-mount mid-scroll) never shows a bare 0. */
      defaultValue={prefix + settled + suffix}
      /* Số trong một hình có trần phóng chữ — xem `RING_TEXT_MAX_SCALE`. Không
         truyền thì component này scale tự do như mọi chữ khác, đúng mặc định. */
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      style={[styles.base, style]}
    />
  );
}

/**
 * Fixed-point with thousands separators, safe to run on the UI thread.
 *
 * Written out rather than using `toLocaleString`, which does not exist in a
 * worklet. The same function runs on both threads so the settled label and the
 * animated digits can never disagree about formatting.
 */
function format(v: number, decimals: number, group: boolean, sep: string, dot: string): string {
  'worklet';
  const negative = v < 0;
  const fixed = Math.abs(v).toFixed(decimals);
  const [whole, frac] = fixed.split('.');

  let out = whole;
  if (group && whole.length > 3) {
    out = '';
    for (let i = 0; i < whole.length; i++) {
      /* Separator before every third digit counting from the right, except at
         the very start — otherwise 1000 comes out as ",1.000". */
      if (i > 0 && (whole.length - i) % 3 === 0) out += sep;
      out += whole[i];
    }
  }
  return (negative ? '-' : '') + out + (frac ? dot + frac : '');
}

const styles = StyleSheet.create({
  /* A TextInput arrives with padding, a minimum height and a platform text
     colour that a Text does not have. Zeroing them is what makes this drop into
     a layout built for `<Text>` without moving anything. */
  base: {
    padding: 0,
    margin: 0,
    borderWidth: 0,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
});
