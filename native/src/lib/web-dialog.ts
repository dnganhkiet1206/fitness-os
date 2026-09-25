/**
 * `Alert.alert` bằng hộp thoại của trình duyệt — phần logic, không import gì
 * (#83). `web-alert.ts` gắn nó vào `Alert` trên bản web; `tools/web-alert.mjs`
 * biên dịch và CHẠY chính tệp này với một `window` giả.
 *
 * ── vì sao ──
 *
 * react-native-web cài `Alert.alert` là một hàm RỖNG (`static alert() {}`).
 * App gọi nó ở 57 chỗ, và trên web cả 57 im lặng: xoá một bài, rời một thử
 * thách, sửa một số Apple Health — bấm xong không có gì xảy ra, không có câu
 * nào nói vì sao. Đo được ở #71: đổi nhịp tim ở `/log-biometrics` thì nút Lưu
 * trên web ra 0 toast, 0 lệnh ghi.
 *
 * ── theo số nút, như iOS vẽ ──
 *
 *   không nút / một nút   `alert()` — hộp báo tin, rồi chạy nút ấy (nếu có).
 *   một việc + Huỷ        `confirm()` — Đồng ý chạy việc ấy, Huỷ chạy nút Huỷ.
 *   nhiều việc            `prompt()` với danh sách đánh số; gõ số nào chạy việc
 *                         ấy, bỏ trống hay gõ sai là Huỷ. Menu báo cáo, chọn
 *                         bữa, menu bài viết là kiểu này.
 *
 * Nút Huỷ là nút `style: 'cancel'` — mọi hộp 1–2 nút trong app đều đặt nó
 * (đã đếm khi viết). Đóng hộp thoại mà không chọn thì cũng là Huỷ, đúng như
 * iOS khi `cancelable`. Bộ chạy web (Playwright) tự đóng mọi hộp thoại không
 * ai trả lời, nên mặc định của mọi vế cũ vẫn là Huỷ — không vế nào tự nhiên
 * xoá thứ gì.
 */

export interface DialogButton {
  text?: string;
  /* Gọi KHÔNG tham số: `never[]` nhận mọi dạng `onPress` của `AlertButton`,
     kể cả dạng nhận `{ login, password }` của hộp nhập trên iOS. */
  onPress?: (...args: never[]) => unknown;
  style?: 'default' | 'cancel' | 'destructive';
}

export interface DialogWindow {
  alert(message?: string): void;
  confirm(message?: string): boolean;
  prompt(message?: string, defaultValue?: string): string | null;
}

export function browserAlert(
  win: DialogWindow,
  title: string,
  message?: string,
  buttons?: DialogButton[],
): void {
  const text = [title, message].filter((s) => s && s.trim()).join('\n\n');
  const list = buttons ?? [];
  const cancel = list.find((b) => b.style === 'cancel');
  const actions = list.filter((b) => b !== cancel);

  if (list.length <= 1) {
    win.alert(text);
    list[0]?.onPress?.();
    return;
  }
  if (actions.length === 1) {
    /* Tên việc đi kèm câu hỏi: hộp `confirm` của trình duyệt chỉ có "OK" và
       "Huỷ", nên "OK" phải được nói ra là làm gì. */
    if (win.confirm(`${text}\n\n→ ${actions[0].text ?? ''}`.trim())) actions[0].onPress?.();
    else cancel?.onPress?.();
    return;
  }
  const menu = actions.map((b, i) => `${i + 1}. ${b.text ?? ''}`).join('\n');
  const picked = win.prompt(`${text}\n\n${menu}`.trim(), '');
  const i = picked == null ? -1 : Number(picked.trim()) - 1;
  if (Number.isInteger(i) && i >= 0 && i < actions.length) actions[i].onPress?.();
  else cancel?.onPress?.();
}
