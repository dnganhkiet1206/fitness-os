import type { ReactNode } from 'react';
import { StyleSheet, Text } from 'react-native';

import { type } from '@/constants/ascnd';
import { makeStyles } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';

/**
 * Tiêu đề của một MỤC trên trang.
 *
 * ── vì sao không còn là chữ nhỏ in hoa ──
 *
 * Trang Dinh dưỡng từng dùng icon 13pt + chữ 12pt IN HOA, giãn 2,4, màu mờ.
 * Mỗi mảnh của công thức đó đều kéo tiêu đề xuống hạng phụ: in hoa giãn rộng
 * là kiểu chữ của NHÃN (thứ dán lên một ô số, như "PROTEIN" trong thẻ macro),
 * 12pt nhỏ hơn cả chữ thân bài nó đứng trên, và màu mờ nói "cái này không
 * quan trọng". Cộng lại thì "Kế hoạch ăn" — mục chính của cả nửa trang — đọc
 * ra nhỏ hơn tên từng plan bên dưới nó.
 *
 * Bỏ icon vì ở cỡ này nó thành thừa: chữ đậm đã tự tách mục ra khỏi nội dung
 * rồi, và một icon 13pt cạnh chữ 18pt thì lệch trọng lượng thấy rõ.
 *
 * ── vì sao 18 chứ không phải 22 ──
 *
 * "Top Picks for You" của Apple Music đúng là 22 điểm, và bản đầu của tệp này
 * bê thẳng con số ấy sang. Sai. Thang Apple là 34 / 28 / 22 / 20 / 17, và
 * tiêu đề TRANG của Apple Music là 34 — tiêu đề mục của nó thấp hơn tiêu đề
 * trang hai bậc. Tiêu đề trang ở đây là 28, nên 22 chỉ còn cách 6 điểm: hai
 * thứ đọc ra gần ngang hạng và cả trang gào lên.
 *
 * Cái phải mượn là KHOẢNG CÁCH trong thang, không phải con số tuyệt đối.
 * 28 → 18 giữ đúng hai bậc ấy trong thang của app này.
 *
 * ── vì sao dùng chung, không phải một bản mỗi trang ──
 *
 * Trước tệp này, cùng một vai trò có BA từ vựng: 12pt in hoa giãn rộng ở Dinh
 * dưỡng, 14pt/600 thường ở Tập luyện, và `sectionHead` với `sectionHeadRow` —
 * hai tên, cùng một khai báo — ở năm chỗ trong cùng một tệp. Ba trang tự trả
 * lời cùng một câu hỏi theo ba kiểu là cách một giao diện thôi đọc ra như một
 * sản phẩm.
 */
export function SectionTitle({ children }: { children: ReactNode }) {
  const c = usePalette();
  const styles = stylesFor(c);
  return <Text style={styles.title}>{children}</Text>;
}

/**
 * NHÃN của một khối bên trong một thẻ — không phải tiêu đề mục.
 *
 * ── vì sao nó ở cạnh `SectionTitle` chứ không ở chỗ dùng ──
 *
 * Vì hai thứ này là hai vế của cùng MỘT quyết định, và ghi chú dài phía trên
 * chính là quyết định ấy: 12pt in hoa giãn rộng màu mờ là kiểu chữ của nhãn,
 * nên nó SAI cho một tiêu đề mục và ĐÚNG cho một nhãn. Tách hai vế ra hai tệp
 * là mở đường cho ai đó đọc được nửa lập luận.
 *
 * Đây là bộ số mà mọi nhãn trong thẻ của app đang dùng — "GHI BỮA ĂN", "XU
 * HƯỚNG SẴN SÀNG", "CHỈ SỐ BMI". `dashboard-cards` và `today-widgets-2` mỗi
 * tệp có một component `MicroTitle` cục bộ lặp lại bộ số này; chúng còn kèm
 * icon nên là một hình dạng khác, và gộp cả ba là một lượt sửa riêng. Cái tệp
 * này ngăn được là bộ số thứ BA ra đời.
 */
export function MicroLabel({ children }: { children: ReactNode }) {
  const c = usePalette();
  const styles = stylesFor(c);
  return <Text style={styles.micro}>{children}</Text>;
}

const stylesFor = makeStyles((c) => ({
  title: { ...type.title2, color: c.foreground },
  micro: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 2.4,
    color: c.mutedForeground,
  },
}));
