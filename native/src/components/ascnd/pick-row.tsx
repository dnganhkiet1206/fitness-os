import { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { PressScale } from '@/components/ascnd/press-scale';
import { press, spring } from '@/constants/motion';

/**
 * A row of choices where the highlight TRAVELS to the one you picked.
 *
 * ── what this replaces ──
 *
 * Nine rows in this app were written the same way:
 *
 *     <Pressable style={[styles.chip, value === k && styles.chipActive]}>
 *
 * Tapping another one turned the old chip's background off and the new one's
 * on, in the same frame, as two unrelated events. Nothing moved. The eye is
 * given no reason to believe the second chip is the *same* selection as the
 * first — it reads as two lights, one going out and one coming on, which is
 * exactly what it is.
 *
 * `Segmented` already fixed this for equal-width strips, and it fixed it the
 * easy way: every segment is the same width, so the pill only ever needs
 * `translateX`. These rows are chips that fit their label — "Breakfast" is
 * wider than "Snack" — so the highlight has to change size as well as move.
 *
 * ── why the pill is three views ──
 *
 * Changing size leaves two options, and both were already ruled out here:
 *
 *   - Animate `width`. `tools/motion.mjs` bans layout properties inside
 *     `useAnimatedStyle`, because the layout engine then re-runs every frame
 *     for a value that only ever changes what you can see.
 *   - `scaleX` a single pill. `progress-bar.tsx` tried this and rejected it
 *     after rendering both versions at 6×: "at 15% a 2pt radius becomes 0.3pt
 *     and the end reads as cut off rather than round". These chips are
 *     `radius.full` on a ~34pt pill, so the caps are 17pt — the distortion
 *     would be far worse here than in the case that was already rejected.
 *
 * So the pill is drawn as its own parts: a rounded piece at each end, and a
 * plain rectangle stretched between them. The end pieces only ever translate,
 * so their corners keep their true radius at every width; the middle is a
 * rectangle, and a rectangle is the one shape `scaleX` cannot distort. Three
 * transforms, no layout, no squashed caps.
 *
 * ── the three pieces must not overlap ──
 *
 * The first version made each cap a whole stadium `2r` wide and let the middle
 * run underneath both. On an opaque fill that is invisible and it shipped
 * looking perfect. On `edit-profile`, whose highlight is
 * `rgba(168,178,196,0.12)`, the overlaps stacked their alpha and drew two
 * brighter discs at the ends of every selected chip — a translucent fill
 * painted twice is a different colour, and the screenshot showed it at once.
 *
 * So each cap is `r` wide with only its OUTER corners rounded — a half-disc —
 * and the middle spans exactly the `w - 2r` between them. Nothing is painted
 * twice, and the fill can be any colour, opaque or not.
 *
 * They meet edge to edge in one flat colour, so the seams are invisible. That
 * is also the constraint: three pieces only work for a SOLID fill. A highlight
 * with a border, a gradient, or — the case that actually turned up — a native
 * glass lens would show its seams, because none of those are the same picture
 * when you cut them up and put them back together.
 *
 * A border does survive the cut, and it is the one exception worth spelling
 * out: each piece draws only its own edges — the left cap without its right
 * border, the middle with just top and bottom, the right cap without its left —
 * and they meet as one continuous outline. `scaleX` on the middle stretches the
 * LENGTH of its top and bottom borders without touching their thickness, which
 * is a horizontal scale doing exactly what it is supposed to. `edit-profile`'s
 * chips are a 1pt outline that changes colour when picked, and that is the row
 * this was needed for.
 *
 * A fill that genuinely cannot be cut — a native glass lens, a gradient — needs
 * a different construction, one view that only ever moves and therefore cannot
 * change width. That was written, for the bottom tab bar's glass capsule, and
 * then taken out again: `tools/linked.mjs` already records `LiquidTabBar` as
 * "thanh tab cũ, đã thay bằng NativeTabs". Nothing renders it. The bar people
 * actually press is Apple's own, and Apple animates its own indicator.
 *
 * So the mode is gone rather than kept warm. An API path with no caller is a
 * path nothing exercises and no screenshot can check, and this component has
 * already shipped one bug that only a screenshot caught.
 *
 * ── why the ROW paints the chip backgrounds, and not the chips ──
 *
 * The first version left each chip painting its own `colors.secondary` box and
 * put the travelling pill behind them. Measured on the rebuilt `/log-workout`:
 * all five RPE chips came out `rgb(24,24,27)` — the pill was drawn, and every
 * frame of it was covered by the selected chip's own background. The highlight
 * had not moved; it had disappeared.
 *
 * A pill that travels has to sit ABOVE the resting backgrounds and BELOW the
 * labels, and there is no way to get a layer in between when the background and
 * the label are both inside the same `Pressable`. So the row draws the resting
 * backgrounds, the pill goes over them, and the chips carry only their labels.
 *
 * The cost is one frame: the backgrounds are placed from measurements, so on
 * the very first layout pass they are not there yet. `Segmented` made the same
 * trade in the other direction for the same reason ("a pill one frame wide,
 * sliding in from nothing, is a flash nobody asked for"). Sixteen milliseconds
 * of labels without their boxes, once, on a screen that is arriving anyway.
 */

/**
 * Cách vệt sáng đi từ mục này sang mục kia.
 *
 * ── vì sao KHÔNG còn là `withTiming(duration.move, Easing.out(cubic))` ──
 *
 * Lập luận cũ nghe xuôi: dải dùng được là 100–500ms, đây là một bước ngắn
 * trong một control nên nằm thấp trong dải (240ms), và ease-out vì vệt sáng
 * đang "đi tới nơi". Cả hai câu đều đúng, và kết quả vẫn đọc ra như một cú
 * nhảy. Người dùng báo "chưa có transition" trong khi chuyển động vẫn chạy.
 *
 * Đo mép trái của thumb trên quãng 181px mới thấy vì sao — ease-out cubic dồn
 * chuyển động vào đầu đến mức này:
 *
 *     40ms   114px   63%
 *     90ms   157px   87%
 *     160ms  179px   99%
 *
 * 87% quãng đường xong trong 90ms đầu. Phần còn lại là vài pixel bò lê mà mắt
 * không phân giải được. Thời lượng danh nghĩa là 240ms, thời lượng NHÌN THẤY
 * là chưa tới 90ms. Kéo dài `duration` không sửa được: nó chỉ kéo dài đoạn bò
 * lê. Sai ở hình dạng đường cong, không ở độ dài.
 *
 * Ease-out đúng cho vật ĐANG HIỆN RA — nó bắt đầu từ hư không nên không có gì
 * để mắt bám lúc đầu. Thumb thì đang ĐỨNG YÊN ở một chỗ có thật và đi tới một
 * chỗ có thật khác: nó phải tăng tốc thì mắt mới bám được điểm xuất phát.
 *
 * ── vì sao lò xo, và vì sao bounce 0 ──
 *
 * Lò xo tắt dần tới hạn tự có hình chữ S: chậm ở hai đầu, nhanh ở giữa.
 *
 * ── vì sao 0,25 giây chứ không phải 0,4 ──
 *
 * Bản đầu để 0,4 và người dùng báo bấm thấy trễ. Đo từ mốc `pointerdown` thật:
 * nhúc nhích đầu 45ms (tốt, ~3 khung), 50% ở 140ms, 90% ở 273ms, 99% ở 456ms.
 * Riêng đoạn 90% → 99% ngốn 183ms, và 183ms ấy mắt không thấy gì chuyển động
 * cả — chỉ thấy control chưa chịu xong việc.
 *
 * Đuôi dài là cái giá của tắt dần tới hạn, và cái giá ấy tỉ lệ thẳng với
 * `duration`. Nên rút `duration` chứ không đổi sang có nảy: nảy cắt được đuôi
 * nhưng đánh đổi bằng việc vượt quá đích, mà lý do cấm vượt quá đích ở dưới
 * vẫn còn nguyên.
 *
 * `bounce` phải là 0 chứ không phải một chút cho sinh động: thumb nằm TRONG
 * một cái ray và lấp gần kín một mục, nên vượt quá đích nghĩa là nó thò ra
 * ngoài mép mục rồi rụt lại. Với một control thì đó là lỗi, không phải nét
 * duyên. Đây đúng là `.smooth` của SwiftUI.
 *
 * 0,25 giây vẫn nằm trong dải 100–500ms mà lập luận cũ trích, và khác 240ms
 * cũ ở chỗ nó là 0,25 giây NHÌN THẤY ĐƯỢC chứ không phải 240ms trên giấy với
 * 87% quãng đường xong trong 90ms đầu.
 */
const TRAVEL = spring(0.25, 0);

/*
  `y` as well as `x`, because two of these rows wrap.

  `exercises` (muscle groups) and `supplements` (timing) are `flexWrap: 'wrap'`
  grids, not strips — the choice you want can be on the second line. A highlight
  that only knows how to move sideways would slide along the wrong row to a
  chip that is not there.
*/
type Box = { x: number; y: number; w: number; h: number };
type Ctx = {
  value: string;
  report: (key: string, box: Box) => void;
};
const RowCtx = createContext<Ctx | null>(null);

export function PickRow({
  value,
  children,
  fill,
  slotFill,
  border,
  radius,
  height,
  gap = 8,
  scroll = false,
  style,
  contentStyle,
}: {
  /** the selected key; must match one `PickRow.Item`'s `itemKey` */
  value: string;
  children: React.ReactNode;
  /** an outline on the highlight, cut across the three pieces — see above */
  border?: { width: number; color: string };
  /**
   * What an UNSELECTED chip rests on, drawn by the row rather than by the chip
   * — see the note above. Leave it out for rows whose chips have no background
   * of their own and only the selected one is filled.
   */
  slotFill?: string;
  /** corner radius of the highlight, clamped to half its height */
  radius: number;
  /**
   * Overrides the measured height of the selected item.
   *
   * Normally leave it out. The first version made this required, and every
   * caller answered it with a hand-written constant that also had to be typed
   * into the chip's own style — "three things that have to agree", which is a
   * sentence describing a bug rather than a design. The item is measured
   * anyway; its height was already in the same `onLayout`.
   */
  height?: number;
  gap?: number;
  /** rows with more chips than fit — the highlight lives inside the scroll
      content, so it travels with them rather than sliding off the screen */
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  /**
   * The highlight's colour. Required, not optional-with-a-default: while it was
   * optional a caller who passed nothing got `backgroundColor: undefined` — a
   * highlight travelling correctly and invisibly. Silent and wrong is the
   * failure mode this repository spends most of its rules on.
   */
  fill: string;
}) {
  const reduceMotion = useReducedMotion();
  const [boxes, setBoxes] = useState<Record<string, Box>>({});
  /*
    Một ô ĐÃ ĐO KHÁC một ô đã được báo về.

    ── lỗi người dùng gửi ảnh ──

    Thi thoảng, ở đầu màn Dinh dưỡng và màn Tiến trình, hai mảnh sẫm hình bán
    nguyệt nằm BÊN NGOÀI cái ray, thò ra khỏi mép trái màn hình, còn trong ray
    thì không có thumb nào cả.

    Quét pixel ảnh chụp: mảnh sẫm ấy rộng 19,6 điểm — đúng bằng `r`, không phải
    bằng bề rộng một mục (~204). Tức `w` bằng 0. Lúc đó ba mảnh nằm ở:

        nắp trái  [x, x+r]
        thân      scaleX = max(0, 0 - 2r) = 0        → vô hình
        nắp phải  [x + 0 - r, x] = [x-r, x]          → BÊN TRÁI nắp trái

    Playwright dựng lại được ở lượt thứ hai trên mười: `[1..20 | 20..20 | -18..1]`
    rồi mới nhảy về `[4..23 | 23..167 | 167..186]`.

    ── vì sao cửa cũ không chặn được ──

    Ghi chú ở chỗ dựng `pill` nói "chưa đo xong thì chưa gắn", và nó ĐÚNG với
    thứ nó viết ra — nhưng `!here` chỉ hỏi "đã có ai báo về một ô chưa", không
    hỏi "ô ấy có dùng được không". Một lượt bố cục với bề rộng 0 vẫn báo về một
    ô hợp lệ về kiểu, nên cửa mở.

    Đó đúng là phân biệt mà repo này đã phải làm ở chỗ khác và ghi lại: `null`
    khác `0` ở điểm sẵn sàng, `usable()` khác "có dữ liệu" ở phía trao huy
    chương. "Rỗng" và "chưa đọc được" là hai chuyện.

    Và `placed` cũng ăn theo: hàm dưới thoát sớm khi `here` là `undefined`, nên
    lần đặt THẬT đầu tiên vẫn là một cú nhảy chứ không phải một cú trượt từ mép
    trái — thứ mà một lần "đặt" vào ô rỗng đã làm hỏng.
  */
  const reported = boxes[value];
  const here = reported && reported.w > 0 ? reported : undefined;

  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const w = useSharedValue(0);
  const placed = useRef(false);

  useEffect(() => {
    if (!here) return;
    /*
      The first placement is not a movement.

      There was nothing on screen a moment ago, so travelling to the selection
      from wherever the shared values happened to start would be a slide out of
      the left edge on every mount. It jumps into place once, then travels.
    */
    const jump = !placed.current || reduceMotion;
    placed.current = true;
    const go = (v: number) => withSpring(v, TRAVEL);
    x.value = jump ? here.x : go(here.x);
    y.value = jump ? here.y : go(here.y);
    w.value = jump ? here.w : go(here.w);
  }, [here, reduceMotion, x, y, w]);

  const report = (key: string, box: Box) => {
    setBoxes((prev) => {
      const old = prev[key];
      if (
        old &&
        Math.abs(old.x - box.x) < 1 &&
        Math.abs(old.y - box.y) < 1 &&
        Math.abs(old.w - box.w) < 1 &&
        Math.abs(old.h - box.h) < 1
      ) {
        return prev;
      }
      return { ...prev, [key]: box };
    });
  };

  const h = height ?? here?.h ?? 0;
  const r = Math.min(radius, h / 2);

  /*
    `w` bằng 0 nghĩa là CHƯA ĐẶT, và chưa đặt thì không được vẽ.

    ── vì sao cửa ở phía render là chưa đủ ──

    Bản sửa đầu chặn ở chỗ dựng: ô đo được bề rộng 0 thì coi như chưa đo. Đúng,
    và Playwright vẫn dựng lại được lỗi ngay sau đó. Lý do nằm ở THỨ TỰ:

      1. `boxes` cập nhật → render → `pill` được gắn
      2. worklet chạy NGAY với `x/y/w` còn ở giá trị khởi tạo 0 → vẽ khung đầu
      3. `useEffect` chạy SAU khi vẽ → mới gán ô thật

    Bước 2 là cái người dùng chụp được. Ở bước ấy `w` là 0, nên nắp phải nằm ở
    `x + 0 - r`, tức BÊN TRÁI nắp trái và thò ra ngoài ray.

    Bình thường bước 2 chỉ sống một khung hình. Nhưng luồng JS lúc mở app đang
    dựng cả năm tab (`UITabBarController` mount hết một lượt), nên bước 3 có thể
    tới muộn hàng trăm mili giây — trong khi luồng UI vẫn vẽ đều. Đó chính là
    "thi thoảng", và nó cùng họ với lỗi màn trắng mà `lib/entrance.ts` ghi lại:
    khung hình bị bỏ lỡ thì thứ còn lại là GIÁ TRỊ ĐẦU.

    Nên chốt chặn phải nằm trong chính worklet, chỗ duy nhất luôn chạy đúng lúc
    vẽ. `opacity` chứ không phải bỏ mảnh đi: nó là thuộc tính worklet được phép
    chạm (`tools/motion.mjs`), và không kéo theo một lượt bố cục nào.
  */
  const hidden = () => {
    'worklet';
    return w.value > 0 ? 1 : 0;
  };

  const left = useAnimatedStyle(() => ({
    opacity: hidden(),
    transform: [{ translateX: x.value }, { translateY: y.value }],
  }));
  const right = useAnimatedStyle(() => ({
    opacity: hidden(),
    transform: [{ translateX: x.value + w.value - r }, { translateY: y.value }],
  }));
  const mid = useAnimatedStyle(() => ({
    opacity: hidden(),
    transform: [
      { translateX: x.value + r },
      { translateY: y.value },
      { scaleX: Math.max(0, w.value - r * 2) },
    ],
  }));

  /*
    The resting backgrounds. Plain views, no animation: they are where the chips
    already are, and they move only when the row itself is laid out again.
  */
  const slots = slotFill
    ? Object.values(boxes).map((b, i) => (
        <View
          key={i}
          pointerEvents="none"
          style={[
            styles.piece,
            {
              width: b.w,
              height: height ?? b.h,
              borderRadius: r,
              backgroundColor: slotFill,
              transform: [{ translateX: b.x }, { translateY: b.y }],
            },
          ]}
        />
      ))
    : null;

  const pill =
    /*
      Not mounted until the selected chip has been measured.

      `progress-bar.tsx` documents what happens otherwise: `useAnimatedStyle`
      computes its style once, on the hook's first render, and re-applies that
      frozen value on every later one. A worklet mounted while the measurement
      is still 0 freezes at 0 — there, a full bar; here, a highlight parked at
      the left edge at zero width, which then only corrects itself if the value
      happens to move again. Mounting after the measurement makes the frozen value
      the right one.
    */
    !here ? null : (
      <>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.piece,
            {
              width: r,
              height: h,
              borderTopLeftRadius: r,
              borderBottomLeftRadius: r,
              backgroundColor: fill,
            },
            {
            },
            border && { borderWidth: border.width, borderColor: border.color, borderRightWidth: 0 },
            left,
          ]}
        />
        <Animated.View
          pointerEvents="none"
          style={[
            styles.piece,
            {
              width: 1,
              height: h,
              backgroundColor: fill,
            },
            border && {
              borderColor: border.color,
              borderTopWidth: border.width,
              borderBottomWidth: border.width,
            },
            mid,
          ]}
        />
        <Animated.View
          pointerEvents="none"
          style={[
            styles.piece,
            {
              width: r,
              height: h,
              borderTopRightRadius: r,
              borderBottomRightRadius: r,
              backgroundColor: fill,
            },
            border && { borderWidth: border.width, borderColor: border.color, borderLeftWidth: 0 },
            right,
          ]}
        />
      </>
    );

  /* Bottom to top: resting backgrounds, then the highlight, then the labels. */
  const inner = (
    <>
      {slots}
      {pill}
      {children}
    </>
  );

  if (scroll) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={style}
        contentContainerStyle={[styles.row, { gap }, contentStyle]}>
        <RowCtx.Provider value={{ value, report }}>{inner}</RowCtx.Provider>
      </ScrollView>
    );
  }

  return (
    <View style={[styles.row, { gap }, style]}>
      <RowCtx.Provider value={{ value, report }}>{inner}</RowCtx.Provider>
    </View>
  );
}

/**
 * One choice. It reports where it is; it does not paint its own selected
 * background — that is the whole point, and painting one would put a second
 * highlight on screen during the travel.
 */
function Item({
  itemKey,
  onPress,
  children,
  style,
  accessibilityLabel,
  deep = false,
  disabled,
}: {
  itemKey: string;
  onPress: () => void;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  /**
   * `press.deep` instead of the standard depth, for chips small enough that 3%
   * of them is not a visible distance. A boolean rather than a number, because
   * the depth vocabulary has exactly two values and `tools/motion.mjs` says so:
   * it rejected `to={to}` here as "một số trần".
   */
  deep?: boolean;
  disabled?: boolean;
}) {
  const ctx = useContext(RowCtx);
  const on = ctx?.value === itemKey;

  const measure = (e: LayoutChangeEvent) => {
    const { x, y, width, height } = e.nativeEvent.layout;
    ctx?.report(itemKey, { x, y, w: width, h: height });
  };

  /*
    `PressScale`, not a bare `Pressable`.

    These chips used to answer a tap by turning their own background on, and
    that answer has moved to the row. Something still has to happen under the
    finger in the frame before the highlight starts moving, and the app already
    has one answer to that question — `press.scale`, 0.97, the same on every
    surface. Nine rows that had no press feedback at all now have the app's.
  */
  return (
    <PressScale
      to={deep ? press.deep : press.scale}
      disabled={disabled}
      accessibilityRole="tab"
      accessibilityState={{ selected: on, disabled }}
      accessibilityLabel={accessibilityLabel}
      onLayout={measure}
      onPress={onPress}
      style={style}>
      {children}
    </PressScale>
  );
}

PickRow.Item = Item;

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  /* `left: 0` plus a translate, rather than an animated `left`: the position is
     a transform so the layout engine is never asked about it. */
  piece: { position: 'absolute', left: 0, top: 0, transformOrigin: 'left' },
});
