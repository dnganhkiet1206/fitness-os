/**
 * Cái cốc trên thẻ Nước: hình của nó, và mực nước ứng với một phần trăm.
 *
 * ── vì sao phép tính này ở đây chứ không nằm trong component ──
 *
 * Chủ dự án đặt ra một luật đo được: "mỗi lần log mực nước trong cốc sẽ dâng
 * lên theo mục tiêu cho tới khi đầy là hoàn thành 100%". Một câu như thế chỉ
 * được canh bằng cách CHẠY nó, chứ không bằng cách đọc lại JSX.
 *
 * Ở trong một tệp rời thì `tools/water-glass.mjs` gọi thẳng được, trên đủ các
 * ca mà mắt người đọc diff hay bỏ qua: 0%, quá mục tiêu, và số âm.
 *
 * ── và vì sao nó KHÔNG được gọi trong worklet ──
 *
 * `useAnimatedProps` chạy trên luồng UI. Một hàm thường nhập từ module khác mà
 * gọi trong đó sẽ ném lúc chạy trên máy thật ("non-worklet function on the UI
 * thread") — và web thì không ném, nên đây đúng loại lỗi mà bản dựng web không
 * bao giờ lộ.
 *
 * Nên component gọi hàm này trên luồng JS để lấy ĐÍCH, rồi chỉ thả hai giá trị
 * ấy vào `withTiming`. Worklet cuối cùng không còn phép tính nào, chỉ đọc hai
 * shared value.
 */

/*
  ── vẽ lại, lần này theo NHÀ chứ không theo ý tôi ──

  Bản trước dựng một cái cốc có phối cảnh: vành elip, mặt nước elip, thân tô
  chuyển sắc cho ra khối trụ. Chủ dự án xem rồi nói "lần này thì tệ quá".

  Đi tìm thì câu trả lời nằm ngay trong `node_modules`. `lucide-react-native` —
  thư viện vẽ MỌI icon khác trong app này — có sẵn `GlassWater`, và nó nói
  ngược lại tôi ở đúng hai chỗ tôi vừa bỏ công dựng:

      cốc   M5.116 4.104A1 1 0 0 1 6.11 3h11.78a1 1 0 0 1 .994 1.105
            L17.19 20.21A2 2 0 0 1 15.2 22H8.8a2 2 0 0 1-2-1.79z
      nước  M6 12a5 5 0 0 1 6 0 5 5 0 0 0 6 0

  · Miệng cốc là một ĐƯỜNG THẲNG với hai góc bo, không phải elip. Nhìn thẳng,
    không nhìn chếch.
  · Mặt nước là một đường cong chữ S — hai cung ngược chiều. Chất lỏng được kể
    bằng một gợn sóng, không bằng phối cảnh.

  Một cái cốc 3D ngồi giữa ba mươi icon nét phẳng thì nó không "có chiều sâu
  hơn", nó chỉ LẠC. Đó là thứ bản trước làm, và là thứ chú thích này tồn tại để
  ngăn lần sau.

  Nên hình cốc dưới đây là ĐÚNG đường của lucide, từng ký tự, trong đúng lưới
  24 của nó — không phải bản tôi vẽ lại cho giống. Chép lại bằng tay là mở cửa
  cho sai số, và sai số ở đây là "gần giống các icon khác", thứ khó chịu hơn
  khác hẳn.

  Cái app thêm vào là thứ lucide không làm được vì nó là icon tĩnh: mực nước
  ĐỔ ĐẦY theo ngày, và mặt nước động khi vừa có người uống.
*/

/** Lưới của lucide. Giữ nguyên 24 để đường của họ dùng được nguyên vẹn. */
export const GLASS_VIEW = 24;

/**
 * Thân cốc — `GlassWater` của lucide-react-native v1.24.0, nguyên văn.
 *
 * Vừa là đường viền vẽ ra, vừa là vùng cắt cho khối nước. Một đường cho cả hai
 * việc nên nước không bao giờ lệch khỏi thành cốc.
 */
export const GLASS_PATH =
  'M5.116 4.104A1 1 0 0 1 6.11 3h11.78a1 1 0 0 1 .994 1.105L17.19 20.21A2 2 0 0 1 15.2 22H8.8a2 2 0 0 1-2-1.79z';

/** Mép trong của vành, trừ đi nửa nét. */
export const WATER_CEIL = 5.2;
/** Mặt trong của đáy. */
export const WATER_FLOOR = 20.6;
/** Quãng mặt nước đi được. */
export const WATER_SPAN = WATER_FLOOR - WATER_CEIL;

/**
 * Biên độ gợn lúc NGHỈ.
 *
 * Không phải 0. Mặt nước của lucide luôn là một chữ S kể cả khi icon đứng im —
 * đó là cách hình vẽ nói "đây là chất lỏng" mà không cần chuyển động. Đo cung
 * của họ: dây cung 6, bán kính 5, nên độ phồng là 5 − √(25−9) = 1.
 */
export const REST_AMP = 0.5;
/** Biên độ lúc vừa có người uống — gợn to hơn rồi lặng về `REST_AMP`. */
export const WAVE_AMP = 1.15;

export interface WaterFill {
  /** Mép trên mặt nước, toạ độ SVG (y nhỏ = cao). */
  y: number;
  /** Chiều cao cột nước. */
  height: number;
}

/**
 * Mực nước cho một phần trăm đã hoàn thành.
 *
 * Kẹp hai đầu, và cả hai đều là ca THẬT: trên 100% xảy ra mỗi ngày ai đó uống
 * vượt mục tiêu, còn 0% là ngày chưa uống ngụm nào — nó phải cho chiều cao
 * ĐÚNG BẰNG 0, vì một vệt xanh mỏng ở đáy đọc ra là "đã uống một chút".
 */
export function waterFill(pct: number): WaterFill {
  const level = Math.min(Math.max(Number.isFinite(pct) ? pct : 0, 0), 100) / 100;
  return { y: WATER_FLOOR - level * WATER_SPAN, height: level * WATER_SPAN };
}

/**
 * Kẹp chiều cao về khoảng hợp lệ rồi suy ra mép trên từ chính nó.
 *
 * ── vì sao hàm này tồn tại, ĐO ĐƯỢC chứ không phỏng đoán ──
 *
 * `waterFill` đã kẹp phần trăm nên ĐÍCH luôn hợp lệ. Cái không hợp lệ là một
 * khung hình Ở GIỮA. Bẫy ngay tại chỗ ghi thuộc tính trên trình duyệt:
 *
 *     t=845    y 50      height 0          nghỉ ở đáy, đúng
 *     t=1079   y 92.31   height -42.31     ← MỘT khung, vọt NGƯỢC hướng
 *     t=1117   y 37.82   height 12.17      rồi hội tụ bình thường
 *
 * Giải ngược ra tiến độ −1,36: `withDelay(200, withTiming(...))` phát đúng một
 * khung có tiến độ ngoại suy trước khi phần trễ kết thúc.
 *
 * `MiniRing` dùng đúng cặp ấy và cũng nhận khung âm, nhưng nó ghi vào
 * `strokeDashoffset` — không có miền xác định — nên chỉ mất một khung cung
 * tròn mà không ai thấy. Lỗi không mới; cái cốc chỉ là hình đầu tiên có ràng
 * buộc đủ chặt để nó phải lộ mặt.
 */
export function clampFill(height: number): WaterFill {
  'worklet';
  const h = Math.min(Math.max(Number.isFinite(height) ? height : 0, 0), WATER_SPAN);
  return { y: WATER_FLOOR - h, height: h };
}

/** Số điểm lấy mẫu trên mặt nước. */
const STEPS = 16;

/**
 * Khối nước: mặt gợn ở trên, đổ xuống hết đáy.
 *
 * Bị cắt theo chính đường cốc ở chỗ vẽ, nên hai bên cứ việc chạy rộng ra ngoài
 * — và vì vùng cắt LÀ đường cốc, mặt nước không bao giờ lệch khỏi thành.
 *
 * Gấp khúc lấy mẫu chứ không phải cung Bézier: mặt nước phải cộng thêm sóng, mà
 * một cung Bézier gợn sóng cần điều khiển từng đỉnh, còn lấy mẫu thì sóng chỉ
 * là một số hạng cộng vào y. Ở lưới 24, mười sáu đoạn là dưới một phần mười
 * đơn vị mỗi đoạn.
 *
 * `'worklet'` vì nó chạy trong `useAnimatedProps`, trên luồng UI — cùng cái bẫy
 * đã ghi ở `clampFill`: thiếu chỉ thị thì nó ném trên máy thật, còn bản dựng
 * web không nói gì.
 */
export function waterPath(height: number, amp: number, phase: number): string {
  'worklet';
  const { y: top } = clampFill(height);
  const a = Math.min(Math.max(Number.isFinite(amp) ? amp : 0, 0), WAVE_AMP);
  const left = 4;
  const right = 20;
  const pts: string[] = [];
  for (let i = 0; i <= STEPS; i++) {
    const t = i / STEPS;
    const x = left + (right - left) * t;
    /* Một chu kỳ trọn trên bề ngang cốc, đúng như chữ S của lucide: một bụng
       lên rồi một bụng xuống. Nhiều hơn thì nó thành sóng lăn tăn của một mặt
       hồ, không phải của một cốc nước. */
    const y = top + a * Math.sin(2 * Math.PI * (t + phase));
    pts.push(`${x.toFixed(2)} ${y.toFixed(2)}`);
  }
  return `M${pts.join(' L')} L${right} ${GLASS_VIEW + 2} L${left} ${GLASS_VIEW + 2} Z`;
}
