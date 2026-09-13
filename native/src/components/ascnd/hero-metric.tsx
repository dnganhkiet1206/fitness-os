import { useState, type ReactNode } from 'react';
import { Text, View, type ViewStyle } from 'react-native';

import { AnimatedNumber } from '@/components/ascnd/animated-number';

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
  decimals = 1,
  unit,
  caption,
  tint,
  trailing,
  style,
}: {
  eyebrow: string;
  /**
   * Chuỗi thì vẽ nguyên văn; SỐ thì ĐẾM LÊN.
   *
   * Không phải trang trí: một con số nhảy thẳng vào chỗ của nó đọc ra là một
   * giá trị đã có sẵn ở đó từ trước, còn một con số chạy lên đọc ra là kết quả
   * của một phép tính vừa xong. Today và vòng sẵn sàng đã dùng `AnimatedNumber`
   * cho đúng lý do ấy; hero của một màn chi tiết thì không có lý do nào để
   * khác. Truyền chuỗi khi giá trị KHÔNG phải một lượng — một dấu gạch ngang,
   * hay một nhãn.
   */
  value: string | number;
  /** số chữ số thập phân, chỉ dùng khi `value` là số */
  decimals?: number;
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
  const [numW, setNumW] = useState(0);
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
        <View style={styles.valueRow}>
          {typeof value === 'number' ? (
            <>
              {/*
                ── bề ngang được ĐO, không được đoán ──

                `AnimatedNumber` vẽ bằng `TextInput` (đó là cách duy nhất
                Reanimated đổi được chữ trên luồng UI), và `TextInput` KHÔNG co
                theo nội dung: nó chiếm hết hàng và đẩy đơn vị ra khỏi thẻ. Đo
                được ở lần dựng đầu: chữ `h` biến mất hẳn khỏi hero.

                Cách rẻ là nhân số ký tự với một tỉ lệ. Đo thử thì tỉ lệ ấy
                không tồn tại: ở 44 điểm một chữ số rộng 26,8 còn dấu chấm rộng
                12,8 — "7.0" và "48.8" ra hai tỉ lệ khác nhau (0,503 và 0,529).
                Và cả hai con số ấy là của font dự phòng trong trình duyệt, chưa
                phải SF Pro trên máy thật.

                Nên một bản sao VÔ HÌNH của chính chuỗi ấy, dựng bằng `<Text>`
                với đúng style, tự báo bề ngang qua `onLayout`. Không hằng số
                nào để trôi theo font, và nó đúng ở mọi cỡ Dynamic Type.
              */}
              <Text
                style={[styles.value, styles.measure]}
                pointerEvents="none"
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                onLayout={(e) => setNumW(Math.ceil(e.nativeEvent.layout.width))}>
                {value.toFixed(decimals)}
              </Text>
              <AnimatedNumber
                value={value}
                decimals={decimals}
                group={false}
                style={[styles.value, numW ? { width: numW } : null, tint ? { color: tint } : null]}
              />
            </>
          ) : (
            <Text style={[styles.value, tint ? { color: tint } : null]} numberOfLines={1}>
              {value}
            </Text>
          )}
          {unit ? <Text style={[styles.unit, { color: muted }]}>{` ${unit}`}</Text> : null}
        </View>
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
  /* Đơn vị đi CẠNH con số chứ không nằm trong nó: `AnimatedNumber` là một
     `<Text>` riêng, nên `baseline` là thứ giữ chữ `h` ngồi đúng chân số. */
  valueRow: { flexDirection: 'row', alignItems: 'baseline' },
  /* Bản sao đo đạc: chiếm 0 chỗ, không ai thấy, không trình đọc màn hình nào
     đọc tới. `position: absolute` để nó không đẩy hàng ra. */
  measure: { position: 'absolute', opacity: 0, left: 0, top: 0 },
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
