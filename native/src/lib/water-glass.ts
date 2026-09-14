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
export const GLASS_W = 52;
export const GLASS_H = 70;

/*
  ── vì sao có phối cảnh, sau khi đã bỏ nó một lần ──

  Bản trước vẽ cốc hoàn toàn PHẲNG: miệng là một đoạn thẳng ngang, mặt nước là
  một đường ngang. Chủ dự án xem rồi nói "cốc nước xấu quá không có chiều sâu".

  Một đoạn thẳng ngang không đọc ra là cái miệng cốc — nó đọc ra là nắp. Thứ
  làm mắt người thấy một cái cốc là VÀNH ELIP: ta luôn nhìn cốc hơi từ trên
  xuống, nên miệng tròn chiếu thành elip. Đó là một tín hiệu mạnh hơn mọi bóng
  đổ, và nó không tốn một lớp nào.

  Kèm theo là hệ quả thứ hai, quan trọng không kém: mặt nước cũng thành elip,
  nên khối nước có một MẶT TRÊN nhìn thấy được. Nước trong cốc phẳng thì chỉ là
  một mảng màu; nước có mặt trên thì là một khối.
*/

/** Vành miệng cốc. */
export const RIM = { cx: 26, cy: 9, rx: 22, ry: 5.5 } as const;
/** Đáy cốc. */
export const BASE = { cx: 26, cy: 61, rx: 14, ry: 3.5 } as const;

/**
 * Nửa bề ngang của lòng cốc tại một độ cao — thành cốc loe nên nó đổi theo y.
 *
 * Mọi thứ nằm trong cốc đều phải hỏi hàm này: mặt nước ở lưng chừng hẹp hơn
 * miệng và rộng hơn đáy, và nếu vẽ nó bằng một bề ngang cố định thì mặt nước
 * sẽ thò ra ngoài thành cốc ở trên và hụt vào trong ở dưới.
 */
export function rxAt(y: number): number {
  'worklet';
  const t = (y - RIM.cy) / (BASE.cy - RIM.cy);
  return RIM.rx + (BASE.rx - RIM.rx) * Math.min(Math.max(t, 0), 1);
}

/** Bán trục đứng của elip tại một độ cao — giữ đúng tỉ lệ với vành miệng. */
export function ryAt(y: number): number {
  'worklet';
  return (RIM.ry * rxAt(y)) / RIM.rx;
}

/**
 * Bóng của cả cái cốc: vành sau ở trên, hai thành, đáy ở dưới.
 *
 * Dựng bằng cung bậc ba với hằng số 0,5523 — phép xấp xỉ cung tròn một phần tư
 * bằng Bézier — chứ không dùng lệnh `A`. Hai lý do: cờ `large-arc`/`sweep` của
 * `A` là thứ sai một bit thì ra hình lộn ngược mà không ai đọc ra từ chuỗi, và
 * cung Bézier thì tính được bằng số học nên bước gác kiểm được từng điểm.
 */
const K = 0.5523;
export const GLASS_PATH = [
  `M${RIM.cx - RIM.rx} ${RIM.cy}`,
  `C${RIM.cx - RIM.rx} ${RIM.cy - K * RIM.ry} ${RIM.cx - K * RIM.rx} ${RIM.cy - RIM.ry} ${RIM.cx} ${RIM.cy - RIM.ry}`,
  `C${RIM.cx + K * RIM.rx} ${RIM.cy - RIM.ry} ${RIM.cx + RIM.rx} ${RIM.cy - K * RIM.ry} ${RIM.cx + RIM.rx} ${RIM.cy}`,
  `L${BASE.cx + BASE.rx} ${BASE.cy}`,
  `C${BASE.cx + BASE.rx} ${BASE.cy + K * BASE.ry} ${BASE.cx + K * BASE.rx} ${BASE.cy + BASE.ry} ${BASE.cx} ${BASE.cy + BASE.ry}`,
  `C${BASE.cx - K * BASE.rx} ${BASE.cy + BASE.ry} ${BASE.cx - BASE.rx} ${BASE.cy + K * BASE.ry} ${BASE.cx - BASE.rx} ${BASE.cy}`,
  'Z',
].join(' ');

/**
 * Cung TRƯỚC của vành miệng — nửa dưới của elip.
 *
 * Vẽ riêng và vẽ SAU khối nước, vì đây là phần vành nằm giữa người xem và lòng
 * cốc. Không có nó thì miệng cốc chỉ còn một nửa và cái cốc đọc ra như bị cắt
 * ngang.
 */
export const RIM_FRONT = [
  `M${RIM.cx - RIM.rx} ${RIM.cy}`,
  `C${RIM.cx - RIM.rx} ${RIM.cy + K * RIM.ry} ${RIM.cx - K * RIM.rx} ${RIM.cy + RIM.ry} ${RIM.cx} ${RIM.cy + RIM.ry}`,
  `C${RIM.cx + K * RIM.rx} ${RIM.cy + RIM.ry} ${RIM.cx + RIM.rx} ${RIM.cy + K * RIM.ry} ${RIM.cx + RIM.rx} ${RIM.cy}`,
].join(' ');

/** Tâm mặt nước khi đầy — ngay dưới mặt phẳng vành, không tràn qua. */
export const WATER_CEIL = 12;
/** Tâm mặt nước khi cạn — ngay trên đáy. */
export const WATER_FLOOR = 58;
/** Quãng mà tâm mặt nước đi được. */
export const WATER_SPAN = WATER_FLOOR - WATER_CEIL;

export interface WaterFill {
  /** Tâm mặt nước, theo toạ độ SVG (y nhỏ = cao). */
  y: number;
  /** Chiều cao cột nước. */
  height: number;
}

/**
 * Mực nước cho một phần trăm đã hoàn thành.
 *
 * Kẹp hai đầu, và cả hai đầu đều là ca THẬT chứ không phải phòng xa: trên 100%
 * xảy ra mỗi ngày ai đó uống vượt mục tiêu, và 0% là ngày chưa uống ngụm nào —
 * nó phải cho chiều cao ĐÚNG BẰNG 0, vì một vệt xanh mỏng ở đáy đọc ra là "đã
 * uống một chút".
 */
export function waterFill(pct: number): WaterFill {
  const level = Math.min(Math.max(Number.isFinite(pct) ? pct : 0, 0), 100) / 100;
  return { y: WATER_FLOOR - level * WATER_SPAN, height: level * WATER_SPAN };
}

/**
 * Kẹp một chiều cao cột nước về khoảng hợp lệ, rồi suy ra tâm mặt nước từ nó.
 *
 * ── vì sao hàm này tồn tại, đo được chứ không phỏng đoán ──
 *
 * `waterFill` đã kẹp phần trăm nên ĐÍCH luôn hợp lệ. Cái không hợp lệ là một
 * khung hình Ở GIỮA. Đo trên trình duyệt, bẫy ngay tại chỗ ghi thuộc tính:
 *
 *     t=845    y 50      height 0          nghỉ ở đáy, đúng
 *     t=1079   y 92.31   height -42.31     ← MỘT khung, vọt NGƯỢC hướng
 *     t=1117   y 37.82   height 12.17      rồi hội tụ bình thường
 *
 * Giải ngược ra tiến độ −1,36: cặp `withDelay(200, withTiming(...))` phát đúng
 * một khung có tiến độ ngoại suy trước khi phần trễ kết thúc.
 *
 * `MiniRing` dùng đúng cặp ấy và cũng nhận khung âm, nhưng nó ghi vào
 * `strokeDashoffset` — một giá trị không có miền xác định — nên chỉ mất một
 * khung cung tròn mà không ai thấy. Lỗi không mới; cái cốc chỉ là hình đầu
 * tiên có ràng buộc đủ chặt để nó phải lộ mặt.
 */
export function clampFill(height: number): WaterFill {
  'worklet';
  const h = Math.min(Math.max(Number.isFinite(height) ? height : 0, 0), WATER_SPAN);
  return { y: WATER_FLOOR - h, height: h };
}

/**
 * Biên độ sóng lớn nhất, theo toạ độ khung vẽ.
 *
 * 2,2 trên một cái cốc rộng 52 là hơn 4% bề ngang — đủ để mắt bắt được mặt
 * nước ĐANG động, không đủ để thành hoạt hình.
 */
export const WAVE_AMP = 2.2;

/** Số điểm lấy mẫu trên mỗi cung mặt nước. 14 là đủ mượt ở cỡ 52 điểm. */
const STEPS = 14;

/**
 * Một cung của mặt nước, lấy mẫu thành đường gấp khúc.
 *
 * Gấp khúc chứ không phải cung Bézier, vì mặt nước còn phải cộng thêm SÓNG:
 * một cung Bézier gợn sóng cần điều khiển mỗi đỉnh riêng, còn lấy mẫu thì sóng
 * chỉ là một số hạng cộng vào y. Ở cỡ này, 14 điểm cho một cung 44 điểm ngang
 * là dưới một nửa điểm ảnh mỗi đoạn.
 *
 * @param front true là cung TRƯỚC (nửa dưới elip), false là cung SAU
 */
function arcPoints(cy: number, amp: number, phase: number, front: boolean): string[] {
  'worklet';
  const rx = rxAt(cy);
  const ry = ryAt(cy);
  const pts: string[] = [];
  for (let i = 0; i <= STEPS; i++) {
    const t = i / STEPS;
    const x = RIM.cx - rx * Math.cos(Math.PI * t);
    /* Sóng CHỈ cộng vào cung trước: đó là mép nước gần người xem. Cộng vào cả
       cung sau thì mặt trên của khối nước phình ra co vào như một cái bong
       bóng, chứ không phải một mặt chất lỏng đang dập dềnh. */
    const wave = front ? amp * Math.sin(2 * Math.PI * (2 * t + phase)) : 0;
    const y = cy + (front ? ry : -ry) * Math.sin(Math.PI * t) + wave;
    pts.push(`${x.toFixed(2)} ${y.toFixed(2)}`);
  }
  return pts;
}

/**
 * Khối nước nhìn qua thành cốc: mép trước của mặt nước, rồi đổ xuống hết đáy.
 *
 * Bị cắt theo bóng cốc ở chỗ vẽ, nên hai bên cứ việc chạy rộng ra ngoài.
 */
export function waterBody(height: number, amp: number, phase: number): string {
  'worklet';
  const { y: cy } = clampFill(height);
  const a = Math.min(Math.max(Number.isFinite(amp) ? amp : 0, 0), WAVE_AMP);
  const pts = arcPoints(cy, a, phase, true);
  return `M${pts.join(' L')} L${GLASS_W + 8} ${GLASS_H + 6} L-8 ${GLASS_H + 6} Z`;
}

/**
 * MẶT TRÊN của khối nước: khoảng giữa mép sau và mép trước của mặt nước.
 *
 * Đây là thứ làm nước thành một KHỐI thay vì một mảng màu, và là nửa còn lại
 * của câu trả lời cho "không có chiều sâu". Vẽ bằng chính token nước, còn thân
 * nước thì tối dần xuống đáy — nên mặt trên tự đọc ra là sáng nhất mà không
 * cần thêm một màu nào.
 */
export function waterFace(height: number, amp: number, phase: number): string {
  'worklet';
  const { y: cy } = clampFill(height);
  const a = Math.min(Math.max(Number.isFinite(amp) ? amp : 0, 0), WAVE_AMP);
  const back = arcPoints(cy, a, phase, false);
  const front = arcPoints(cy, a, phase, true).reverse();
  return `M${back.join(' L')} L${front.join(' L')} Z`;
}
