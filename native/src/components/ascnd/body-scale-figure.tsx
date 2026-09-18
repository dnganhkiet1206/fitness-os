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
 * ── màu: MỘT độ mờ cho cả hai diện mạo là không đủ, và đây là bằng chứng ──
 *
 * Bản đầu dùng đúng một `alpha(c.foreground, …)` cho mỗi lớp ở cả hai diện mạo.
 * Lập luận nghe rất gọn: mực bản sáng là màu tối, bản tối là màu sáng, nên một
 * dòng cho ra "đậm hơn mặt dưới" ở sáng và "sáng hơn mặt dưới" ở tối.
 *
 * Trên ảnh MÁY THẬT nó sai. Chủ dự án: *"Trong Dark Mode hiện tại, thân cân và
 * background gần như hoà vào nhau."* Và phép đo của tôi đã NÓI ra điều đó rồi —
 * thân cân/trang 1,084 ở tối so với 1,104 ở sáng — mà tôi lý giải nó đi, gọi là
 * "minh hoạ, chấp nhận được". Hai con số gần bằng nhau, hai kết quả khác nhau:
 * ở vùng gần đen, một tỉ số 1,08 là một chênh lệch độ sáng TUYỆT ĐỐI rất nhỏ,
 * và màn OLED nén nốt phần còn lại. Tỉ số tương phản nói quá về độ nhìn thấy ở
 * đầu tối của thang.
 *
 * Nên độ mờ TÁCH theo diện mạo, và mỗi con số của bản tối được chọn để khớp
 * THỨ BẬC của bản sáng chứ không phải khớp con số của nó:
 *
 *     lớp                     sáng α → tỉ số    tối α → tỉ số
 *     thân cân / trang        0,05    1,104     0,11    1,237
 *     viền ngoài / trang      0,13    1,298     0,17    1,484
 *     viền trong / thân       0,07    1,150     0,06    1,167
 *     tấm cảm biến / thân     0,08    1,173     0,06    1,167
 *     màn hình / thân         (card)  1,211     0,07    1,200
 *     chữ ASCND / thân        0,28    1,808     0,20    1,810
 *
 * Để ý ba lớp có α bản tối THẤP hơn bản sáng: chúng nằm trên một thân cân đã
 * sáng hơn (0,11 thay vì 0,05), nên ít mực hơn vẫn ra đúng bậc ấy. Đó là phép
 * composite tự lo, không phải một sự trùng hợp.
 *
 * Và mặt MÀN HÌNH ở bản tối nay nhẹ hơn hẳn bản trước (0,07 thay vì 0,13). Chủ
 * dự án gọi bản cũ là *"một khối xám quá nặng"*, và nguyên nhân không nằm ở màn
 * hình: thân cân quá tối nên màn hình đọc ra như một tấm bê tông rời. Sửa thân
 * cân thì màn hình về đúng sức nặng tương đối của nó.
 *
 * Mọi lựa chọn viết thẳng ở prop dạng `fill={m.lit ? a : b}` — thứ
 * `tools/theme-shape.mjs` gọi là MÀU chứ không phải hình dạng, nên không nhánh
 * cây nào được dựng thêm. `tools/body-scale.mjs` đọc lại từng cặp số này.
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
          fill={m.lit ? alpha(c.foreground, 0.11) : alpha(c.foreground, 0.05)}
          stroke={m.lit ? alpha(c.foreground, 0.17) : alpha(c.foreground, 0.13)}
          strokeWidth={1.2}
        />
        <Rect
          x={INNER.x}
          y={INNER.y}
          width={INNER.w}
          height={INNER.h}
          rx={INNER.r}
          fill="none"
          stroke={m.lit ? alpha(c.foreground, 0.06) : alpha(c.foreground, 0.07)}
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
            fill={m.lit ? alpha(c.foreground, 0.06) : alpha(c.foreground, 0.08)}
          />
        ))}
        {/* Màn hình — mặt sáng nhất của cả hình, vì con số đứng trên nó. */}
        <Rect
          x={SCREEN_X}
          y={SCREEN.y}
          width={SCREEN.w}
          height={SCREEN.h}
          rx={SCREEN.r}
          fill={m.lit ? alpha(c.foreground, 0.07) : c.card}
          stroke={m.lit ? alpha(c.foreground, 0.06) : alpha(c.foreground, 0.07)}
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
        <Text style={[styles.mark, { color: m.lit ? alpha(c.foreground, 0.2) : alpha(c.foreground, 0.28) }]}>
          ASCND
        </Text>
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
  /*
    `secondaryForeground`, KHÔNG phải `mutedForeground`.

    Mặt màn hình của chiếc cân ở bản TỐI là `alpha(ink, 0.13)` = #2f2f2f — một
    mặt khá sáng, vì nó phải là thứ sáng nhất của cả hình. Trên nó
    `mutedForeground` (#828282) chỉ còn **3,48:1**, dưới sàn 4,5 của WCAG 1.4.3.
    Và không hạ độ đậm mặt màn xuống được: ở α 0,07 nó mới lên 4,14 mà bậc so
    với thân cân đã tụt còn 1,168.

    `secondaryForeground` đo 4,70 (tối) · 7,75 (sáng) — qua ở cả hai, và vẫn
    nhạt hơn hẳn con số (11,44 · 17,57) nên thứ bậc không đảo.

    Bản sáng không đổi về mặt ĐẠT/RỚT: `mutedForeground` ở đó vốn 5,78, đã qua.
    Đổi token là để MỘT dòng đúng ở cả hai diện mạo thay vì một nhánh theo theme.
  */
  unit: { ...type.caption, color: c.secondaryForeground, marginTop: 1 },
  markBox: { alignItems: 'center' },
  /* Nhạt hơn hẳn con số: nó là nhãn trên một vật, không phải một thông tin.
     MÀU đặt ở prop chứ không ở đây, vì `makeStyles` chỉ nhận bảng màu chứ không
     nhận chất liệu, mà độ mờ của nhãn này tách theo diện mạo. */
  mark: { ...type.caption, letterSpacing: 2 },
}));
