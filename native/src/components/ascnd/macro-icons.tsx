import Svg, { Circle, Path } from 'react-native-svg';

/**
 * Protein, carbs, fat and fibre, drawn.
 *
 * Not `lucide` picks: the set has no egg, no wheat ear and no avocado, so a
 * macro row built from it ends up as four abstractions — a flame, a droplet, a
 * leaf, a circle — that have to be learned before they mean anything.
 *
 * ── vì sao bản này vẽ lại từ đầu ──
 *
 * Bản trước là bốn khối ĐẶC với các nét phụ mảnh cắt vào. Xem ở kích thước
 * thật thì protein đọc ra một cái chìa khoá, carb đọc ra một nhánh dương xỉ, fat
 * đọc ra một củ lạc có lỗ. Ở 14 điểm — kích thước chúng thật sự được dùng — cả
 * bốn là vết nhoè.
 *
 * Hai nguyên nhân, và cả hai đều là nguyên nhân về HỆ THỐNG chứ không phải về
 * tay nghề vẽ:
 *
 * 1. Chúng đặc, còn cả app dùng `lucide` — nét đơn. Bốn khối đặc nằm cạnh
 *    những icon nét đơn thì đọc ra là bốn thứ mượn từ app khác.
 *
 * 2. Nét phụ được vẽ bằng MÀU NỀN ở độ mờ một phần, giả làm một vết khoét.
 *    Nó chỉ đúng khi thứ nằm sau đúng bằng màu đó — mà trang dinh dưỡng giờ có
 *    một dải gradient phía sau, nên vết "khoét" thành một vệt sai màu. Khoảng
 *    trống phải là khoảng trống THẬT, không phải một màu vẽ đè.
 *
 * ── luật của bộ này ──
 *
 * Lưới 24. Một độ dày nét duy nhất: 2, đúng bằng mặc định của `Icon`, nên chúng
 * đứng cạnh icon `lucide` mà không lệch cân. Đầu nét và góc nối bo tròn. Không
 * tô đặc, trừ một chấm duy nhất — hạt của quả bơ — vì một chấm đặc đọc được ở
 * 14 điểm còn một vòng tròn rỗng ở cỡ đó thì bít lại.
 *
 * Hình được chọn để phân biệt bằng BÓNG, không bằng chi tiết, vì ở 14 điểm chi
 * tiết không tồn tại:
 *
 *   trứng    một khối bầu dục ĐỨNG, không có gì bên trong
 *   lúa      một trục THẲNG với các gạch chéo — tuyến tính, không thể nhầm với khối
 *   bơ       một khối có MỘT CHẤM bên trong — chấm đó là dấu hiệu riêng của nó
 *   lá       một hình nhọn nằm CHÉO — hướng khác hẳn quả trứng đứng
 */

interface MacroIconProps {
  size?: number;
  color?: string;
}

const BOX = 24;
/** Đúng mặc định của `Icon`, nên bộ này đứng cạnh lucide mà không lệch cân. */
const W = 2;

/**
 * Trứng.
 *
 * Không phải cái đùi gà. Đùi gà cần hai khối và một khớp nối; ở 14 điểm ba thứ
 * đó chồng lên nhau thành một cái kẹo mút — bản trước đọc ra đúng như vậy. Quả
 * trứng là MỘT đường khép kín, hẹp trên rộng dưới, và cái bóng đó không nhầm
 * được với gì khác trong bộ.
 */
export function ProteinIcon({ size = 16, color = '#fff' }: MacroIconProps) {
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${BOX} ${BOX}`} fill="none">
      <Path
        d="M12 3.2c3.3 0 5.8 4.4 5.8 8.3 0 4.3-2.6 7.3-5.8 7.3s-5.8-3-5.8-7.3c0-3.9 2.5-8.3 5.8-8.3z"
        stroke={color}
        strokeWidth={W}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/**
 * Bông lúa: một trục và ba cặp gạch chéo.
 *
 * Bản trước vẽ hạt bằng bốn cặp hình thấu kính khép kín. Ở 96 điểm đó là bông
 * lúa; ở 14 điểm tám hình khép kín cách nhau hai đơn vị dính vào nhau thành một
 * nhánh dương xỉ. Gạch thẳng không dính, và ba cặp thì thưa hơn bốn.
 *
 * Đây là hình duy nhất trong bộ có bóng TUYẾN TÍNH, nên nó không thể bị nhầm
 * với ba khối kia dù nhỏ đến đâu.
 */
export function CarbIcon({ size = 16, color = '#fff' }: MacroIconProps) {
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${BOX} ${BOX}`} fill="none">
      <Path d="M12 21V4.2" stroke={color} strokeWidth={W} strokeLinecap="round" />
      <Path
        d="M12 8.6 8.3 5.9M12 8.6l3.7-2.7M12 13 8.3 10.3M12 13l3.7-2.7M12 17.4l-3.7-2.7M12 17.4l3.7-2.7"
        stroke={color}
        strokeWidth={W}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/**
 * Quả bơ: nửa quả, với hạt.
 *
 * Không phải giọt dầu. Giọt sẽ đúng nghĩa, nhưng app này đã tiêu một giọt cho
 * nước rồi, và hai giọt trong cùng một cột số là một giọt thừa.
 *
 * Hạt là chấm ĐẶC chứ không phải vòng tròn rỗng: ở 14 điểm một vòng tròn đường
 * kính ba điểm với nét dày một điểm thì lỗ giữa còn chưa tới một điểm — nó bít
 * lại thành một chấm bẩn. Vẽ thẳng ra chấm thì nó là chấm sạch. Đây là chỗ tô
 * đặc duy nhất trong cả bộ, và nó là dấu hiệu nhận dạng của hình này.
 */
export function FatIcon({ size = 16, color = '#fff' }: MacroIconProps) {
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${BOX} ${BOX}`} fill="none">
      <Path
        d="M12 3.4c2.4 0 4.1 1.8 4.1 4 0 1.3-.6 2.1-.6 3.1 0 1.5 2.4 2.5 2.4 5.4 0 3.2-2.6 5.3-5.9 5.3s-5.9-2.1-5.9-5.3c0-2.9 2.4-3.9 2.4-5.4 0-1-.6-1.8-.6-3.1 0-2.2 1.7-4 4.1-4z"
        stroke={color}
        strokeWidth={W}
        strokeLinejoin="round"
      />
      <Circle cx={12} cy={15.6} r={1.9} fill={color} />
    </Svg>
  );
}

/**
 * Chiếc lá, đặt CHÉO.
 *
 * Không phải bông cải. Bông cải cần một tán nhiều thuỳ và một cọng, và ở 14
 * điểm tán đó là một cục — bản trước đọc ra một cây nấm.
 *
 * Hướng chéo là có chủ ý: quả trứng là một khối bầu dục ĐỨNG, và một chiếc lá
 * nhọn dựng đứng cạnh nó sẽ là hai bầu dục ở cùng một hướng. Nghiêng đi thì hai
 * cái tách nhau ngay cả khi nhỏ tới mức chỉ còn cái bóng.
 */
export function FiberIcon({ size = 16, color = '#fff' }: MacroIconProps) {
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${BOX} ${BOX}`} fill="none">
      <Path
        d="M4.6 19.4C4.6 11.2 11.2 4.6 19.4 4.6c0 8.2-6.6 14.8-14.8 14.8z"
        stroke={color}
        strokeWidth={W}
        strokeLinejoin="round"
      />
      <Path d="M4.6 19.4 14.2 9.8" stroke={color} strokeWidth={W} strokeLinecap="round" />
    </Svg>
  );
}

/** by macro key, for callers that iterate rather than name them */
export const MACRO_ICON = {
  protein: ProteinIcon,
  carbs: CarbIcon,
  fat: FatIcon,
  fiber: FiberIcon,
} as const;
