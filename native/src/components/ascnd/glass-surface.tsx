import { BlurView } from 'expo-blur';
import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { radius as radiusScale } from '@/constants/ascnd';
import { makeMaterialStyles, type ElevationRole, type GlassTier } from '@/constants/theme';
import { useMaterial } from '@/hooks/use-palette';

/**
 * Một mặt kính — thứ nguyên thuỷ mà mọi bề mặt khác dựng lên trên.
 *
 * ── vì sao cần thứ này khi đã có `GlassCard` ──
 *
 * `GlassCard` là một cái THẺ: nó mang sẵn padding, gap, bo góc của một khối
 * nội dung. Nhưng một segmented control, một viên chỉ số, một nút nổi cũng là
 * kính — và chúng không phải thẻ. Trước đây mỗi chỗ như thế tự tô lấy một nền,
 * nên bốn bề mặt cạnh nhau trong cùng một màn đọc ra là bốn vật liệu khác nhau.
 *
 * Đây là chỗ duy nhất biết bốn tầng kính trông thế nào. `GlassCard` sẽ dựng
 * trên nó; các bề mặt khác gọi thẳng.
 *
 * ── BlurView chỉ dựng khi tầng ấy THẬT SỰ blur ──
 *
 * `tier.blur === 0` thì không có `BlurView` nào được tạo. Đó không phải tối ưu
 * vặt: trên iOS mỗi `BlurView` là một `UIVisualEffectView` lấy mẫu lại nội
 * dung phía sau mỗi khung hình, và một trang cuộn có mười thẻ cùng làm thế là
 * mười lần lấy mẫu mỗi khung hình. Chỉ hai tầng NỔI (`floating`, `elevated`)
 * mang blur, vì chỉ chúng thật sự trượt lên trên một thứ khác.
 *
 * ── và hình dạng KHÔNG đổi theo theme ──
 *
 * Số node dựng ra chỉ phụ thuộc `tier` và `blur` — hai thứ đến từ chỗ gọi, y
 * hệt ở bản sáng lẫn bản tối. Vệt sáng mép trên luôn được dựng và tô
 * `highlight ?? 'transparent'`, vì bản sáng không có vệt nào. Gỡ node theo
 * theme là ĐIỀU KIỆN đã sinh ra A9 — xem `tools/theme-shape.mjs`.
 */
export function GlassSurface({
  tier = 'primary',
  radius = radiusScale.xl,
  elevation = 'primary',
  style,
  children,
  pointerEvents,
}: {
  tier?: GlassTier;
  radius?: number;
  /** vai bóng của bản SÁNG. Bản tối trả `NO_SHADOW` cho cả bốn. */
  elevation?: ElevationRole;
  style?: ViewStyle | ViewStyle[];
  children?: ReactNode;
  pointerEvents?: 'auto' | 'none' | 'box-none';
}) {
  const m = useMaterial();
  const styles = stylesFor(m);
  const g = m.glass[tier];

  return (
    <View
      pointerEvents={pointerEvents}
      style={[
        styles.base,
        {
          borderRadius: radius,
          backgroundColor: g.bg,
          borderColor: g.border,
          borderWidth: g.borderWidth,
        },
        m.elevation[elevation],
        style,
      ]}>
      {/*
        Lớp blur nằm DƯỚI nội dung và bị bo góc cắt, nên nó không tràn ra mép.
        `blur === 0` thì không dựng gì — xem chú thích đầu tệp.
      */}
      {g.blur > 0 ? (
        <BlurView
          intensity={g.blur}
          tint={m.aura.blurTint}
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { borderRadius: radius }]}
        />
      ) : null}
      {/*
        Vệt sáng mép trên — một đường tóc, không phải một dải gradient.

        Nó là thứ làm một mặt kính đọc ra là có ĐỘ DÀY: ánh sáng bắt vào cạnh
        trên của một tấm vật liệu trong suốt. Trên giấy thì không có vệt nào,
        và node vẫn dựng, chỉ tô trong suốt.
      */}
      <View
        pointerEvents="none"
        style={[
          styles.topLine,
          { backgroundColor: g.highlight ?? 'transparent', borderTopLeftRadius: radius, borderTopRightRadius: radius },
        ]}
      />
      {children}
    </View>
  );
}

const stylesFor = makeMaterialStyles(() => ({
  base: { overflow: 'hidden' },
  topLine: { position: 'absolute', left: 0, right: 0, top: 0, height: StyleSheet.hairlineWidth },
}));
