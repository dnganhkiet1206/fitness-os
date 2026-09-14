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
  const span = WATER_FLOOR - WATER_CEIL;
  return { y: WATER_FLOOR - level * span, height: level * span };
}
