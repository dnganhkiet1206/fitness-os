import { Text, View, type ViewStyle } from 'react-native';

import { type } from '@/constants/ascnd';
import { makeStyles } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import { useMuted } from '@/hooks/use-wash';

/**
 * Một chỉ số ĐI KÈM — thứ đọc sau khi đã đọc hero.
 *
 * ── vì sao nó nhỏ, và phải nhỏ ──
 *
 * Đây là vế còn lại của `HeroMetric`. Một màn có một câu trả lời và vài con số
 * chống lưng cho câu ấy; nếu những con số chống lưng cũng to bằng thì không
 * còn câu trả lời nào cả — đó đúng là tình trạng bốn thẻ chỉ số của màn Sleep.
 *
 * ── vì sao nó thôi có MẶT KÍNH của riêng nó ──
 *
 * Bản đầu là `MetricPill`: ba viên kính `secondary` nằm THÀNH MỘT HÀNG RỜI
 * dưới thẻ hero. Dựng lên nhìn thì chúng trôi lơ lửng — không thuộc về hero
 * phía trên, cũng không thuộc về biểu đồ phía dưới — và khoảng cách tới cả hai
 * bằng nhau, nên mắt không có cách nào biết chúng chống lưng cho con số nào.
 *
 * Nay chúng nằm TRONG thẻ hero, dưới một nét ngăn. Ba việc cùng được giải:
 * thứ bậc tự hiện ra (chúng ở trong cái chúng giải thích), craft-floor của
 * skill nói "nested cards are always wrong" và ba mặt kính lồng trong một mặt
 * kính đúng là thế, và brief mục hiệu năng bớt được ba lớp blur.
 *
 * Không mặt riêng thì thứ tách ba cột là KHOẢNG TRỐNG và một nét dọc — rẻ hơn
 * một mặt kính, và đọc ra đúng là "ba phần của một thứ" thay vì "ba thứ".
 *
 * ── chấm màu chỉ xuất hiện khi màu MANG NGHĨA ──
 *
 * `tint` tô chấm bên cạnh nhãn, không tô con số. Tô con số là cách một hàng ba
 * cột biến thành ba màu tranh nhau, và màu ở đây chỉ để nối cột với một tầng
 * trong biểu đồ phía dưới — một việc, không phải một trang trí.
 */
export function MetricColumn({
  label,
  value,
  tint,
  style,
}: {
  label: string;
  value: string;
  tint?: string;
  style?: ViewStyle;
}) {
  const c = usePalette();
  const muted = useMuted();
  const styles = stylesFor(c);
  return (
    <View style={[styles.wrap, style]}>
      <View style={styles.labelRow}>
        {/* Chấm luôn được dựng, tô trong suốt khi không có `tint`: gỡ node
            theo dữ liệu làm hai cột cạnh nhau lệch nhau một khoảng gap. */}
        <View style={[styles.dot, { backgroundColor: tint ?? 'transparent' }]} />
        {/* HAI dòng, không một. Một nhãn bị cắt là một nhãn thôi làm nhãn, và
            cỡ chữ hệ thống lớn sẽ ngắt cả nhãn ngắn. Ba cột `flex: 1` trong
            một hàng tự kéo bằng chiều cao nhau, nên cột hai dòng không làm
            hàng lệch. */}
        <Text style={[styles.label, { color: muted }]} numberOfLines={2}>
          {label}
        </Text>
      </View>
      <Text style={styles.value} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const stylesFor = makeStyles((c) => ({
  /*
    `space-between` chứ không `gap`: nhãn một dòng và nhãn hai dòng đứng cạnh
    nhau thì `gap` đẩy con số của cột hai dòng xuống thấp hơn, và một hàng ba
    con số không thẳng nhau đọc ra là ba thứ không cùng loại. Đẩy số xuống ĐÁY
    thì chúng thẳng hàng bất kể nhãn dài bao nhiêu.

    Không `minHeight`: ba anh em `flex: 1` trong một hàng đã tự kéo bằng chiều
    cao nhau (`alignItems` mặc định là `stretch`), nên một con số cứng chỉ thêm
    khoảng trống chết khi mọi nhãn đều một dòng.
  */
  wrap: { flex: 1, minWidth: 0, justifyContent: 'space-between', gap: 3 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  label: { ...type.caption, color: c.mutedForeground, flexShrink: 1 },
  value: { ...type.title2, color: c.foreground, fontVariant: ['tabular-nums'] },
}));
