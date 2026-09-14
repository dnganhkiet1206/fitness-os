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

/** Khung vẽ của cốc. */
export const GLASS_W = 44;
export const GLASS_H = 56;

/**
 * Thành cốc: hơi loe, đáy bo — hình một cái ly thật.
 *
 * Mặt nước là một hình chữ nhật bị CẮT theo chính đường này, nên ở gần đáy nó
 * tự hẹp lại đúng theo độ loe. Vẽ mặt nước bằng một hình thang tự tính sẽ phải
 * lặp lại phép loe ở chỗ thứ hai, và hai chỗ thì sẽ có ngày lệch nhau.
 */
export const GLASS_PATH = 'M3 3 L41 3 L37 46 A5 5 0 0 1 32 51 L12 51 A5 5 0 0 1 7 46 Z';

/**
 * Đầy 100% là đầy tới TRONG LÒNG cốc, không phải tràn qua vành (vành ở y=3).
 */
export const WATER_CEIL = 5.5;
/** Mặt trong của đáy. */
export const WATER_FLOOR = 50;
/** Chiều cao cột nước khi đầy. */
export const WATER_SPAN = WATER_FLOOR - WATER_CEIL;

export interface WaterFill {
  /** Mép trên của mặt nước, theo toạ độ SVG (y nhỏ = cao). */
  y: number;
  /** Chiều cao cột nước. */
  height: number;
}

/**
 * Mực nước cho một phần trăm đã hoàn thành.
 *
 * Kẹp hai đầu, và cả hai đầu đều là ca THẬT chứ không phải phòng xa:
 *
 *   · trên 100% xảy ra mỗi ngày ai đó uống vượt mục tiêu — không kẹp thì cột
 *     nước dâng quá vành và, vì nó bị cắt theo thành cốc, phần thừa biến thành
 *     một mảng xanh phủ kín cả cái cốc. Đầy là đầy; vượt mục tiêu vẫn là đầy.
 *   · 0% là ngày chưa uống ngụm nào, và nó phải cho chiều cao ĐÚNG BẰNG 0 —
 *     một vệt xanh mỏng ở đáy đọc ra là "đã uống một chút".
 */
export function waterFill(pct: number): WaterFill {
  const level = Math.min(Math.max(Number.isFinite(pct) ? pct : 0, 0), 100) / 100;
  return { y: WATER_FLOOR - level * WATER_SPAN, height: level * WATER_SPAN };
}

/**
 * Kẹp một chiều cao cột nước về khoảng hợp lệ, rồi suy ra mép trên từ chính nó.
 *
 * ── vì sao hàm này tồn tại, đo được chứ không phỏng đoán ──
 *
 * `waterFill` đã kẹp phần trăm rồi, nên ĐÍCH của chuyển động luôn hợp lệ. Cái
 * không hợp lệ là một khung hình Ở GIỮA. Đo trên trình duyệt, ghi lại từng
 * lượt ghi lên thuộc tính của thẻ `<rect>`:
 *
 *     t=845    y 50      height 0          nghỉ ở đáy, đúng
 *     t=1079   y 92.31   height -42.31     ← MỘT khung, vọt NGƯỢC hướng
 *     t=1117   y 37.82   height 12.17      rồi hội tụ bình thường
 *     t=1183   y 21.85   …                 → 18.85
 *
 * `y + height` luôn bằng đáy cốc, tức cặp giá trị vẫn nhất quán — nhưng `y`
 * vọt lên 92,3 khi đáng lẽ phải đi từ 50 xuống 18,85. Giải ngược ra tiến độ:
 * `50 + (18,85 − 50)·p = 92,3` cho **p = −1,36**. Tiến độ ÂM: cặp
 * `withDelay(200, withTiming(...))` phát đúng một khung có tiến độ ngoại suy
 * trước khi phần trễ kết thúc, và bộ giải bezier cho ra một giá trị âm lớn.
 *
 * ── vì sao chỗ khác trong app không lộ ra ──
 *
 * `MiniRing` dùng ĐÚNG cặp ấy, và nó cũng nhận một khung tiến độ âm. Nhưng nó
 * animate một biến 0→1 rồi tính `strokeDashoffset = CIRC − p·CIRC`; p âm cho
 * ra một `strokeDashoffset` LỚN HƠN chu vi — vẫn là một giá trị SVG hợp lệ,
 * chỉ là một khung hình cung tròn biến mất. Không lỗi, không ai thấy.
 *
 * `height` của `<rect>` thì có miền xác định: âm là không hợp lệ, và trình
 * duyệt nói ra. Nên lỗi này không mới — thẻ Nước chỉ là chỗ đầu tiên nó phải
 * lộ mặt.
 *
 * ── và vì sao kẹp CHIỀU CAO rồi suy ra MÉP TRÊN, chứ không kẹp cả hai ──
 *
 * Kẹp hai giá trị độc lập thì chúng có thể hợp lệ mà vẫn không ăn khớp, và cột
 * nước sẽ nhấc khỏi đáy cốc trong một khung. Suy ra mép trên từ chiều cao đã
 * kẹp thì `y + height` bằng đáy cốc theo CẤU TẠO, không phải nhờ hai con số
 * tình cờ đồng ý với nhau.
 */
export function clampFill(height: number): WaterFill {
  /*
    Chạy được trên CẢ HAI luồng.

    Worklet vẽ mực nước sống trên luồng UI, và một hàm thường nhập từ module
    khác mà gọi ở đó sẽ ném trên máy thật. Chỉ thị này bảo trình biên dịch của
    Worklets đóng gói nó để luồng UI gọi được — nên phép kẹp vẫn chỉ có MỘT bản,
    dùng chung cho chỗ vẽ và cho bước gác chạy nó bằng Node.

    Không phải một lời hứa suông: `tools/water-glass.mjs` chạy Babel với đúng
    cấu hình của app rồi kiểm dấu mà trình biên dịch để lại. Một chỉ thị bị bỏ
    qua là một hàm thường nằm giữa luồng UI, và bản dựng web sẽ không bao giờ
    nói cho ai biết.
  */
  'worklet';
  const h = Math.min(Math.max(Number.isFinite(height) ? height : 0, 0), WATER_SPAN);
  return { y: WATER_FLOOR - h, height: h };
}
