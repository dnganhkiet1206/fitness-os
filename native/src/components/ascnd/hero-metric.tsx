import type { ReactNode } from 'react';
import { Text, View, type ViewStyle } from 'react-native';

import { spacing, type } from '@/constants/ascnd';
import { makeStyles } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import { useMuted } from '@/hooks/use-wash';

/**
 * Con số trả lời cả màn.
 *
 * ── lỗi nó sinh ra để sửa ──
 *
 * Màn Sleep vẽ bốn thẻ chỉ số CÙNG kích thước, cùng mặt nền, cùng viền: giấc
 * trung bình, chất lượng, deep, nợ ngủ. Bốn câu trả lời ngang hàng cho một màn
 * chỉ hỏi một câu. Mắt phải đọc cả bốn rồi tự quyết cái nào quan trọng — mà
 * quyết hộ người đọc chính là việc của thứ bậc thị giác.
 *
 * Một hero, ba thứ đi kèm. Không phải bốn thứ bằng nhau.
 *
 * ── ba dòng, và mỗi dòng có đúng một việc ──
 *
 *   eyebrow   cái này đang nói về gì  (nhỏ, mờ, in hoa thưa)
 *   value     con số                   (44/300, tabular-nums)
 *   caption   nó CÓ NGHĨA gì           (một câu người, không phải một nhãn)
 *
 * `caption` là dòng hay bị bỏ nhất và là dòng đáng giá nhất. `7h 16m` là dữ
 * liệu; `7h 16m · phục hồi tốt` là một câu trả lời. Brief gọi đúng thứ này:
 * đừng dựng một bảng số.
 *
 * ── đơn vị KHÔNG cùng cỡ với số ──
 *
 * `7.2h` đặt cả `h` ở 44 điểm làm đơn vị nặng ngang con số, trong khi con số
 * mới là thứ đổi mỗi ngày. Đơn vị lùi về `title2` và mờ đi — vẫn đọc được, hết
 * tranh chỗ.
 */
export function HeroMetric({
  eyebrow,
  value,
  unit,
  caption,
  tint,
  trailing,
  style,
}: {
  eyebrow: string;
  value: string;
  unit?: string;
  caption?: string;
  /** màu của con số. Bỏ trống là mực thường — dùng màu khi nó MANG NGHĨA. */
  tint?: string;
  /** thứ đứng bên phải hero: một vòng nhỏ, một huy hiệu, một chip. */
  trailing?: ReactNode;
  style?: ViewStyle;
}) {
  const c = usePalette();
  const muted = useMuted();
  const styles = stylesFor(c);
  return (
    <View style={[styles.wrap, style]}>
      <View style={styles.textCol}>
        <Text style={[styles.eyebrow, { color: muted }]} numberOfLines={1}>
          {eyebrow}
        </Text>
        {/*
          `adjustsFontSizeToFit` KHÔNG dùng ở đây, và đó là một lựa chọn.

          Nó sẽ co chữ lại cho vừa một dòng ở cỡ Dynamic Type lớn — tức lấy lại
          đúng thứ người dùng vừa xin. `numberOfLines={1}` cộng một cỡ đã đủ
          nhỏ (44, không phải 60) để con số dài nhất app có (`48.8h`) vẫn vừa ở
          402 điểm; dài hơn nữa thì nó xuống dòng, và xuống dòng đọc được còn
          co nhỏ thì không.
        */}
        <Text style={[styles.value, tint ? { color: tint } : null]} numberOfLines={1}>
          {value}
          {unit ? <Text style={[styles.unit, { color: muted }]}> {unit}</Text> : null}
        </Text>
        {caption ? (
          <Text style={[styles.caption, { color: muted }]} numberOfLines={2}>
            {caption}
          </Text>
        ) : null}
      </View>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
    </View>
  );
}

const stylesFor = makeStyles((c) => ({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  textCol: { flex: 1, minWidth: 0, gap: 2 },
  eyebrow: {
    ...type.caption,
    color: c.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 1.1,
  },
  value: {
    ...type.hero,
    color: c.foreground,
    /* Cột số thẳng hàng mà KHÔNG đổi mặt chữ — phần lợi ích duy nhất của mono
       mà một chỉ số đứng yên thật sự cần. Xem `type.hero`. */
    fontVariant: ['tabular-nums'],
  },
  unit: { ...type.title2, color: c.mutedForeground, fontWeight: '400' },
  caption: { ...type.footnote, color: c.mutedForeground },
  trailing: { alignItems: 'center', justifyContent: 'center' },
}));
