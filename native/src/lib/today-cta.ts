/**
 * Hôm nay còn việc gì, và cái nút nói gì.
 *
 * ── lỗi mà tệp này sinh ra để chặn ──
 *
 * Thẻ "Hôm nay" ở tab Tập luyện có bốn tình huống và chỉ ba câu trả lời, nên
 * một câu phải gánh hai việc. Câu bị gánh là `nLogFree` — "Ghi buổi tập":
 *
 *     hôm nay nghỉ, chưa tập     → "Ghi buổi tập"   ĐÚNG
 *     hôm nay đã tập xong        → "Ghi buổi tập"   SAI
 *
 * Ở ca thứ hai, ngay dưới dòng "✓ Đã tập hôm nay" là một viên nút cao 48 điểm
 * chạy hết bề ngang — phần tử to nhất thẻ — mang đúng chữ mà app dùng cho việc
 * "hôm nay bạn chưa ghi". Chủ dự án khoanh đỏ nó và hỏi thẳng: buổi tập xong
 * rồi thì còn hiện ghi buổi tập làm gì.
 *
 * Và câu trả lời KHÔNG phải là gỡ nút đi. Chính chủ dự án đã đặt luật ngược
 * lại: "không ghi cho ngày chưa tới là đúng, chỉ cho ghi thêm trong ngày đó
 * nếu phát sinh buổi tập mới". Gỡ nút là lấy mất đường ra ấy khỏi cả tab —
 * đúng lỗi "app trông như đã đóng cửa" mà tấm kế hoạch vừa phải sửa. Thứ sai
 * là cái NHÃN, không phải cái nút: một buổi phát sinh và buổi tập của hôm nay
 * là hai việc khác nhau, nên chúng không được dùng chung một câu.
 *
 * ── vì sao là một hàm, không phải một chuỗi ba dấu hỏi trong JSX ──
 *
 * Bốn cờ cho mười sáu tổ hợp, và cái sai ở trên là một tổ hợp không ai nghĩ
 * tới chứ không phải một dòng ai đó gõ nhầm. Ở trong này thì nó CHẠY RỜI ĐƯỢC,
 * nên `tools/plan-actuals.mjs` quét đủ cả mười sáu ca thay vì tin vào mắt
 * người đọc diff.
 */
export type TodayCta =
  /** Có kế hoạch và chưa tập: nút đặc, cộng một nút phụ để ghi tự do. */
  | 'start'
  /** Đã tập hôm nay rồi: chỉ còn đường cho buổi PHÁT SINH, và nói rõ thế. */
  | 'extra'
  /** Hôm nay nghỉ mà vẫn tập: ghi tự do. */
  | 'log-free'
  /** Hôm nay trống: chọn buổi tập đã. */
  | 'pick'
  /** Chưa đọc xong thì không đoán — xem ghi chú `unknown` ở thẻ. */
  | 'none';

export interface TodayState {
  /** Truy vấn lịch còn đang bay hoặc đã hỏng. */
  unknown: boolean;
  /** Hôm nay có template gán vào và không phải ngày nghỉ. */
  planned: boolean;
  /** Hôm nay được đánh dấu nghỉ. */
  rest: boolean;
  /** Đã có ít nhất một buổi tập ghi cho hôm nay. */
  done: boolean;
}

export function todayCta(s: TodayState): TodayCta {
  if (s.unknown) return 'none';
  /*
    `done` xét TRƯỚC cả `planned` lẫn `rest`, vì nó là thứ đã xảy ra còn hai cái
    kia mới là dự định. Một ngày trống mà đã tập thì "Chọn buổi tập" cũng sai
    y như "Ghi buổi tập" — nó mời người ta xếp lịch cho một ngày đã tập xong.
  */
  if (s.done) return 'extra';
  if (s.planned) return 'start';
  if (s.rest) return 'log-free';
  return 'pick';
}
