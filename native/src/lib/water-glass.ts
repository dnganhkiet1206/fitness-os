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
  ── vẽ lại lần thứ ba, và lần này bám ẢNH MẪU ──

  Hai bản trước đều trượt, và cả hai trượt vì cùng một lý do: tôi bám vào lý lẽ
  của mình thay vì bám vào ảnh chủ dự án đã đưa từ đầu.

  Bản một vẽ một icon nét phẳng. Bản hai dựng phối cảnh elip đầy đủ, bị gọi là
  "tệ quá". Bản ba lấy đúng đường `GlassWater` của lucide — chặt chẽ về mặt hệ
  thống icon, và vẫn "xấu quá", vì nó trả lời sai câu hỏi.

  Đọc lại ảnh mẫu thì cái cốc ở đó KHÔNG phải một icon:

    · vành là một ELIP mỏng, không phải đoạn thẳng
    · ĐÁY DÀY — một khối thuỷ tinh đặc ở dưới, sẫm hơn hẳn thân
    · thân TRONG SUỐT: sáng ở giữa, tối dần ra hai mép
    · có BÓNG ĐỔ mềm bên dưới, nên cái cốc đứng trên một mặt phẳng
    · không có nét viền kiểu icon; đường bao là một vệt mảnh và nhạt

  Bốn thứ đầu là thứ làm nên "chiều sâu" mà chủ dự án đòi ba lần. Không cái nào
  là bóng đổ giả; tất cả đều là hình học của một cái cốc thật nhìn hơi chếch từ
  trên xuống.

  ── chỗ phải LỆCH khỏi ảnh mẫu, và lý do đo được ──

  Thẻ trong ảnh mẫu nằm trên nền xanh-xám nhạt, nên một cái cốc gần như trắng
  vẫn nổi. Mặt thẻ của app là TRẮNG. Một cái cốc trắng trên thẻ trắng là không
  có gì.

  Nên đường bao và vành giữ đủ sắc để qua sàn 3:1 của WCAG 1.4.11, còn thân thì
  nhạt như ảnh. Sàn ấy áp cho thứ MANG NGHĨA: ở đây là mực nước và cái vành —
  hai thứ nói "cốc đầy tới đâu". Thân cốc là phần kể chuyện, không phải phần
  mang số liệu.
*/

/** Khung vẽ. Cao hơn rộng để còn chỗ cho bóng đổ dưới chân cốc. */
export const GLASS_W = 64;
export const GLASS_H = 84;

/** Vành miệng. */
export const RIM = { cx: 32, cy: 9.5, rx: 23, ry: 5.5 } as const;
/** Mép ngoài đáy cốc. */
export const FOOT = { cx: 32, cy: 68, rx: 17.5, ry: 4.2 } as const;
/** Mặt trên của khối thuỷ tinh đặc ở đáy. */
export const BASE_TOP = 60;

const K = 0.5523;

/**
 * Nửa elip, viết bằng hai cung Bézier.
 *
 * `A` của SVG thì ngắn hơn, nhưng cờ `large-arc`/`sweep` sai một bit là ra hình
 * lộn ngược mà không ai đọc ra từ chuỗi. Bézier thì tính được bằng số học nên
 * bước gác kiểm được từng điểm.
 *
 * @param down true là nửa DƯỚI, false là nửa TRÊN
 * @param rev  true thì đi từ phải sang trái — cần khi khép đường bao
 */
function halfEllipse(cx: number, cy: number, rx: number, ry: number, down: boolean, rev = false): string {
  const s = down ? 1 : -1;
  const [x0, x1] = rev ? [rx, -rx] : [-rx, rx];
  const k = rev ? -K : K;
  return (
    `C${cx + x0} ${cy + s * K * ry} ${cx + k * rx} ${cy + s * ry} ${cx} ${cy + s * ry} ` +
    `C${cx - k * rx} ${cy + s * ry} ${cx + x1} ${cy + s * K * ry} ${cx + x1} ${cy}`
  );
}

function rxAtRaw(y: number): number {
  const t = (y - RIM.cy) / (FOOT.cy - RIM.cy);
  return RIM.rx + (FOOT.rx - RIM.rx) * Math.min(Math.max(t, 0), 1);
}
function ryAtRaw(y: number): number {
  return (RIM.ry * rxAtRaw(y)) / RIM.rx;
}

/**
 * Bóng của cả cái cốc: vành sau ở trên, hai thành loe, đáy ở dưới.
 *
 * Vừa là đường bao vẽ ra, vừa là vùng cắt cho nước và cho khối đáy — một đường
 * cho mọi việc nên không phần nào lệch khỏi phần nào.
 */
export const GLASS_PATH = [
  `M${RIM.cx - RIM.rx} ${RIM.cy}`,
  halfEllipse(RIM.cx, RIM.cy, RIM.rx, RIM.ry, false),
  `L${FOOT.cx + FOOT.rx} ${FOOT.cy}`,
  halfEllipse(FOOT.cx, FOOT.cy, FOOT.rx, FOOT.ry, true, true),
  'Z',
].join(' ');

/** Vành TRƯỚC — nửa dưới elip miệng, vẽ sau cùng vì nó ở gần mắt nhất. */
export const RIM_FRONT = `M${RIM.cx - RIM.rx} ${RIM.cy} ${halfEllipse(RIM.cx, RIM.cy, RIM.rx, RIM.ry, true)}`;

/**
 * Khối thuỷ tinh ĐẶC ở đáy.
 *
 * Trong ảnh mẫu đây là phần sẫm nhất của cái cốc, và nó không phải trang trí:
 * đáy cốc thật dày hơn thành, nên nó khúc xạ nhiều hơn và đọc ra đậm hơn. Bỏ
 * nó đi thì cái cốc thành một cái ống.
 */
export const BASE_PATH = [
  `M${RIM.cx - rxAtRaw(BASE_TOP)} ${BASE_TOP}`,
  halfEllipse(RIM.cx, BASE_TOP, rxAtRaw(BASE_TOP), ryAtRaw(BASE_TOP), true),
  `L${FOOT.cx + FOOT.rx} ${FOOT.cy}`,
  halfEllipse(FOOT.cx, FOOT.cy, FOOT.rx, FOOT.ry, true, true),
  'Z',
].join(' ');

/** Nửa bề ngang lòng cốc tại một độ cao — thành loe nên nó đổi theo y. */
export function rxAt(y: number): number {
  'worklet';
  const t = (y - RIM.cy) / (FOOT.cy - RIM.cy);
  return RIM.rx + (FOOT.rx - RIM.rx) * Math.min(Math.max(t, 0), 1);
}

/** Bán trục đứng của elip mặt nước tại một độ cao. */
export function ryAt(y: number): number {
  'worklet';
  return (RIM.ry * rxAt(y)) / RIM.rx;
}

/** Mặt nước khi đầy — ngay dưới mặt phẳng vành. */
export const WATER_CEIL = 13;
/** Mặt nước khi cạn — ngay trên khối đáy đặc. */
export const WATER_FLOOR = BASE_TOP;
export const WATER_SPAN = WATER_FLOOR - WATER_CEIL;

/** Biên độ gợn lúc nghỉ — không phải 0: mặt chất lỏng không bao giờ phẳng lì. */
export const REST_AMP = 0.45;
/** Biên độ lúc vừa có người uống. */
export const WAVE_AMP = 1.3;

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

const STEPS = 16;

function surfaceArc(cy: number, amp: number, phase: number, front: boolean): string[] {
  'worklet';
  const rx = rxAt(cy);
  const ry = ryAt(cy);
  const pts: string[] = [];
  for (let i = 0; i <= STEPS; i++) {
    const t = i / STEPS;
    const x = RIM.cx - rx * Math.cos(Math.PI * t);
    /* Sóng CHỈ cộng vào mép trước — mép gần mắt. Cộng vào cả mép sau thì mặt
       trên phình ra co vào như bong bóng, không phải một mặt chất lỏng. */
    const wave = front ? amp * Math.sin(2 * Math.PI * (t + phase)) : 0;
    const y = cy + (front ? ry : -ry) * Math.sin(Math.PI * t) + wave;
    pts.push(`${x.toFixed(2)} ${y.toFixed(2)}`);
  }
  return pts;
}

/** Khối nước nhìn qua thành cốc: mép trước mặt nước, rồi đổ xuống hết đáy. */
export function waterBody(height: number, amp: number, phase: number): string {
  'worklet';
  const { y: cy } = clampFill(height);
  const a = Math.min(Math.max(Number.isFinite(amp) ? amp : 0, 0), WAVE_AMP);
  return `M${surfaceArc(cy, a, phase, true).join(' L')} L${GLASS_W + 8} ${GLASS_H} L-8 ${GLASS_H} Z`;
}

/**
 * MẶT TRÊN của khối nước — khoảng giữa mép sau và mép trước.
 *
 * Đây là thứ làm nước thành một KHỐI thay vì một mảng màu, và là nửa còn lại
 * của câu trả lời cho "không có chiều sâu".
 */
export function waterFace(height: number, amp: number, phase: number): string {
  'worklet';
  const { y: cy } = clampFill(height);
  const a = Math.min(Math.max(Number.isFinite(amp) ? amp : 0, 0), WAVE_AMP);
  const back = surfaceArc(cy, a, phase, false);
  const front = surfaceArc(cy, a, phase, true).reverse();
  return `M${back.join(' L')} L${front.join(' L')} Z`;
}
