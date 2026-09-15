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

/*
  KHÔNG có `todoOpen()` ở đây, và chỗ trống này là cố ý.

  Bản đầu của thẻ chỉ vẽ việc CHƯA xong, nên nó cần một phép lọc. Chủ dự án bác:
  "khi log xong thì lại bị mất cả" — một dòng biến mất ngay dưới ngón tay vừa
  bấm thì người dùng không biết mình vừa làm được gì. Thẻ nay vẽ đủ năm dòng và
  đánh dấu dòng đã ghi, nên phép lọc ấy không còn ai gọi.

  Nó vẫn nằm lại một thời gian, và `tools/linked.mjs` bắt đúng chuyện đó: một
  hàm chỉ còn phép kiểm của chính nó gọi tới thì phép kiểm ấy đang canh một thứ
  app không dùng. Thêm lại nó chỉ đúng khi có một màn THẬT cần hỏi "còn việc gì".
*/

/** Đã ghi mấy việc trên tổng số. */
export function todoProgress(done: TodoDone): { done: number; total: number } {
  return {
    done: TODO_ORDER.filter((k) => done[k]).length,
    total: TODO_ORDER.length,
  };
}

/**
 * "Xong" nghĩa là gì, cho hai việc mà nhiều nơi cùng phải trả lời.
 *
 * ── vì sao hai vị từ này phải rời khỏi chỗ chúng sinh ra ──
 *
 * `use-daily-quests` đã định nghĩa chúng cho phòng Koa, và từ khi có hẹn giờ
 * thì bộ lập lịch cũng phải trả lời đúng hai câu ấy — một lời nhắc "ghi bữa
 * ăn" bắn ra sau khi đã ghi là đúng cái phiền mà `!(isToday && ...)` sinh ra để
 * chặn. Viết lại điều kiện ở chỗ thứ hai là mở đường cho hai nơi lệch nhau,
 * kiểu app đã trả giá với "ba ý kiến về một ngày đi bộ bao xa".
 *
 * Nên chúng ở đây, và cả hai chỗ GỌI. `tools/todo-card.mjs` chạy chúng.
 */

/** Có calo ghi cho hôm nay thì coi như đã ghi bữa. */
export function mealDone(kcal: unknown): boolean {
  return (Number(kcal) || 0) > 0;
}

/**
 * Đêm qua đã được ghi chưa.
 *
 * Hai nguồn, vì app nhận giấc ngủ theo hai đường: một hàng `sleep_logs` do
 * người dùng hoặc HealthKit ghi, hoặc một con số phút nằm thẳng trong nhật ký
 * ngày. Thiếu vế nào cũng thành "chưa ghi" cho một đêm đã có dữ liệu.
 */
export function sleepDone(hasSleepRow: boolean, minutes: unknown): boolean {
  return hasSleepRow || (Number(minutes) || 0) > 0;
}
