import * as Haptics from 'expo-haptics';
import { StyleSheet, Text, View } from 'react-native';

import { PressScale } from '@/components/ascnd/press-scale';
import { radius, spacing, type } from '@/constants/ascnd';
import { makeStyles } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';

/**
 * Một lựa chọn trên màn onboarding.
 *
 * ── hai cỡ, và vì sao cỡ là thứ CÓ NGHĨA ──
 *
 * Màn 02 hỏi câu lớn nhất luồng — *bạn muốn thay đổi điều gì* — và màn 03 đi
 * sâu thêm một tầng BÊN TRONG câu trả lời ấy. Hai màn liền nhau, cùng hình
 * dạng, cùng số thẻ. Ở bản Round 2 chúng dùng chung một cỡ thẻ và người duyệt
 * đọc ra là **gặp lại cùng một câu hỏi** chứ không phải đi sâu thêm.
 *
 * Nên cỡ ở đây không phải trang trí: `lg` là tầng một, `md` là tầng hai. Mắt
 * thấy thẻ nhỏ đi một bậc thì biết mình vừa đi xuống một tầng, trước khi kịp
 * đọc chữ.
 *
 *     lg   cao tối thiểu 88 · nhãn `type.headline` 17/600 · nhiều khoảng thở
 *     md   cao tối thiểu 58 · nhãn `type.body` ở 600, tức 15/600
 *
 * ── 15 chứ không phải 16 ──
 *
 * Board vẽ 16pt. 16 không có trong `constants/ascnd.ts`, và thang chữ của repo
 * này là thang chứ không phải gợi ý — bậc dưới `headline` 17 là `body` 15. Lấy
 * 16 nghĩa là mở một bậc mới cho đúng một component. Bậc thật cho ra khoảng
 * cách 17→15 thay vì 17→16, tức tầng hai đọc càng rõ là tầng hai. Board là bản
 * phác; thang chữ là thứ đã đo.
 *
 * ── trạng thái ĐƯỢC CHỌN nói bằng hai thứ, và bề dày KHÔNG phải một trong hai ──
 *
 * Board vẽ viền dày thêm lúc được chọn (hairline → 1,5). Bề dày viền nằm trong
 * luồng bố cục: thẻ dày thêm 1,5 ở mỗi cạnh thì ruột bị đẩy vào và chữ NHÍCH
 * đúng lúc ngón tay vừa rời ra — một cú giật chỉ thấy trên máy thật. Và một
 * viền 1,5 cũng nặng hơn hẳn mọi thẻ khác trong app, vốn đều là hairline.
 *
 * Nên bề dày giữ nguyên ở hairline cho cả hai trạng thái, và hai tín hiệu là
 * MÀU VIỀN cùng NỀN: `border`→`foreground` và `card`→`secondary`. Cả hai đổi
 * cùng lúc vì mỗi cái một mình đều yếu ở một diện mạo — chỉ đổi màu viền thì
 * bản tối khó thấy, chỉ đổi nền thì bản sáng khó thấy. Một viền hairline màu
 * `foreground` là mức tương phản cao nhất bảng màu có, ở cả hai diện mạo.
 *
 * Và cả hai diện mạo dựng ĐÚNG MỘT cây, chỉ màu khác — `tools/theme-shape.mjs`.
 */
type Props = {
  label: string;
  desc?: string;
  selected: boolean;
  onPress: () => void;
  /** `lg` cho câu hỏi tầng một, `md` cho tầng hai và các màn chọn gọn. */
  size?: 'lg' | 'md';
};

export function ChoiceCard({ label, desc, selected, onPress, size = 'md' }: Props) {
  const c = usePalette();
  const styles = stylesFor(c);

  return (
    <PressScale
      accessibilityRole="radio"
      accessibilityLabel={desc ? `${label}. ${desc}` : label}
      accessibilityState={{ selected }}
      aria-checked={selected} // web không dịch accessibilityState ra aria-checked (#101)
      style={[styles.card, size === 'lg' ? styles.lg : styles.md, selected && styles.on]}
      onPress={() => {
        Haptics.selectionAsync();
        onPress();
      }}>
      <View style={styles.inner}>
        <Text style={size === 'lg' ? styles.labelLg : styles.labelMd}>{label}</Text>
        {desc ? <Text style={styles.desc}>{desc}</Text> : null}
      </View>
    </PressScale>
  );
}

const stylesFor = makeStyles((c) => ({
  card: {
    backgroundColor: c.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
    borderRadius: radius.lg,
    justifyContent: 'center',
  },
  lg: { minHeight: 88, paddingHorizontal: spacing.card, paddingVertical: spacing.card },
  md: { minHeight: 58, paddingHorizontal: spacing.card, paddingVertical: 14 },
  /* Không có `borderWidth` ở đây, và đó là chủ đích: xem chú thích đầu tệp. */
  on: { borderColor: c.foreground, backgroundColor: c.secondary },
  inner: { gap: 3 },
  labelLg: { ...type.headline, color: c.foreground },
  labelMd: { ...type.body, fontWeight: '600', color: c.foreground },
  desc: { ...type.footnote, color: c.mutedForeground, lineHeight: 18 },
}));
