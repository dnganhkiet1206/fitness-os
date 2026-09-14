/**
 * Một loạt hiệp đã làm, tóm lại thành một dòng — hay đúng hơn, thành QUYẾT
 * ĐỊNH đằng sau một dòng.
 *
 * ── vì sao nó rời khỏi `day-plan.tsx` ──
 *
 * Thẻ bài tập ở màn Plan thu lại khi xong, và lúc ấy các hàng biến mất nên
 * tiêu đề phải nói thay chúng. Câu hỏi "nói thế nào" có một chỗ dễ sai và một
 * chỗ khó kiểm:
 *
 *   dễ sai   — nói theo KẾ HOẠCH. Ảnh chủ dự án gửi có Bench Press giao 7,5 kg
 *              mà cả ba hiệp đều ghi 10 kg. Một dòng tóm tắt đọc từ kế hoạch sẽ
 *              bình thản in "7,5 kg" dưới một dấu tick xanh.
 *   khó kiểm — ba hiệp KHÁC nhau thì không có một bộ số nào đại diện được, và
 *              "3 × 8 · 10 kg" cho 10/12/8 kg là một lời nói dối gọn gàng.
 *
 * Cả hai đều là quyết định, không phải định dạng. Để chúng nằm giữa JSX thì
 * cách duy nhất kiểm là nhìn ảnh chụp. Ở đây chúng là một hàm thuần, và
 * `tools/plan-collapse.mjs` CHẠY nó qua từng ca — kể cả đúng ca 7,5-với-10.
 *
 * Hàm này cố ý KHÔNG định dạng: không đơn vị, không quy đổi lb, không chữ.
 * Đơn vị và ngôn ngữ là việc của chỗ vẽ, và trộn chúng vào đây sẽ buộc luật
 * phải dựng cả một `i18n` giả để hỏi một câu về số học.
 */

/** Một hiệp ĐÃ LÀM — thứ `performed()` trả về, không phải thứ kế hoạch giao. */
export interface DoneSet {
  /** kilograms, as stored */
  weight: number;
  reps: number;
  /** hiệp tính bằng thời gian (plank, treo xà) — khi có thì `reps` vô nghĩa */
  durationSec?: number;
}

export type SetSummary =
  /** Mọi hiệp giống nhau: một bộ số nói đúng cả loạt. */
  | { kind: 'uniform'; sets: number; reps: number; weightKg: number }
  /** Không có bộ số nào đại diện được — lùi về thứ vẫn đúng. */
  | { kind: 'volume'; sets: number; volumeKg: number };

/**
 * `null` khi chưa có hiệp nào xong: không có gì để tóm tắt, và một dòng trống
 * trung thực hơn một số 0.
 */
export function summarizeSets(done: DoneSet[]): SetSummary | null {
  if (!done.length) return null;

  const first = done[0];
  /*
    Hai điều kiện, và chỉ hai — bản đầu có ba.

    `reps > 0` là thứ chặn "3 × 0". Nhánh `uniform` in ra "{sets} × {reps}",
    nên một hiệp chưa nhập gì, hay một hiệp tính bằng THỜI GIAN (plank 60 giây
    có `reps` bằng 0), sẽ in ra một câu vừa sai vừa trông như lỗi. Thời lượng
    chưa có chỗ trong dòng tóm tắt; cho tới khi có, nhánh tổng tạ vẫn nói đúng
    số hiệp.

    `every` là thứ chặn việc lấy hiệp đầu đại diện cho cả loạt — và nó xét CẢ
    `done[0]`, nên một điều kiện `!first.durationSec` đứng riêng ở đầu là thừa.
    Bản đầu có nó; phép thử ngược của `tools/plan-collapse.mjs` lộ ra rằng phá
    nó đi không làm ca thời-lượng đỏ, vì `every` đã bắt rồi.
  */
  const uniform =
    first.reps > 0
    && done.every(
      (d) => !d.durationSec && d.weight === first.weight && d.reps === first.reps,
    );

  if (uniform) {
    return { kind: 'uniform', sets: done.length, reps: first.reps, weightKg: first.weight };
  }
  return {
    kind: 'volume',
    sets: done.length,
    volumeKg: done.reduce((s, d) => s + d.weight * d.reps, 0),
  };
}
