/**
 * Lớp của một thao tác ghi khi mất mạng — `docs/OFFLINE-POLICY.md` (#161).
 *
 * Mỗi thao tác tự khai lớp NGAY nơi định nghĩa, qua `meta.offline` của
 * React Query, để thao tác thứ 101 cũng phải trả lời sáu câu hỏi của tài
 * liệu. `tools/offline-class.mjs` đỏ khi một thao tác chưa khai.
 *
 * - `record`: xếp hàng bền (`lib/offline-write.ts`), gửi khi có mạng (câu 4);
 * - `now`: từ chối ngay khi mất mạng (`useOnlineMutation`), kèm SỐ của câu hỏi
 *   đã quyết nó: 1 tiền/tài nguyên/tài khoản, 2 người khác thấy, 3 xoá hoặc
 *   sửa thứ đã có, 6 không câu nào đúng;
 * - lớp `state` không đi qua đây: nó là `setState` của `lib/state-write.ts`,
 *   nơi khoá gộp và giá trị tuyệt đối là tham số BẮT BUỘC.
 */
export type OfflineClass = { class: 'record' } | { class: 'now'; because: 1 | 2 | 3 | 6 };

export const RECORD = { class: 'record' } as const satisfies OfflineClass;
export const now = (because: 1 | 2 | 3 | 6) => ({ class: 'now', because }) as const satisfies OfflineClass;

declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: { offline?: OfflineClass };
  }
}
