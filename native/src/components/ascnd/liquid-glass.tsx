import { BlurView } from 'expo-blur';
import { useId, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

import { radius } from '@/constants/ascnd';
import { makeStyles } from '@/constants/theme';
import { useMaterial, usePalette } from '@/hooks/use-palette';

/**
 * A control you can see the room through.
 *
 * ── where Apple's rule applies, and where it was overruled ──
 *
 * The guidance is *"don't use Liquid Glass in the content layer"* and *"use
 * Liquid Glass effects sparingly."* That is written for an app that uses the
 * material throughout: spend it everywhere and nothing floats above anything.
 *
 * This is one screen, and the thing behind the glass is an aura rather than a
 * page of content — so the risk the rule guards against, glass obscuring what
 * you came to read, is not present here. The screen is glass throughout by
 * decision, and what carries the hierarchy instead is `tint`.
 *
 * ── tint: the panel is lit by its own icon ──
 *
 * A pane of glass with a coloured light behind it takes that colour. So each
 * card takes a wash of its glyph's colour, anchored at the corner the glyph
 * sits in and falling off across the face. Twelve identical panels read flat;
 * twelve panels each lit a different colour read as twelve objects, which is
 * the hierarchy the uniform version was missing.
 *
 * It is deliberately faint — 0.16 at the peak. Past about a quarter the wash
 * stops being light through glass and becomes a coloured card, and a coloured
 * card is exactly what this material exists not to be.
 *
 * ── how this differs from `GlassCard` ──
 *
 * `GlassCard` is a 6% white *fill*. It reads as glass because the page behind
 * it is dark and even, and that is true on every screen in the app but this
 * one. Here the background is a set of coloured pools slowly drifting, and a
 * flat white fill over moving colour is a sheet of tracing paper: the light
 * goes under it and nothing comes through.
 *
 * This samples what is behind it instead. `BlurView` is a real
 * `UIVisualEffectView`, so the aura's colour arrives *inside* the card, and
 * the card's tint changes as the pools drift past underneath. That is the
 * whole difference between glass and paint, and it only matters over a
 * background that moves.
 *
 * ── the intensity is low on purpose ──
 *
 * 22, not 60. The lesson is the one the status-bar strip was rebuilt around:
 * `intensity` scales the material's *tint* as well as its blur radius, so a
 * high value stops being a lens and becomes a light grey rectangle. The aura
 * beneath is already soft — there are no edges down there for a strong blur to
 * dissolve — so all a higher number would buy is a paler card.
 *
 * ── the face is measured, not sized in percent ──
 *
 * `<Svg width="100%">` with `<Rect width="100%">` inside it is the obvious way
 * to fill the card and it is wrong on native: a percentage resolves against the
 * frame the SVG was *last laid out at*. On a device this showed as a bright
 * rectangle sitting inside each tile — the lit face and the tint stopping short
 * of the card's real edges, with a visible seam where they ended.
 *
 * `GlassCard` documents this exact trap and solves it the same way: measure the
 * box with `onLayout` and hand the SVG real pixels. It cannot loop, because the
 * face is absolutely positioned and nothing it draws can change the box being
 * measured. Nothing renders before the first measurement — one frame of plain
 * blur, invisible next to a card appearing.
 *
 * ── android ──
 *
 * `experimentalBlurMethod` is deliberately not set. Without it Android renders
 * a plain translucent view, which is the honest degradation: the fill and the
 * hairline still describe a card, it simply is not a lens. Turning it on
 * renders the blur on the JS thread and is what `docs/SO-GHI-LOI.md` §A8 warns
 * against.
 */
export function LiquidGlass({
  children,
  style,
  radius: r = radius.lg,
  intensity = 22,
  tint,
  material = 'glass',
}: {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  radius?: number;
  intensity?: number;
  /** the colour of whatever this panel holds — washed across the glass */
  tint?: string;
  /**
   * Chất liệu: thấu kính, hay chỉ là kính mờ.
   *
   * `glass` là bản gốc — blur, cộng mặt sáng chéo, cộng bóng đổ chéo, cộng một
   * vệt sáng trên mép. Bốn gradient SVG cho mỗi tấm; đó là thứ làm nó ra dáng
   * một THẤU KÍNH chứ không phải một hình chữ nhật trong suốt.
   *
   * `blur` bỏ đúng ba lớp sheen ấy và giữ lại phần còn lại: blur thật, lớp wash
   * theo màu, bo góc, viền — nên ngôn ngữ thiết kế không đổi, chỉ chất liệu
   * đổi. Đó là cách Apple Music làm những viên pill của nó: kính mờ phẳng, màu
   * đi từ nội dung, không có specular.
   *
   * ── nó rẻ hơn BAO NHIÊU, nói cho đúng ──
   *
   * Chỗ này từng ghi "không SVG, nên không `onLayout` → `setState` cho mỗi tấm,
   * và không bốn `<Rect>` phải trộn lại mỗi lần trang cuộn". Câu đó đúng với
   * bản `blur` ĐẦU TIÊN — bản đã thay lớp wash bằng một mảng màu phẳng và bị
   * bắt lỗi ngay ("style thẻ không còn giống như cũ"). Khi lớp wash được trả về
   * cho đúng, mặt SVG quay lại cùng nó, và câu ấy thành sai: `blur` có tint vẫn
   * đo, vẫn `setState`, vẫn một `<Rect>` trên đường cuộn.
   *
   * Sự thật là: `blur` bỏ được BA trong bốn `<Rect>`, và bỏ được cả mặt SVG khi
   * không có `tint` — vì lúc đó nó không còn hình nào để vẽ. Đó là con số thật,
   * và `tools/glass-material.mjs` giữ cho nó không tụt lại.
   */
  material?: 'glass' | 'blur';
}) {
  /* Document-global ids on native. Eight of these render on one screen, so a
     hardcoded id would have the first card's gradient painting all of them. */
  const uid = useId();
  const lit = `lgLit-${uid}`;
  const shade = `lgShade-${uid}`;
  const wash = `lgWash-${uid}`;
  const edge = `lgEdge-${uid}`;
  /** Chất liệu thấu kính: mặt sáng chéo, bóng đổ chéo, vệt specular. */
  const lens = material === 'glass';
  /*
    Mặt SVG có gì để vẽ hay không.

    ── lỗi nó sửa ──

    Mặt này vẽ đúng bốn hình: wash (khi có `tint`) và ba lớp thấu kính (khi
    `glass`). Ở chế độ `blur` KHÔNG tint thì cả bốn đều bị loại — và cái vỏ vẫn
    dựng: một `<View onLayout>` gọi `setState` cho mỗi tấm, cộng một `<Svg>`
    rỗng. Một phép đo, một lần render lại, và một view nữa trong cây, để vẽ ra
    không một điểm ảnh nào.

    Không phải giả thuyết: viên trạng thái của Assistant và ô soạn tin của
    Health Assistant đều là `blur` không tint, và cả hai nằm trên đường cuộn.
  */
  const m = useMaterial();
  const styles = stylesFor(usePalette());
  const face = lens || !!tint;
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const measure = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    // Only on a real change — `onLayout` fires for other reasons, and setting
    // the same numbers re-renders every panel on the screen for nothing.
    setSize((p) => (p && p.w === width && p.h === height ? p : { w: width, h: height }));
  };

  return (
    <View style={[styles.wrap, { borderRadius: r }, style]}>
      {/*
        `tint` là VẬT LIỆU CỦA HỆ THỐNG, không phải một màu của app: UIKit dựng
        một `UIVisualEffectView` sáng hay tối tuỳ giá trị này. Đóng cứng `"dark"`
        có nghĩa là trên giấy, tấm này là một hình chữ nhật tối — và chữ đặt lên
        nó vẫn là mực gần-đen của bản sáng.

        Cường độ KHÔNG đổi: 22 ở cả hai bản. Xem đoạn "the intensity is low on
        purpose" phía trên — con số ấy nói về tint của vật liệu, không về theme.
      */}
      <BlurView intensity={intensity} tint={m.aura.blurTint} style={StyleSheet.absoluteFill} />
      {/*
        The lit face, same diagonal as every other card in the app: bright at
        the top-left where `AmbientLight` puts the key, dark at the bottom
        right. Two rects each fading to fully transparent rather than one
        white→black, which would drag a grey haze through the middle.
      */}
      {/*
        Mặt kính vẽ ở CẢ HAI chế độ, và chỉ ba lớp "thấu kính" là bị tắt.

        ── vì sao lớp wash phải ở lại ──

        Bản đầu của chế độ `blur` bỏ luôn cả SVG và thay lớp wash bằng một mảng
        màu phẳng 14% phủ kín viên pill. Đó là ĐỔI NGÔN NGỮ THIẾT KẾ, không phải
        đổi chất liệu — và nó đã bị bắt ngay: "style thẻ không còn giống như cũ".

        Lớp wash gốc là một radial neo ở góc trên-trái, 0.16 → 0.07 → 0, tức là
        màu ĐI RA TỪ cái glyph ngồi đúng chỗ đó rồi tắt dần. Một mảng phẳng cùng
        cường độ thì đậm hơn ở mọi nơi trừ đúng góc ấy, và nó phẳng — mất luôn
        cái hướng vốn là thứ gắn màu với biểu tượng.

        Thứ `blur` thật sự bỏ là ba dấu hiệu của một THẤU KÍNH: mặt sáng chéo,
        bóng đổ chéo, và vệt sáng specular trên mép. Đó mới là chất liệu.
      */}
      {face ? (
      <View style={StyleSheet.absoluteFill} pointerEvents="none" onLayout={measure}>
        {size ? (
      <Svg width={size.w} height={size.h}>
        <Defs>
          {/*
            Định nghĩa chỉ dựng khi CÓ hình tham chiếu tới nó.

            Câu đó từng đứng ở đây trong khi ba `<LinearGradient>` bên dưới vẫn
            dựng vô điều kiện — một chú thích mô tả thứ mã không làm. Ở chế độ
            `blur` không có `<Rect>` nào tham chiếu tới chúng, nhưng
            `react-native-svg` vẫn tạo ba đối tượng gradient native cộng sáu
            `<Stop>` cho MỖI tấm. Trên một màn có tám tấm, đó là hai mươi bốn
            node dựng ra rồi giữ lại để không ai dùng.
          */}
          {lens ? (
            <LinearGradient id={lit} x1="0" y1="0" x2="0.9" y2="1">
              <Stop offset="0" stopColor="#ffffff" stopOpacity={0.10} />
              <Stop offset="0.55" stopColor="#ffffff" stopOpacity={0} />
            </LinearGradient>
          ) : null}
          {lens ? (
            <LinearGradient id={shade} x1="0" y1="0" x2="0.9" y2="1">
              <Stop offset="0.45" stopColor="#000000" stopOpacity={0} />
              <Stop offset="1" stopColor="#000000" stopOpacity={0.16} />
            </LinearGradient>
          ) : null}
          {lens ? (
            <LinearGradient id={edge} x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor="#ffffff" stopOpacity={0.34} />
              <Stop offset="0.38" stopColor="#ffffff" stopOpacity={0.14} />
              <Stop offset="0.7" stopColor="#ffffff" stopOpacity={0} />
            </LinearGradient>
          ) : null}
          {tint ? (
            /* Anchored at the top-left, which is where the glyph sits on every
               card that passes a tint — the wash reads as coming *from* it. */
            <RadialGradient id={wash} cx="0.16" cy="0.16" rx="0.95" ry="0.85" gradientUnits="objectBoundingBox">
              <Stop offset="0" stopColor={tint} stopOpacity={0.16} />
              <Stop offset="0.45" stopColor={tint} stopOpacity={0.07} />
              <Stop offset="1" stopColor={tint} stopOpacity={0} />
            </RadialGradient>
          ) : null}
        </Defs>
        {tint ? <Rect x="0" y="0" width={size.w} height={size.h} fill={`url(#${wash})`} /> : null}
        {/* Ba lớp dưới đây LÀ chất liệu thấu kính — mặt sáng, bóng đổ, vệt
            specular. Chế độ `blur` bỏ đúng chúng và giữ mọi thứ khác. */}
        {lens ? (
          <Rect x="0" y="0" width={size.w} height={size.h} fill={`url(#${lit})`} />
        ) : null}
        {lens ? (
          <Rect x="0" y="0" width={size.w} height={size.h} fill={`url(#${shade})`} />
        ) : null}
        {/*
          The specular edge — a 1pt line along the top, bright at the left and
          gone by two-thirds across.

          This is the tell that separates glass from a translucent rectangle. A
          real pane catches the key light on its upper edge and only on the side
          the light comes from; a border that is the same value all the way
          round reads as a drawn outline, which is what the hairline alone was.
        */}
        {lens ? (
          <Rect x="0" y="0" width={size.w} height={1} fill={`url(#${edge})`} />
        ) : null}
      </Svg>
        ) : null}
      </View>
      ) : null}
      {children}
    </View>
  );
}

const stylesFor = makeStyles((c, m) => ({
  wrap: {
    overflow: 'hidden',
    borderWidth: m.inset.borderWidth,
    borderColor: m.inset.border,
    /* A hair of fill under the blur. On a very dark pool the material alone
       can land almost black, and the card loses its own edge against the page.
       Trên giấy nó phải là một sợi MỰC, cùng lượng và ngược hướng — xem `Aura`. */
    backgroundColor: m.aura.hair,
  },
}));

/**
 * The content surface that goes *under* the glass layer.
 *
 * Darker and much more opaque than `glass.bg`'s 6% white. Over a page whose
 * background is four coloured pools in motion, a 6% white fill takes the pool's
 * colour and the text takes it with them; a dark base holds still underneath
 * so the numbers stay legible whatever is drifting past. It keeps the same
 * hairline as every other card in the app, so it reads as the same family.
 */
/** A hairline that agrees with the wash — see `LiquidGlass`. */
export const tintBorder = (tint?: string) =>
  tint ? { borderColor: `${tint}3d` } : null;

export function SolidCard({
  children,
  style,
  radius: r = radius.lg,
}: {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  radius?: number;
}) {
  const solid = solidFor(usePalette());
  return <View style={[solid.card, { borderRadius: r }, style]}>{children}</View>;
}

const solidFor = makeStyles((c, m) => ({
  card: {
    overflow: 'hidden',
    borderWidth: m.inset.borderWidth,
    borderColor: m.inset.border,
    backgroundColor: m.aura.base,
  },
}));
