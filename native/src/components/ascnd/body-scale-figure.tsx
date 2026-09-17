import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

import { type } from '@/constants/ascnd';
import { alpha, makeStyles } from '@/constants/theme';
import { useMaterial, usePalette } from '@/hooks/use-palette';

/**
 * Chiếc cân — dựng bằng vector, không phải một tấm ảnh.
 *
 * ── tỉ lệ đọc ra khỏi ảnh mẫu ──
 *
 * Chủ dự án đưa một ảnh dựng và bảo bám sát nó. Các con số dưới đây là tỉ lệ đo
 * trên chính ảnh ấy rồi quy về hộp 210×200, không phải ước lượng:
 *
 *     thân cân       590 × 560 điểm ảnh  →  1,054 : 1
 *     màn hình       rộng 0,39 · cao 0,29 của thân, nằm TRÊN–GIỮA
 *     tấm cảm biến   rộng 0,16 · cao 0,20 của thân, bốn góc
 *     bo góc thân    ≈ 0,095 bề rộng
 *
 * Bốn tấm cảm biến KÈM hai bên màn hình chứ không nằm dưới nó: trong ảnh, mép
 * trên của tấm bắt đầu cao hơn mép trên màn hình một chút. Giữ đúng thế, vì đó
 * là thứ làm người ta nhận ra "cái cân điện tử" chứ không phải "một hình vuông
 * có bốn chấm".
 *
 * ── vì sao con số là `<Text>` của RN, không phải `<Text>` của SVG ──
 *
 * Nó là DỮ LIỆU, và nó phải đi theo thang chữ của app, theo Dynamic Type, theo
 * bảng màu. SVG `<Text>` không nhận mấy thứ ấy. Nên phần HÌNH là SVG, phần CHỮ
 * là RN, chồng lên nhau bằng PHẦN TRĂM của hộp thiết kế — nên cả hai co giãn
 * cùng nhau trên mọi cỡ iPhone mà không ai phải gõ lại toạ độ.
 *
 * ── hai lớp viền, và lớp trong là thứ dễ mất nhất ──
 *
 * Ảnh mẫu có một viền mềm ở mép ngoài và MỘT đường nữa lùi vào trong. Bỏ lớp
 * trong đi thì chiếc cân phẳng ra và đọc thành một cái thẻ bo góc.
 *
 * ── màu: bốn lớp không cần biết theme, một lớp thì cần ──
 *
 * Thân, tấm cảm biến và hai viền đều là `alpha(c.foreground, …)`. Mực của bản
 * sáng là màu tối và của bản tối là màu sáng, nên cùng một dòng cho ra "đậm hơn
 * mặt dưới" ở bản sáng và "sáng hơn mặt dưới" ở bản tối — đúng hướng ở cả hai
 * mà không có nhánh nào.
 *
 * MÀN HÌNH thì không đi theo được: trong ảnh mẫu nó là thứ SÁNG NHẤT của cả
 * hình (trắng trên nền kem), và "sáng nhất" ở bản tối không phải cùng một
 * token. Nên đúng một lựa chọn màu viết thẳng ở prop — dạng
 * `fill={m.lit ? a : b}`, thứ `tools/theme-shape.mjs` gọi là MÀU chứ không phải
 * hình dạng, nên nó không dựng thêm nhánh cây nào.
 */

/* Hộp thiết kế. Mọi số bên dưới là điểm trong hộp này, nên đổi cỡ ở ngoài
   không phải sửa gì ở đây. */
const VB = { w: 210, h: 200 } as const;

const PLATE = { x: 4, y: 4, w: 202, h: 192, r: 20 } as const;
/* Lùi vào 9 điểm: đúng tỉ lệ đường viền trong của ảnh mẫu. */
const INNER = { x: 13, y: 13, w: 184, h: 174, r: 13 } as const;
const SCREEN = { w: 82, h: 56, y: 21, r: 10 } as const;
const PAD = { w: 33, h: 41, r: 10, side: 17, top: 25, bottom: 24 } as const;

/* Giữa hai tấm cảm biến dưới, đúng chỗ ảnh mẫu đặt chữ. */
const WORDMARK_Y = 138;

const SCREEN_X = (VB.w - SCREEN.w) / 2;

/*
  Hộp của con số, tính SẴN ở phạm vi module thành phần trăm.

  Không phải để né `tools/progress-bar.mjs` — luật ấy đi săn một thanh tiến độ
  dựng bằng `width` phần trăm ĐỔI theo từng khung hình, và bốn con số này không
  đổi bao giờ. Tính sẵn là cách nói ra điều đó: chúng là hình học của chiếc cân,
  cùng hạng với `SCREEN` và `PAD` ngay trên, chứ không phải dữ liệu.
*/
const pct = (n: number, of: number) => `${((n / of) * 100).toFixed(3)}%` as `${number}%`;

const READOUT_BOX: ViewStyle = {
  left: pct(SCREEN_X, VB.w),
  top: pct(SCREEN.y, VB.h),
  width: pct(SCREEN.w, VB.w),
  height: pct(SCREEN.h, VB.h),
};

const MARK_TOP: ViewStyle = { top: pct(WORDMARK_Y, VB.h) };
const PAD_Y2 = VB.h - PAD.bottom - PAD.h;
const PAD_X2 = VB.w - PAD.side - PAD.w;

export function BodyScaleFigure({
  value,
  unit,
  width,
}: {
  /** Số hiện trên mặt cân. Dữ liệu thật của màn hình, không phải chữ trang trí. */
  value: string;
  unit: string;
  width: number;
}) {
  const c = usePalette();
  const m = useMaterial();
  const styles = stylesFor(c);
  const height = (width * VB.h) / VB.w;
  /*
    Cỡ chữ đi theo BỀ RỘNG hình, không phải một token cố định.

    Đo trên ảnh mẫu: con số rộng ~150 trên thân cân 590, tức nó lấp khoảng 65%
    bề ngang màn hình nhỏ. Với một token cứng (`largeTitle` 28) thì ở bề rộng
    273 nó chỉ lấp 50% — màn hình trông rỗng và con số thôi là nhân vật chính.
    Tỉ lệ thì đúng ở mọi cỡ máy, mà đó cũng là lý do cả hình nhận `width`.
  */
  const numSize = Math.round(width * 0.125);

  return (
    <View
      style={{ width, height }}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${value} ${unit}`}>
      <Svg width={width} height={height} viewBox={`0 0 ${VB.w} ${VB.h}`}>
        <Rect
          x={PLATE.x}
          y={PLATE.y}
          width={PLATE.w}
          height={PLATE.h}
          rx={PLATE.r}
          fill={alpha(c.foreground, 0.05)}
          stroke={alpha(c.foreground, 0.13)}
          strokeWidth={1.2}
        />
        <Rect
          x={INNER.x}
          y={INNER.y}
          width={INNER.w}
          height={INNER.h}
          rx={INNER.r}
          fill="none"
          stroke={alpha(c.foreground, 0.07)}
          strokeWidth={1}
        />
        {/* Bốn tấm cảm biến: kèm hai bên màn hình, rồi lặp lại ở đáy. */}
        {[
          [PAD.side, PAD.top],
          [PAD_X2, PAD.top],
          [PAD.side, PAD_Y2],
          [PAD_X2, PAD_Y2],
        ].map(([x, y]) => (
          <Rect
            key={`${x}-${y}`}
            x={x}
            y={y}
            width={PAD.w}
            height={PAD.h}
            rx={PAD.r}
            fill={alpha(c.foreground, 0.08)}
          />
        ))}
        {/* Màn hình — mặt sáng nhất của cả hình, vì con số đứng trên nó. */}
        <Rect
          x={SCREEN_X}
          y={SCREEN.y}
          width={SCREEN.w}
          height={SCREEN.h}
          rx={SCREEN.r}
          fill={m.lit ? alpha(c.foreground, 0.13) : c.card}
          stroke={alpha(c.foreground, 0.07)}
          strokeWidth={1}
        />
      </Svg>

      {/* Con số nằm ĐÚNG trong ô màn hình, định vị bằng phần trăm của hộp thiết
          kế — nên nó không trôi khi bề rộng đổi theo màn máy. */}
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          READOUT_BOX,
          styles.readout,
        ]}>
        <Text
          style={[styles.value, { fontSize: numSize, lineHeight: Math.round(numSize * 1.12) }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.5}>
          {value}
        </Text>
        <Text style={styles.unit}>{unit}</Text>
      </View>

      {/* Chữ ASCND ở nửa dưới thân cân — ảnh mẫu có nó, và nó là thứ giữ cho
          nửa dưới không rỗng. Vị trí theo phần trăm như mọi thứ khác ở đây. */}
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, MARK_TOP, styles.markBox]}>
        <Text style={styles.mark}>ASCND</Text>
      </View>
    </View>
  );
}

const stylesFor = makeStyles((c) => ({
  readout: { alignItems: 'center', justifyContent: 'center' },
  /*
    `tabular-nums` chứ KHÔNG phải `type.mono`.

    Chú thích của thang chữ đã quyết chuyện này rồi: Menlo ở cỡ lớn "đọc ra là
    một dòng terminal chứ không phải một chỉ số sức khoẻ", và `fontVariant`
    cho đúng phần lợi ích — chữ số không đổi bề ngang khi kéo thước — mà không
    đổi mặt chữ. Không có nó thì con số nhảy ngang mỗi lần đổi chữ số, và cú
    kéo đọc ra là giật.
  */
  value: { ...type.largeTitle, fontVariant: ['tabular-nums'], color: c.foreground },
  unit: { ...type.caption, color: c.mutedForeground, marginTop: 1 },
  markBox: { alignItems: 'center' },
  /* Nhạt hơn hẳn con số: nó là nhãn trên một vật, không phải một thông tin. */
  mark: { ...type.caption, letterSpacing: 2, color: alpha(c.foreground, 0.28) },
}));
