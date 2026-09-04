import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type ViewProps } from 'react-native';
import Animated, { type AnimatedProps } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { spacing } from '@/constants/ascnd';
import { makeMaterialStyles, type ElevationRole } from '@/constants/theme';
import { useMaterial } from '@/hooks/use-palette';

/**
 * Card surface — the web app's `.metric-card` / `.glass-card`: a 6% white
 * glass fill, a 0.5px 12% white hairline border and a 20px radius, with a
 * diagonal gradient across the face.
 *
 * ── the gradient ──
 *
 * The fill on its own is one flat value, which is the same problem the page
 * background had: a real surface is never the same brightness across its whole
 * area, because the light reaching one corner of it is not the light reaching
 * the other. A card that is uniformly 6% white reads as a rectangle of paint.
 *
 * So the face runs light at the top-left and dark at the bottom-right. That
 * diagonal is not arbitrary — it is the direction of the room's key light,
 * which `AmbientLight` places just past the top-left corner of the page. Every
 * card catches it from the same side, which is why they look lit rather than
 * merely shaded.
 *
 * ── two gradients, not one ──
 *
 * A single gradient from white through to black would have to pass through
 * near-zero alpha in the middle, and interpolating white→black across that
 * lays a grey haze over the centre of the card. Two rects, each fading to
 * fully transparent, never interpolate between the two colours at all.
 *
 * ── on the numbers ──
 *
 * 8% white and 8% black at the extremes, both gone by the middle. Against a
 * page around #131314 that is roughly #24 at the lit corner and #0f at the
 * far one — a difference you would not measure and would notice if it were
 * missing. The darkening matters as much as the lightening: it is what
 * separates the card's bottom edge from the page without a border there to do
 * it.
 *
 * ── the face is measured, not sized in percent ──
 *
 * `<Svg width="100%" height="100%">` with `<Rect width="100%">` inside it is
 * the obvious way to make the face fill the card, and it is wrong the moment
 * the card changes size. A percentage is resolved against the frame the SVG was
 * last laid out and drawn at; grow the card — open a meal in the diary, unfold
 * the water log — and the gradient keeps the height it had when it was closed.
 * What you see is a horizontal seam across the card where the lit face stops
 * and bare fill begins.
 *
 * So the card measures itself and hands the face real pixels. `onLayout` fires
 * on every size change, the numbers reaching `<Svg>` change with it, and there
 * is nothing left to resolve against a stale frame. Nothing is drawn until the
 * first measurement — one frame of flat fill, which is what the card looked like
 * before the gradient existed and is invisible next to a card appearing.
 *
 * It cannot loop: the face is absolutely positioned, so what it renders can
 * never change the box being measured.
 *
 * Web hid this one. There `<svg width="100%">` is sized by CSS and always
 * fills — measured at 359 × 171 inside a 359 × 171 card, expanded, no seam.
 * It is the native renderer that holds onto the old frame.
 *
 * ── no drop shadow, ON DARK ──
 *
 * Still true there, and still for the original reason: RN renders shadows on
 * dark as a hard halo rather than a soft falloff. The depth comes from the
 * gradient, the hairline border and the bright top edge.
 *
 * ── và vì sao bản SÁNG là một chất liệu khác, không phải bản này đổi màu ──
 *
 * Cả ba câu phía trên đảo chiều trên giấy. Lớp phủ trắng 6% trên #f7f4ef là
 * không có gì. Dải sáng-tối 8% trên mặt trắng là một vệt bẩn. Còn bóng đổ —
 * thứ đoạn trên phải bỏ — lại đọc ĐÚNG trên nền sáng, vì đó là cách một tờ
 * giấy nổi lên khỏi tờ dưới nó.
 *
 * Nên ở bản sáng: mặt trắng đục, viền tơ ấm, bóng thấp mềm, KHÔNG gradient và
 * KHÔNG mép sáng trên. Hai nhánh, và nhánh tối không đổi một điểm ảnh nào —
 * đó là điều kiện để bản đã ship không phải kiểm lại.
 *
 * Chi tiết và các con số nằm ở `Material` trong `constants/theme.ts`.
 */
/**
 * `layout`, `entering` and `exiting` are Reanimated's, passed straight through.
 *
 * A card that changes height — a meal opening in the diary, a log unfolding —
 * otherwise snaps to its new size while its contents fade in, which reads as
 * two unrelated things happening rather than one thing opening. A card that
 * appears in a list wants to arrive rather than blink into place.
 *
 * All three are opt-in. Most cards never move, and an animation on a card that
 * does not move is a wrapper doing nothing.
 */
type GlassCardProps = ViewProps &
  Pick<AnimatedProps<ViewProps>, 'layout' | 'entering' | 'exiting'> & {
    /**
     * Thẻ này nổi lên bao nhiêu — xem `ElevationRole` trong `constants/palette.ts`.
     *
     * Mặc định là `secondary`, vai ÊM NHẤT có bóng. 116 chỗ gọi không khai gì
     * cả, nên mặc định là thứ chúng nhận; nếu mặc định là vai ồn thì mỗi thẻ
     * chưa ai xem lại đều đang tuyên bố nó quan trọng. Đi lên phải khai, đi
     * xuống thì không — đó là chiều duy nhất giữ được một thứ bậc.
     *
     * `inset` = không bóng: cho hàng lặp lại và ô con, thứ mà VIỀN vẽ ra chứ
     * không phải bóng. Một cái bóng trên mỗi hàng biến một danh sách thành một
     * đống.
     */
    elevation?: ElevationRole;
  };

export function GlassCard({
  style,
  children,
  layout,
  entering,
  exiting,
  elevation = 'secondary',
  ...props
}: GlassCardProps) {
  const m = useMaterial();
  const styles = stylesFor(m);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  const measure = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    // Only on a real change — `onLayout` fires for reasons other than resizing,
    // and setting state to the same numbers re-renders every card for nothing.
    setSize((prev) => (prev && prev.w === width && prev.h === height ? prev : { w: width, h: height }));
  };

  return (
    <Animated.View
      style={[styles.card, m.elevation[elevation], style]}
      layout={layout}
      entering={entering}
      exiting={exiting}
      {...props}>
      {/*
        The lit face, clipped to the rounded corners.

        Measured here rather than on the card: this View is exactly the box the
        gradient fills, while the card's own layout includes its border. Measure
        the card and the SVG comes out two pixels wider than the box showing it
        — clipped, so harmless, and wrong for no reason. It also leaves the
        caller's own `onLayout` alone.
      */}
      {/* Mặt gradient chỉ tồn tại ở chất liệu KÍNH. Ở bản giấy, `onLayout`
          cũng đi theo: không có gì cần đo khi không có gì được vẽ, và một
          `setState` mỗi lần thẻ đổi cỡ để dựng ra rỗng là công thừa trên đúng
          53 tệp. */}
      {m.lit ? (
      <View style={styles.face} pointerEvents="none" onLayout={measure}>
        {size ? (
        <Svg width={size.w} height={size.h}>
          <Defs>
            {/* Light in from the top-left, gone by the middle */}
            <LinearGradient id="cardLit" x1="0" y1="0" x2="0.7" y2="1">
              <Stop offset="0" stopColor="#ffffff" stopOpacity={0.08} />
              <Stop offset="0.45" stopColor="#ffffff" stopOpacity={0.015} />
              <Stop offset="1" stopColor="#ffffff" stopOpacity={0} />
            </LinearGradient>
            {/* And falling away to the bottom-right, on its own rect so the two
                never interpolate through each other */}
            <LinearGradient id="cardShade" x1="1" y1="1" x2="0.35" y2="0">
              <Stop offset="0" stopColor="#000000" stopOpacity={0.08} />
              <Stop offset="0.45" stopColor="#000000" stopOpacity={0.015} />
              <Stop offset="1" stopColor="#000000" stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width={size.w} height={size.h} fill="url(#cardLit)" />
          <Rect x="0" y="0" width={size.w} height={size.h} fill="url(#cardShade)" />
        </Svg>
        ) : null}
      </View>
      ) : null}
      {/* Bright inner top edge (--glass-inner-shadow) — kính mới có */}
      {m.highlight ? <View style={styles.topLine} pointerEvents="none" /> : null}
      {children}
    </Animated.View>
  );
}

const stylesFor = makeMaterialStyles((m) => ({
  card: {
    borderRadius: m.radius,
    padding: spacing.card,
    backgroundColor: m.bg,
    borderWidth: m.borderWidth,
    borderColor: m.border,
    /*
      `overflow: 'hidden'` giữ mặt gradient trong bốn góc bo — nhưng nó cũng
      CẮT bóng đổ, vì bóng nằm ngoài hộp.

      Nên ở bản giấy nó phải là `visible`. Đổi được vì không còn gì bên trong
      cần cắt: mặt gradient đã không dựng, và mép sáng cũng vậy. Nếu sau này
      có ai thêm một lớp tràn viền vào nhánh giấy, đây là dòng phải xét lại.
    */
    overflow: m.lit ? 'hidden' : 'visible',
    /* Bóng KHÔNG ở đây nữa: nó tuỳ vai, và vai đến từ chỗ gọi. Nó được ghép
       vào `style` ở chỗ dựng — xem `m.elevation[elevation]` ở trên. */
  },
  face: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: m.radius,
    overflow: 'hidden',
  },
  topLine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: m.highlight ?? 'transparent',
  },
}));
