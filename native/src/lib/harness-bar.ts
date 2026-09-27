import { useSyncExternalStore } from 'react';

/**
 * Chiều cao thanh tab của BỘ ĐO web (`app-tabs.web.tsx`), cho lớp Koa (#152).
 *
 * Koa được dựng ở layout gốc, phủ cả cửa sổ, và chừa `BottomTabInset` — con
 * số của thanh tab iOS, bằng 0 trên web. Thanh tab của bộ đo nằm trong dòng
 * chảy ở đáy (#147), nên Koa đậu đúng vào dải của nó và lượt bấm thử không
 * chạm được Koa ở bốn màn (#147 ghi chúng là "bị thanh tab của bộ đo che").
 * Thanh ấy báo chiều cao THẬT của nó ở đây khi dựng xong; Koa cộng thêm. Trên
 * iOS không ai gọi `setHarnessBarHeight`, nên con số là 0 và không gì đổi.
 *
 * Không đổi `BottomTabInset` cho web thay vì thế: đã thử (thanh nổi tuyệt đối,
 * cao 72 như UIKit) — thanh tab của bộ đo có trên MỌI màn, kể cả màn đẩy vào
 * stack mà iOS ẩn thanh tab, và nó đè nút đáy của Kế hoạch ngày (ba kịch bản đỏ).
 */
let height = 0;
const subs = new Set<() => void>();

export function setHarnessBarHeight(h: number): void {
  const next = Math.max(0, Math.round(h));
  if (next === height) return;
  height = next;
  subs.forEach((f) => f());
}

export function useHarnessBarHeight(): number {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => height,
    () => 0,
  );
}
