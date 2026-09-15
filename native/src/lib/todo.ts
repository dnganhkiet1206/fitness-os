/**
 * Việc cần ghi hôm nay, và thứ tự của chúng.
 *
 * ── vì sao là một tệp riêng chứ không nằm trong component ──
 *
 * Danh sách này thay thế hàng bốn chip trên Today, và hàng ấy đã từng sai đúng
 * ở phần LOGIC chứ không ở phần vẽ: `lib/today-cta.ts` ra đời vì điều kiện
 * `planned || day?.is_rest` không bao giờ hỏi `done`, nên một buổi tập đã ghi
 * xong vẫn mời "Ghi buổi tập". Một danh sách nằm trong JSX là một danh sách
 * không công cụ nào chạy được.
 *
 * Nên thứ tự và phép lọc ở đây, và `tools/todo-card.mjs` GỌI chúng.
 *
 * ── thứ tự là của chủ dự án, không phải của tôi ──
 *
 * "ghi bữa ăn, ghi buổi tập, ghi giấc ngủ, nhập sinh trắc, ghi cân nặng" —
 * đúng thứ tự ấy. Nó cũng là thứ tự từ việc làm nhiều lần mỗi ngày xuống việc
 * làm một lần, nên danh sách không cần sắp lại theo tần suất.
 *
 * ── nước và bước đi KHÔNG có ở đây ──
 *
 * Hệ nhiệm vụ ngày (`useDailyQuests`) đo năm thứ, trong đó có nước và bước đi.
 * Hai thứ ấy không phải một lượt GHI: nước là nút `+` ngay trên thẻ của nó, còn
 * bước đi do HealthKit mang về chứ không ai gõ vào. Một dòng "cần làm" mà hành
 * động của nó là "đi bộ thêm" thì không có nút nào bấm được.
 */

export type TodoKey = 'meal' | 'workout' | 'sleep' | 'biometrics' | 'weight';

export const TODO_ORDER: readonly TodoKey[] = ['meal', 'workout', 'sleep', 'biometrics', 'weight'];

export type TodoDone = Record<TodoKey, boolean>;

/** Những việc chưa ghi, theo đúng thứ tự trên. */
export function todoOpen(done: TodoDone): TodoKey[] {
  return TODO_ORDER.filter((k) => !done[k]);
}

/** Đã ghi mấy việc trên tổng số. */
export function todoProgress(done: TodoDone): { done: number; total: number } {
  return {
    done: TODO_ORDER.filter((k) => done[k]).length,
    total: TODO_ORDER.length,
  };
}
