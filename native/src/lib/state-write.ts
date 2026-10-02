import { onlineManager, type QueryKey } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';

import { classifyError } from '@/lib/error-copy';
import { queryClient } from '@/lib/query-client';
import { createStateWriter, type SendResult } from '@/lib/state-write-core';
import { toast } from '@/lib/toast';
import { onUserScopedReset } from '@/lib/user-scoped-reset';

export type { SendResult };

/**
 * Lớp Trạng thái của `docs/OFFLINE-POLICY.md`, nối vào app (#161). Luật nằm ở
 * `state-write-core.ts`; ở đây chỉ có: mạng từ `onlineManager` (cùng nguồn
 * với mọi thao tác ghi khác), đọc lại server bằng React Query khi một khoá
 * xong, và câu báo.
 */

/** key → the query to refresh when that key settles */
const refresh = new Map<string, QueryKey[]>();

const writer = createStateWriter({
  online: () => onlineManager.isOnline(),
  isOffline: (e) => classifyError(e) === 'offline',
  onSettled: (key) => {
    for (const qk of refresh.get(key) ?? []) void queryClient.invalidateQueries({ queryKey: qk });
    refresh.delete(key);
  },
  onGone: () => toast.keyed('warning', 'stateGone'),
  onError: (_key, e) => toast.fail(e),
});

onlineManager.subscribe((online) => {
  if (online) writer.flush();
});
onUserScopedReset(() => writer.clear());

/**
 * Đặt một giá trị TUYỆT ĐỐI cho (thực thể, trường). `server` là giá trị đang
 * đọc được từ server; trùng thì không gửi gì. `send` nhận giá trị cần đặt,
 * trả `'gone'` khi thực thể không còn.
 */
export function setState<V>(intent: {
  key: string;
  value: V;
  server: V;
  send: (value: V) => Promise<SendResult>;
  /** Truy vấn cần đọc lại khi khoá này xong. */
  refresh: QueryKey[];
}): void {
  const prev = refresh.get(intent.key) ?? [];
  refresh.set(intent.key, [...prev, ...intent.refresh.filter((q) => !prev.some((p) => JSON.stringify(p) === JSON.stringify(q)))]);
  const was = writer.size();
  const r = writer.set(intent);
  /* Nói MỘT lần mỗi đợt mất mạng, lúc ý chờ đầu tiên xuất hiện — không phải
     mỗi cú tick. Và nói trước điều sẽ mất. */
  if (r === 'queued' && !onlineManager.isOnline() && was === 0) toast.keyed('info', 'stateQueued');
}

/**
 * Cho một DANH SÁCH: đọc ý chờ của từng mục trong lúc render (hook không gọi
 * được trong vòng lặp), và dựng lại khi bất kỳ ý chờ nào đổi.
 */
export function useStateOverlay(): <V>(key: string) => { value: V } | undefined {
  /*
    Hàm đọc phải là hàm MỚI mỗi lần render, để danh sách dựng từ nó tính lại
    khi một ý chờ đổi. React Compiler tự tính phụ thuộc từ thứ hàm ĐỌC — arrow
    này không đọc `version`, nên nó bỏ cả `useMemo(…, [version])` lẫn phụ thuộc
    tay và kéo hàm ra phạm vi module. Đo trên bộ chạy (#161): tick khi mất
    mạng, câu báo hiện, kho có ý chờ, mà ô đứng yên. Nên hook này ra khỏi
    Compiler, đúng một hook, bằng chỉ thị React đặt cho việc ấy.
  */
  'use no memo';
  useSyncExternalStore(writer.subscribe, writer.version, writer.version);
  return (key: string) => writer.pending(key) as never;
}
