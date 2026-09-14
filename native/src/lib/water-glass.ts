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
export const GLASS_H = 66;

/**
 * Thành cốc: hơi loe, đáy bo — hình một cái ly thật.
 *
 * Mặt nước là một hình chữ nhật bị CẮT theo chính đường này, nên ở gần đáy nó
 * tự hẹp lại đúng theo độ loe. Vẽ mặt nước bằng một hình thang tự tính sẽ phải
 * lặp lại phép loe ở chỗ thứ hai, và hai chỗ thì sẽ có ngày lệch nhau.
 */
export const GLASS_PATH = 'M4 4 L48 4 L43 55 A5 5 0 0 1 38 60 L14 60 A5 5 0 0 1 9 55 Z';

/**
 * Đầy 100% là đầy tới TRONG LÒNG cốc, không phải tràn qua vành (vành ở y=3).
 */
export const WATER_CEIL = 7;
/** Mặt trong của đáy. */
export const WATER_FLOOR = 58.5;
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


/**
 * Biên độ sóng lớn nhất, tính theo toạ độ của khung vẽ cốc.
 *
 * 2,2 trên một cái cốc rộng 52 là hơn 4% bề ngang — đủ để mắt bắt được là mặt
 * nước ĐANG động, và không đủ để thành một hoạt hình. Chủ dự án chốt "phẳng,
 * tối giản", nên sóng ở đây là một gợn chứ không phải một con sóng.
 */
export const WAVE_AMP = 2.2;

/**
 * Đường viền của khối nước, kể cả mặt sóng ở trên.
 *
 * ── vì sao mặt nước phải gợn ──
 *
 * Bản đầu vẽ khối nước bằng một `<rect>`: mặt nước là một cạnh thẳng tuyệt đối
 * trượt lên. Chủ dự án xem rồi nói "chuyển động xấu, không phải không có" —
 * đúng, vì một mặt phẳng trượt lên là chuyển động của một cái THANH, không
 * phải của nước. Nước bị đổ thêm vào thì nó động, rồi lặng dần.
 *
 * Nên `amp` không phải một hằng số trang trí: nó là thứ chạy về 0 sau mỗi lần
 * ghi. Lúc yên, `waterPath` trả về đúng một mặt phẳng — không có chuyển động
 * vĩnh viễn nào chạy nền, thứ vừa tốn pin vừa trái với "một khoảnh khắc có chủ
 * ý" mà tấm nào trong app cũng theo.
 *
 * ── vì sao trả về CHUỖI, và vì sao nó là worklet ──
 *
 * Một `d` duy nhất vẽ cả sóng lẫn thân nước, nên chỉ có MỘT thuộc tính động và
 * không có đường ghép nào giữa hai lớp để lệch nhau. Dựng chuỗi trên luồng UI
 * mỗi khung là việc rẻ với một đường ngắn thế này.
 *
 * `'worklet'` vì nó được gọi trong `useAnimatedProps` — cùng lý do đã ghi ở
 * `clampFill`, và cùng cái bẫy: thiếu chỉ thị thì nó ném trên máy thật trong
 * khi bản dựng web không nói gì.
 *
 * @param height chiều cao cột nước (sẽ được kẹp)
 * @param amp    biên độ sóng hiện tại, 0 là mặt phẳng
 * @param phase  pha sóng theo chu kỳ, dùng phần lẻ nên chạy bao nhiêu cũng được
 */
export function waterPath(height: number, amp: number, phase: number): string {
  'worklet';
  const { y: top } = clampFill(height);
  const bottom = GLASS_H + 6;
  const a = Math.min(Math.max(Number.isFinite(amp) ? amp : 0, 0), WAVE_AMP);
  /* Dưới ngưỡng này sóng không còn đọc ra là sóng, chỉ còn là một đường răng
     cưa. Trả mặt phẳng luôn: rẻ hơn, và sạch hơn ở khung cuối của mỗi lần lặng. */
  if (a < 0.05) return `M-8 ${top} L${GLASS_W + 8} ${top} L${GLASS_W + 8} ${bottom} L-8 ${bottom} Z`;

  /* Chu kỳ ĐÚNG BẰNG bề ngang cốc, nên dịch pha một chu kỳ là về đúng hình cũ:
     sóng trượt liên tục mà không có chỗ nối. Ba chu kỳ, bắt đầu từ trái màn, để
     mọi pha đều phủ kín 0..GLASS_W. */
  const P = GLASS_W;
  const x0 = -P + (phase - Math.floor(phase)) * P;
  /* 1,33 là hệ số quen thuộc để một cung bậc hai chạm đúng đỉnh của hình sin;
     thiếu nó thì đỉnh sóng bẹt và gợn đọc ra như một nếp gấp. */
  const k = a * 1.33;
  let d = `M${x0.toFixed(2)} ${top.toFixed(2)}`;
  for (let i = 0; i < 6; i++) {
    const dir = i % 2 === 0 ? -1 : 1;
    const cx = x0 + (i + 0.5) * (P / 2);
    const ex = x0 + (i + 1) * (P / 2);
    d += ` Q${cx.toFixed(2)} ${(top + dir * k).toFixed(2)} ${ex.toFixed(2)} ${top.toFixed(2)}`;
  }
  const xEnd = x0 + 3 * P;
  return `${d} L${xEnd.toFixed(2)} ${bottom} L${x0.toFixed(2)} ${bottom} Z`;
}
