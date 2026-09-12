import { useSyncExternalStore } from 'react';

import { failureKeyFor } from '@/lib/error-copy';

/**
 * Lightweight global toast store (module-level, same pattern as the
 * steps-goal store). One toast at a time; a new one replaces the
 * current. The NeonToastHost in the root layout renders it.
 */

export type ToastKind = 'success' | 'error' | 'warning' | 'info';

export interface ToastData {
  id: number;
  kind: ToastKind;
  message: string;
  /**
   * An i18n key to show INSTEAD of `message`, set by `toast.fail` when the
   * thrown thing was written by PostgreSQL or GoTrue rather than by this app.
   *
   * The key rather than the sentence, because this store is module-level and
   * the language lives in React context — `NeonToastHost` resolves it. Same
   * split as `readiness-i18n.ts`, and the reason switching language mid-session
   * re-words a toast that is still on screen.
   */
  failureKey?: string;
  /**
   * Một việc người dùng có thể làm từ chính thanh toast — hiện chỉ có Hoàn tác.
   *
   * Tách khỏi `message` chứ không nhét vào chữ, vì nó phải là một NÚT: người
   * dùng VoiceOver cần một phần tử để vuốt tới và kích hoạt, và một câu chữ
   * thì không cho họ thứ đó. Xem `neon-toast.tsx` — thanh có nút thì đổi cả
   * cách tự tắt, không chỉ đổi cách vẽ.
   */
  action?: ToastAction;
}

export interface ToastAction {
  /** chữ trên nút, đã dịch sẵn — kho này không có ngôn ngữ trong tay */
  label: string;
  /** chạy khi bấm. Thanh tự đóng sau đó, nên hàm này không phải tự đóng. */
  run: () => void;
}

let current: ToastData | null = null;
let seq = 0;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function showToast(kind: ToastKind, message: string, failureKey?: string, action?: ToastAction) {
  current = { id: ++seq, kind, message, failureKey, action };
  emit();
}

/** sonner-style helpers, mirroring the web's toast.success(...) calls */
export const toast = {
  success: (message: string) => showToast('success', message),
  error: (message: string) => showToast('error', message),
  warning: (message: string) => showToast('warning', message),
  info: (message: string) => showToast('info', message),
  /**
   * A thrown error, shown as a sentence rather than as SQL.
   *
   * Every `onError` uses this instead of `toast.fail(e)`, which put
   * *duplicate key value violates unique constraint "daily_logs_user_id_date_key"*
   * in front of somebody who had tapped Save twice. `failureKeyFor` returns
   * `null` for an error the app wrote itself — those are already sentences for
   * a person and are shown unchanged.
   */
  fail: (err: unknown) => {
    const key = failureKeyFor(err);
    const raw = err instanceof Error ? err.message : String(err ?? '');
    showToast('error', key ? '' : raw, key ?? undefined);
  },
  /**
   * "Đã xoá" kèm một nút lấy lại.
   *
   * `success` chứ không phải `info`: việc người dùng yêu cầu ĐÃ xảy ra thật —
   * dòng đã bị xoá trên server trước khi thanh này hiện ra. Nút chỉ là đường
   * về, không phải một cái hẹn giờ đang đếm ngược một việc chưa làm. Hoãn lệnh
   * xoá lại vài giây để "hoàn tác cho rẻ" là cách app bị đóng giữa chừng rồi
   * dòng ấy không bao giờ bị xoá, trong khi màn hình đã nói là xong.
   */
  undo: (message: string, label: string, run: () => void) =>
    showToast('success', message, undefined, { label, run }),
};

/** Dismiss the current toast; pass an id to only dismiss that instance
 *  (so a stale auto-hide timer can't kill a newer toast). */
export function dismissToast(id?: number) {
  if (id != null && current?.id !== id) return;
  current = null;
  emit();
}

/** Thanh KHÔNG có nút: đủ lâu để đọc. */
export const AUTO_HIDE_MS = 3000;

/**
 * Thanh CÓ NÚT ở lại lâu hơn — và với trình đọc màn hình thì không tự tắt.
 *
 * ── vế trình đọc màn hình là bắt buộc, không phải chiều lòng ──
 *
 * `neon-toast.tsx` đã ghi sẵn phép đo ngay cạnh lời gọi
 * `announceForAccessibility` của nó: thanh này *"tự gỡ sau `AUTO_HIDE_MS`,
 * ngắn hơn thời gian vuốt tới nó"*, nên thông điệp phải được ĐẨY ra chứ không
 * để người ta tự tìm.
 *
 * Một câu chữ thì đẩy được. Một cái NÚT thì không. Gắn Hoàn tác vào một thanh
 * biến mất trước khi vuốt tới được là thêm một điều khiển mà người khiếm thị
 * không bao giờ bấm được — và chính phép đo ấy đã chứng minh điều đó từ trước.
 *
 * Nên khi có nút và trình đọc màn hình đang bật: KHÔNG hẹn giờ. Đúng cách
 * Material làm — SnackBar có action không hết giờ khi TalkBack/VoiceOver bật,
 * và hướng dẫn của họ là tránh đặt thời lượng cho loại có action. Nó cũng là
 * phía đúng của WCAG 2.2.1 (Timing Adjustable), thứ mà một thanh tự tắt vốn
 * là một giới hạn thời gian và không lọt vào ngoại lệ nào.
 *
 * ── còn 8 giây là một LỰA CHỌN, và nói thẳng ra thế ──
 *
 * Không nguồn nào cho một con số cho trường hợp này: Material bảo đừng đặt
 * thời lượng, iOS không có thành phần tương đương. 8 giây là ước lượng của
 * "đọc một câu ngắn, nhận ra mình vừa xoá nhầm, đưa ngón tay lên" cộng biên —
 * gấp hơn hai lần 3 giây của thanh không nút, vì thanh không nút chỉ cần được
 * ĐỌC còn thanh này cần được BẤM. Nếu ai đo được số tốt hơn thì thay.
 */
export const ACTION_HIDE_MS = 8000;

/**
 * Thanh này sống bao lâu — `null` nghĩa là KHÔNG tự tắt.
 *
 * Tách ra khỏi `neon-toast.tsx` để `tools/undo-safe.mjs` CHẠY được nó trên cả
 * bốn tổ hợp, thay vì dò xem có một câu `if` trông đúng hay không. Repo này đã
 * dính hai lần cái bẫy "luật kiểm một khai báo chứ không kiểm dây nối".
 *
 * Luật, một câu: một cái NÚT mà người dùng trình đọc màn hình không với tới
 * được thì không phải một tính năng. `neon-toast.tsx` đã tự đo và ghi lại rằng
 * thanh này *"tự gỡ sau AUTO_HIDE_MS, ngắn hơn thời gian vuốt tới nó"* — câu
 * chữ thì đẩy ra được bằng `announceForAccessibility`, cái nút thì không.
 *
 * Cùng cách Material làm (SnackBar có action không hết giờ khi TalkBack/
 * VoiceOver bật) và là phía đúng của WCAG 2.2.1.
 */
export function toastHideMs(hasAction: boolean, screenReader: boolean): number | null {
  if (!hasAction) return AUTO_HIDE_MS;
  return screenReader ? null : ACTION_HIDE_MS;
}

export function useCurrentToast(): ToastData | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
    () => current,
  );
}
