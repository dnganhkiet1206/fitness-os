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
  ── vẽ lại lần thứ tư, theo ảnh chủ dự án gửi ──

  Ba bản trước: icon nét phẳng, phối cảnh elip, rồi bám đúng đường của lucide.
  Bản nào cũng bị bác. Rồi chủ dự án gửi một ảnh chụp app khác — thứ họ thấy
  đẹp — và nó nói năm điều, cả năm đều khác thứ tôi đang vẽ:

    1. miệng cốc HỞ — không đường ngang, không vành elip; hai thành kết thúc
       bằng đầu nét bo tròn
    2. nét RẤT DÀY và màu XÁM trung tính, không phải xanh
    3. đáy bo tròn rộng, thành hơi thuôn
    4. sóng mặt nước RÕ và LỚN, không phải một gợn
    5. một vệt sáng nhỏ trong lòng nước

  Điều đáng nói: đây đúng là "phẳng, tối giản, nét đậm" mà chủ dự án đã trả lời
  từ đầu. Họ nhất quán suốt; tôi mới là người đi lòng vòng — và mỗi vòng tôi lại
  thêm một lớp (elip, đáy dày, bóng đổ, chuyển sắc) để đuổi theo chữ "chiều
  sâu", trong khi chiều sâu ở ảnh này đến từ NÉT DÀY và SÓNG LỚN, không từ phối
  cảnh.

  Miệng hở là chi tiết dễ bỏ qua nhất và cũng quyết định nhất: một đường ngang
  vắt qua miệng biến cái cốc thành cái hộp. Hở thì mắt tự hiểu là đồ đựng.
*/

/** Khung dựng hình. */
export const GLASS_W = 56;
export const GLASS_H = 72;

/*
  Hình cốc, viết bằng số để bước gác đọc được từng mốc thay vì dò chuỗi.

  Thành hơi thuôn: mép trên rộng hơn mép dưới đúng 8 đơn vị mỗi bên. Đáy bo
  bằng cung bậc hai bán kính lớn, đúng như ảnh.
*/
export const TOP_Y = 7;
export const BOT_Y = 64;
export const TOP_LEFT = 9;
export const TOP_RIGHT = 47;
export const BOT_LEFT = 14;
export const BOT_RIGHT = 42;
/** Chỗ thành cốc bắt đầu cong vào đáy. */
const CURVE_Y = 56;
/** Bề dày nét. Dày, vì đó là thứ làm cái cốc có mặt. */
export const STROKE = 4;

/**
 * Thành cốc — đường HỞ, không khép ở miệng.
 *
 * Đây là điểm khác quan trọng nhất so với ba bản trước. Một đường ngang vắt
 * qua miệng biến cái cốc thành cái hộp; hở thì mắt tự hiểu là đồ đựng.
 */
export const GLASS_STROKE_PATH =
  `M${TOP_LEFT} ${TOP_Y} ` +
  `L${BOT_LEFT - 1} ${CURVE_Y} ` +
  `Q${BOT_LEFT - 0.5} ${BOT_Y} ${BOT_LEFT + 5} ${BOT_Y} ` +
  `L${BOT_RIGHT - 5} ${BOT_Y} ` +
  `Q${BOT_RIGHT + 0.5} ${BOT_Y} ${BOT_RIGHT + 1} ${CURVE_Y} ` +
  `L${TOP_RIGHT} ${TOP_Y}`;

/**
 * Cùng hình nhưng KHÉP, dùng làm vùng cắt cho nước.
 *
 * Một hình cho cả hai việc: nước không bao giờ lệch khỏi thành, và khi đổi
 * dáng cốc thì nước đi theo mà không phải sửa chỗ thứ hai.
 */
export const GLASS_CLIP_PATH = `${GLASS_STROKE_PATH} Z`;

/** Mặt nước khi đầy — dưới miệng một quãng, vì cốc đầy tràn thì không ai rót. */
export const WATER_CEIL = TOP_Y + 5;
/** Mặt nước khi cạn — sát đáy trong. */
export const WATER_FLOOR = BOT_Y - 2;
export const WATER_SPAN = WATER_FLOOR - WATER_CEIL;

/** Biên độ sóng lúc nghỉ. Lớn, theo ảnh: sóng ở đó rõ chứ không phải một gợn. */
export const REST_AMP = 1.5;
/** Biên độ lúc vừa có người uống. */
export const WAVE_AMP = 3;

export interface WaterFill {
  y: number;
  height: number;
}

/**
 * Mực nước cho một phần trăm đã hoàn thành.
 *
 * Kẹp hai đầu, cả hai đều là ca THẬT: trên 100% xảy ra mỗi ngày ai đó uống
 * vượt mục tiêu, còn 0% phải cho chiều cao ĐÚNG BẰNG 0 — một vệt xanh mỏng ở
 * đáy đọc ra là "đã uống một chút".
 */
export function waterFill(pct: number): WaterFill {
  const level = Math.min(Math.max(Number.isFinite(pct) ? pct : 0, 0), 100) / 100;
  return { y: WATER_FLOOR - level * WATER_SPAN, height: level * WATER_SPAN };
}

/**
 * Kẹp chiều cao rồi suy ra mặt nước từ chính nó.
 *
 * ── đo được, không phỏng đoán ──
 *
 * `waterFill` kẹp phần trăm nên ĐÍCH luôn hợp lệ; cái không hợp lệ là một
 * khung Ở GIỮA. Bẫy ngay chỗ ghi thuộc tính trên trình duyệt cho ra một khung
 * `y = 92,31`, `height = −42,31` — giải ngược là tiến độ −1,36: cặp
 * `withDelay` + `withTiming` phát một khung ngoại suy trước khi hết trễ.
 *
 * `MiniRing` dùng đúng cặp ấy và cũng nhận khung âm, nhưng nó ghi vào
 * `strokeDashoffset` — không có miền xác định — nên không ai thấy.
 */
export function clampFill(height: number): WaterFill {
  'worklet';
  const h = Math.min(Math.max(Number.isFinite(height) ? height : 0, 0), WATER_SPAN);
  return { y: WATER_FLOOR - h, height: h };
}

const STEPS = 18;

/**
 * Khối nước: mặt sóng ở trên, đổ xuống hết đáy.
 *
 * Bị cắt theo chính hình cốc ở chỗ vẽ, nên hai bên cứ việc chạy rộng ra ngoài.
 *
 * Gấp khúc lấy mẫu chứ không phải cung Bézier: sóng chỉ là một số hạng cộng vào
 * y, còn một cung Bézier gợn sóng thì phải điều khiển từng đỉnh.
 *
 * `'worklet'` vì nó chạy trong `useAnimatedProps`, trên luồng UI — thiếu chỉ
 * thị thì nó ném trên máy thật, còn bản dựng web không nói gì.
 */
export function waterPath(height: number, amp: number, phase: number): string {
  'worklet';
  const { y: top } = clampFill(height);
  const a = Math.min(Math.max(Number.isFinite(amp) ? amp : 0, 0), WAVE_AMP);
  const left = TOP_LEFT - 4;
  const right = TOP_RIGHT + 4;
  const pts: string[] = [];
  for (let i = 0; i <= STEPS; i++) {
    const t = i / STEPS;
    const x = left + (right - left) * t;
    /* Một chu kỳ trọn trên bề ngang cốc, đúng như ảnh: một bụng lên rồi một
       bụng xuống. Nhiều hơn thì thành lăn tăn mặt hồ, không phải cốc nước. */
    const y = top + a * Math.sin(2 * Math.PI * (t + phase));
    pts.push(`${x.toFixed(2)} ${y.toFixed(2)}`);
  }
  return `M${pts.join(' L')} L${right} ${GLASS_H + 4} L${left} ${GLASS_H + 4} Z`;
}
