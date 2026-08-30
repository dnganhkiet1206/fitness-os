import { useSyncExternalStore } from 'react';

import { netStatus, subscribeNetStatus, type NetStatus } from '@/lib/net-status';

/**
 * Trạng thái mạng ba nhánh: `online` | `offline` | `reconnecting`.
 *
 * ── cái đã bị xoá khỏi tệp này, và vì sao ──
 *
 * Ở đây từng có `useOnlineStatus()`, đọc `onlineManager` của React Query và trả
 * về một boolean. Sau khi dải báo chuyển sang ba trạng thái thì nó không còn
 * chỗ gọi nào, và `tools/linked.mjs` bắt đúng điều đó.
 *
 * Giữ lại "phòng khi cần" là cách app có HAI câu trả lời cho câu hỏi "có mạng
 * không" — một cái ba nhánh và một cái hai nhánh, đọc từ hai kho khác nhau. Đó
 * đúng là hình dạng của lỗi vừa sửa: `isConnected` và `isInternetReachable` là
 * hai dữ kiện, và app trả lời sai vì nó chỉ đọc một. Hai hàm trả lời cùng một
 * câu hỏi rồi sẽ bất đồng, và bất đồng ở đây nghĩa là dải báo nói một đằng còn
 * `offlineNow()` cho phép một nẻo.
 *
 * ── vì sao `useSyncExternalStore` ──
 *
 * Kho này sống ngoài React và đổi được GIỮA lúc render. Cặp `useState` +
 * `useEffect` đọc giá trị một lần lúc khởi tạo rồi mới đăng ký trong effect,
 * nên một thay đổi rơi đúng khe giữa hai việc đó sẽ không bao giờ tới nơi — và
 * khe ấy rộng nhất đúng lúc app vừa mở, tức đúng lúc trạng thái mạng hay đổi
 * nhất.
 */
export function useNetStatus(): NetStatus {
  return useSyncExternalStore(subscribeNetStatus, netStatus, netStatus);
}
