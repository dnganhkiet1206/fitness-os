import { StyleSheet, Text, View } from 'react-native';

import { spacing, type } from '@/constants/ascnd';
import { makeStyles } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import { useI18n } from '@/hooks/use-app-settings';
import { sleepNote, sleepNoteText } from '@/lib/sleep-note';

/**
 * Nhận xét về đêm qua, so cảm giác tự chấm với thời lượng đo được.
 *
 * ── vì sao là một component, không phải hai bản chép ──
 *
 * Nhận xét này từng chỉ hiện ở MỘT chỗ: bên trong phần chi tiết của thẻ Sẵn
 * sàng. Người dùng ngủ đủ tám tiếng, chọn mặt cười đỏ, nhìn thẻ Giấc ngủ và
 * kết luận rằng mặt cười chẳng làm gì — trong khi app CÓ sinh ra nhận xét
 * "đủ giờ mà vẫn mệt" cho đúng tình huống đó. Nhận xét đúng, chỗ đứng sai: nó
 * cách chỗ gây thắc mắc một thẻ và một cú bấm.
 *
 * Nay thẻ Giấc ngủ vẽ nó ngay dưới ô CHẤT LƯỢNG. Hai chỗ vẽ cùng một khối thì
 * khối ấy phải ở một chỗ — chép markup và style sang là mở đường cho hai thẻ
 * nói hai chuyện khác nhau về cùng một đêm, ở lần đầu ai đó sửa một bên.
 *
 * ── câu thứ hai không phải chú thích thừa ──
 *
 * Nó là điều kiện để câu thứ nhất trung thực. Chất lượng tự chấm KHÔNG vào
 * công thức điểm — đó là quyết định sản phẩm, và `tools/sleep-note.mjs` canh
 * nó bằng cách chạy thật. Không có câu ấy thì một nhận xét về cảm giác đứng
 * cạnh một con số sẽ đọc ra thành "cảm giác của bạn đã làm điểm đổi".
 */
export function SleepNoteBlock({
  quality,
  durationMin,
  targetMin,
  style,
}: {
  /* Cùng kiểu mà `sleepNote` nhận — nó đã tự xử lý `null`/`undefined`/ngoài
     thang, nên nới ở đây là để chỗ gọi không phải ép kiểu, chứ không phải để
     nới lỏng kiểm tra. */
  quality: number | null | undefined;
  durationMin: number | null | undefined;
  targetMin: number | null | undefined;
  style?: object;
}) {
  const c = usePalette();
  const styles = stylesFor(c);
  const i18n = useI18n();
  const note = sleepNote({ quality, durationMin, targetMin });
  if (!note) return null;

  return (
    <View style={[styles.wrap, style]}>
      <Text style={styles.text}>
        {sleepNoteText(i18n, note.key).replace('{short}', String(note.shortBy))}
      </Text>
      <Text style={styles.caveat}>{i18n.sleepNoteScoreIsDuration}</Text>
    </View>
  );
}

const stylesFor = makeStyles((c) => ({
  wrap: { gap: 3, paddingHorizontal: spacing.card },
  text: { ...type.footnote, color: c.foreground, lineHeight: 18 },
  caveat: { ...type.footnote, color: c.mutedForeground, opacity: 0.8 },
}));
