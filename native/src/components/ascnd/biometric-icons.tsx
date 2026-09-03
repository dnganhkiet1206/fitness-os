import Svg, { G, Path } from 'react-native-svg';

import { colors } from '@/constants/ascnd';

/**
 * Năm dấu hiệu của thẻ Sinh trắc học.
 *
 * ── vì sao không phải lucide, và vì sao câu đó phải được KIỂM ──
 *
 * `tools/macro-icon-style.mjs` ghi lại một bài học đắt: chỗ này từng có
 * `macro-icons.tsx`, mở đầu bằng câu "bộ lucide không có đùi gà, không có bông
 * lúa mì, không có quả bơ". Câu đó SAI — cả ba đều có sẵn trong `node_modules`
 * suốt thời gian ấy, và hai lần vẽ tay đều đọc sai ở kích thước thật.
 *
 * Nên lần này đếm trước khi khẳng định. `node_modules/lucide-react-native` có
 * 1747 icon; tìm `lung`, `breath`, `oxygen`, `blood` — KHÔNG có cái nào. Có
 * `heart`, `heart-pulse`, `activity`, `droplet`, `droplets`, `wind`, `gauge`.
 *
 * Tức lucide thiếu thật ba trong năm: nhịp thở, oxy máu, VO₂max. Và một bộ ba
 * hình lucide cộng hai hình vẽ tay thì không phải một bộ — lưới, độ dày nét và
 * cách bo góc của lucide là của lucide, hai hình lạ đứng cạnh sẽ lộ ngay.
 *
 * Nửa còn lại của bài học vẫn đứng: hình vẽ tay đọc sai ở kích thước thật. Nên
 * cả năm hình này đã được DỰNG RA VÀ NHÌN ở 15/20/24/44px trên đúng nền thẻ,
 * cả có màu lẫn đơn sắc, trước khi được nối vào bất cứ đâu. Ba trong năm hình
 * phải vẽ lại vì bản đầu đọc SAI ở cỡ thật: HRV ra một cái vương miện, và hai
 * lá phổi ra một cái nạng. Cỡ 15 của thẻ cũ cũng bị bỏ vì lý do ấy — xem
 * `BIO_ICON` trong `today-widgets-2.tsx`.
 *
 * ── vì sao không phải `assistant-icons.tsx` ──
 *
 * Bộ ấy đã là một họ hình vẽ tay trên cùng lưới 24. Nhưng nó ĐẶC và có gradient,
 * vì việc của nó là LÀM SÁNG tấm kính nó nằm trên ở cỡ 22pt. Ở đây ngược lại:
 * một dấu 20pt đứng cạnh một con số, và việc của nó là không tranh phần với con
 * số ấy. Nét rỗng, không gradient, không tô đặc.
 *
 * ── cái các hình này phải phân biệt được ──
 *
 * Ba trong năm chỉ số đều nói về oxy và không khí. Nếu để chi tiết làm nhiệm vụ
 * phân biệt thì ở 20pt chúng biến mất hết. Nên phân biệt bằng LOẠI HÌNH:
 *
 *   nhịp tim nghỉ   một khối kín hữu cơ (trái tim)
 *   HRV             một đường mở, không khối nào cả
 *   oxy máu         một khối kín CÓ LỖ (giọt + vòng)
 *   nhịp thở        một cặp thuỳ đối xứng (phổi)
 *   VO₂max          cặp thuỳ ấy, với cuống mang một đầu mũi tên hướng lên
 *
 * Bốn dáng khác nhau, và cái thứ năm khác cái thứ tư ở đúng ĐỈNH — chỗ mắt
 * chạm vào trước tiên. Cùng cơ quan, vì đó cùng là hô hấp; khác đỉnh, vì một
 * cái là nhịp đang diễn ra còn cái kia là năng lực.
 */

export type BioGlyphName = 'heartRest' | 'hrv' | 'bloodOxygen' | 'breath' | 'vo2max';

/**
 * Một nét cho cả bộ.
 *
 * 1.7 trên lưới 24 chứ không phải 2 của lucide: các hình này vẽ ở 20pt, nên
 * 1.7 ra 1.42pt thật — đủ chắc để không mảnh, đủ mảnh để cái vòng trong giọt
 * còn là một cái vòng chứ không bịt lại thành chấm.
 */
const STROKE = 1.7;

/**
 * Nhịp tim NGHỈ, không phải nhịp tim.
 *
 * Trái tim là khối kín; đường bên trong PHẲNG hai đầu và chỉ nhô một nhịp. Đó
 * là chỗ khác `heart-pulse` của lucide (răng cưa suốt chiều ngang) và là chỗ
 * chữ "nghỉ" nằm trong hình chứ không chỉ nằm ở nhãn.
 */
const HEART =
  'M18.7 13.9c1.4-1.4 2.8-3 2.8-5.2A5.2 5.2 0 0 0 16.3 3.5c-1.7 0-2.9.5-4.3 1.9-1.4-1.4-2.6-1.9-4.3-1.9A5.2 5.2 0 0 0 2.5 8.7c0 2.2 1.4 3.8 2.8 5.2l6.7 6.6Z';
const HEART_LINE = 'M6.4 11.2h2.8l1.2-2.4 1.6 4.4 1-2h4.4';

/**
 * HRV: KHOẢNG CÁCH biến thiên, không phải biên độ.
 *
 * Ba nhịp cao BẰNG NHAU, đỉnh ở x = 5.7, 11.8, 16.1 — khoảng cách 6.1 rồi 4.3
 * đơn vị. Đó đúng là đại lượng: HRV đo độ lệch giữa các khoảng R–R, không đo
 * nhịp mạnh yếu. Một hình vẽ biên độ nhấp nhô sẽ đẹp như nhau và nói sai.
 *
 * Mỗi nhịp có một cái hõm nhỏ DƯỚI đường nền sau đỉnh. Bản đầu không có nó và
 * ba cái kim đều nhau đọc ra là một dãy núi; cái hõm là thứ kéo hình về lại
 * thành một dải nhịp tim.
 *
 * Và không có trái tim nào ở đây: đó là thứ tách nó khỏi ô bên cạnh ở 20pt.
 */
const HRV =
  'M2.4 14.4h2.2l1.1-6.4 1.1 7.6.7-1.2h3.2l1.1-6.4 1.1 7.6.7-1.2h1.4l1.1-6.4 1.1 7.6.7-1.2h3.4';

/**
 * Oxy máu: một giọt CÓ LỖ.
 *
 * App đã dùng `Droplets` (hai giọt) cho NƯỚC — `constants/icon-tint.ts` gán nó
 * màu cyan của nước. Ô SpO₂ trước đây dùng đúng hình ấy, nên hai đại lượng
 * khác hẳn nhau đeo chung một dấu trên hai màn cách nhau một cú chạm.
 *
 * Một giọt (không phải hai) với một vòng rỗng bên trong: cái vòng là thứ nước
 * không có. r=3.3 chứ không nhỏ hơn — trừ nửa nét mỗi bên thì lỗ còn 4.9 đơn
 * vị, tức 4.1pt khi vẽ ở 20. Nhỏ hơn nữa là nó bịt lại thành một cái chấm và
 * cả ý nghĩa mất theo.
 */
const DROP = 'M12 3.4c2.9 3.2 6.6 7.5 6.6 11.1a6.6 6.6 0 0 1-13.2 0c0-3.6 3.7-7.9 6.6-11.1Z';
const DROP_RING = 'M12 11.3a3.3 3.3 0 1 0 0 6.6 3.3 3.3 0 1 0 0-6.6Z';

/**
 * Một thuỳ phổi. Thuỳ kia là chính nó lật lại.
 *
 * Lật bằng `<G transform>` chứ không viết tay đường thứ hai: đối xứng khi đó là
 * một tính chất của hình, không phải một điều hai chuỗi số phải cùng đồng ý.
 * Sửa một bên là sửa cả hai, mãi mãi.
 */
const LOBE =
  'M11 9.4C11.3 13 11.2 16.6 10.9 19 10.7 20.7 9.2 21.5 7.4 21.3 5 21 3.3 19.1 3.1 16.5 2.9 13.3 5.4 10.2 8.6 9.5 9.4 9.3 10.4 9.3 11 9.4Z';
/** Cuống dọc: nhịp thở. Đứng yên, đối xứng. */
const TRACHEA = 'M12 3.6V10.6';
/**
 * VO₂max: cùng cặp thuỳ ấy, cùng cuống ấy, nhưng cuống mang một đầu mũi tên.
 *
 * Bản đầu để mũi tên đi CHÉO qua hai thuỳ. Ở cỡ thật nó đọc ra là một hình
 * người, và nó phá mất tính đối xứng vốn là thứ làm hai thuỳ ra hai lá phổi.
 * Mũi tên dọc giữ nguyên dáng cơ quan và chỉ đổi đúng phần đỉnh.
 */
const RISE = 'M12 3.4V10.6';
const RISE_HEAD = 'M9.3 6.1 12 3.4l2.7 2.7';

/**
 * Màu của từng chỉ số.
 *
 * ── vì sao không phải năm màu tuỳ chọn ──
 *
 * `constants/icon-tint.ts` đã có một học thuyết và nó đúng: màu icon là màu của
 * KHÁI NIỆM, quyết định một lần cho cả app. Bảng ấy nói tím = đêm/giấc ngủ/trợ
 * lý, cyan = nước, champagne = tập luyện, đỏ = tín hiệu của cơ thể.
 *
 * Thẻ này trước đây phá cả ba: nhịp thở màu tím (màu của giấc ngủ), SpO₂ mang
 * hình của nước, HRV mang hình `Activity` — dấu của TẬP LUYỆN.
 *
 * Nên chỉ hai màu ở đây được lấy từ học thuyết ấy và cả hai đều đúng nghĩa:
 * trái tim lấy đỏ VITAL, và VO₂max lấy champagne — màu app đã gán cho tập
 * luyện. VO₂max LÀ một chỉ số thể lực, nên màu và bố cục nói cùng một câu.
 *
 * Ba cái còn lại đi theo hướng brief đặt ra (HRV xanh tím, SpO₂ xanh oxy, nhịp
 * thở lạnh) nhưng lấy từ token sẵn có, không sinh màu mới.
 */
export const BIO_TINT: Record<BioGlyphName, string> = {
  heartRest: colors.readinessRed,
  hrv: colors.metricPurple,
  bloodOxygen: colors.metricBlue,
  breath: colors.metricCyan,
  vo2max: colors.champagne,
};

/**
 * Vẽ một dấu sinh trắc.
 *
 * ── không có `useId` ở đây, và đó là một kết luận chứ không phải một thiếu sót ──
 *
 * `assistant-icons.tsx` phải đặt `useId` cho từng gradient vì id trong SVG trên
 * native là TOÀN CỤC chứ không thuộc về `<Svg>` viết ra nó — bộ ấy dựng tám lần
 * trên một trang và id cứng khiến trái tim đầu tiên tô màu cho mọi hình sau nó.
 * Chuyện ấy đã ngốn ba buổi gỡ lỗi ở các component khác của dự án này.
 *
 * Bộ này không có gradient, nên không có `<Defs>`, nên không có id nào để đụng
 * nhau. Thêm `useId` vào đây là mang theo cái vỏ của một biện pháp mà bỏ mất lý
 * do — và lần sau ai đó thêm một gradient sẽ tưởng chỗ này đã được che.
 */
export function BioGlyph({
  name,
  size = 20,
  color,
}: {
  name: BioGlyphName;
  size?: number;
  /** đè màu — dùng khi sắc thái được mang ở chỗ khác */
  color?: string;
}) {
  const stroke = color ?? BIO_TINT[name];
  const common = {
    stroke,
    strokeWidth: STROKE,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'heartRest' && (
        <>
          <Path d={HEART} {...common} />
          <Path d={HEART_LINE} {...common} />
        </>
      )}
      {name === 'hrv' && <Path d={HRV} {...common} />}
      {name === 'bloodOxygen' && (
        <>
          <Path d={DROP} {...common} />
          <Path d={DROP_RING} {...common} />
        </>
      )}
      {(name === 'breath' || name === 'vo2max') && (
        <>
          <Path d={LOBE} {...common} />
          {/* thuỳ bên kia: chính đường trên, lật quanh trục giữa của lưới 24 */}
          <G transform="translate(24,0) scale(-1,1)">
            <Path d={LOBE} {...common} />
          </G>
          {name === 'breath' ? (
            <Path d={TRACHEA} {...common} />
          ) : (
            <>
              <Path d={RISE} {...common} />
              <Path d={RISE_HEAD} {...common} />
            </>
          )}
        </>
      )}
    </Svg>
  );
}
