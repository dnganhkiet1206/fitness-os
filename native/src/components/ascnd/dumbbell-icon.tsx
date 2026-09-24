import Svg, { G, Rect } from 'react-native-svg';

/**
 * Tạ đơn — một hình PHẲNG, MỘT MÀU, vẽ bằng vector.
 *
 * ── theo bản tham chiếu của chủ dự án ──
 *
 * *"SVG (React Native) · Flat Vector · Single Color · Scalable · No 3D"*, kèm
 * hai biến thể "Light Theme — Primary 100%" và "Dark Theme — Inverse 100%".
 *
 * Nên hình KHÔNG tự chọn màu. Chỗ gọi truyền `color` — ở màn hướng dẫn là
 * `c.foreground` — và vì `foreground` đã đảo theo theme, một hình này tự ra cả
 * hai biến thể mà không cần bản thứ hai. Tự chọn màu ở đây là dựng lại một
 * bảng màu thứ hai cạnh `constants/theme`.
 *
 * ── hình dạng ──
 *
 * Hai cặp đĩa và một thanh nối, nghiêng −40°. Mỗi bên là HAI đĩa — một đĩa lớn
 * ngoài, một đĩa nhỏ sát thanh — cách nhau một khe hở 0,45 đơn vị. Cái khe là
 * cách duy nhất một hình một màu nói được "đây là những đĩa tạ chồng lên nhau"
 * mà không cần tô bóng; bản tham chiếu làm đúng việc ấy bằng một vạch sáng.
 *
 * Tỉ lệ ĐÃ ĐO LẠI một lần. Bản đầu vẽ đĩa 3,6 × 13,6 và thanh dài 9,2: dựng ra
 * đọc được là tạ đơn nhưng MẢNH như que, và ở 20 điểm chỉ còn một chữ "H". Bản
 * tham chiếu có đĩa DÀY, thanh NGẮN và to. Nay đĩa ngoài 4,4 × 12, thanh 5,2 ×
 * 3,4 — ở 20 điểm vẫn nhận ra.
 *
 * Nghiêng vì một tạ đơn nằm ngang trông như một cái xương. Góc được TÍNH chứ
 * không chọn bằng mắt: hộp bao của hình sau khi xoay là L·cos θ + H·sin θ, với
 * L = 18,5 (hai mép đĩa ngoài) và H = 12 (chiều cao đĩa) thì ra 21,9 ở 40° —
 * vừa trong khung 24 mà không cắt đĩa nào.
 *
 * ── khung 24 ──
 *
 * Cùng khung với bộ glyph `lucide` mà cả app dùng, nên `size` ở đây nghĩa đúng
 * như `size` ở mọi `<Icon>` khác: 20, 24, 32, 48, 64 đều sắc, không mờ ở cỡ
 * nhỏ vì không có nét mảnh nào dưới 2 đơn vị.
 */
export function DumbbellIcon({ size = 24, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no">
      <G transform="rotate(-40 12 12)" fill={color}>
        {/* thanh nối — ngắn và to, như bản tham chiếu */}
        <Rect x={9.4} y={10.3} width={5.2} height={3.4} rx={1} />
        {/* bên trái: đĩa lớn ngoài, đĩa nhỏ sát thanh */}
        <Rect x={2.75} y={6} width={4.4} height={12} rx={2.2} />
        <Rect x={7.6} y={7.7} width={2} height={8.6} rx={1} />
        {/* bên phải, đối xứng qua tâm */}
        <Rect x={16.85} y={6} width={4.4} height={12} rx={2.2} />
        <Rect x={14.4} y={7.7} width={2} height={8.6} rx={1} />
      </G>
    </Svg>
  );
}
