import { createContext, useContext, type ReactNode } from 'react';

import { usePalette } from '@/hooks/use-palette';

/**
 * Màn này có một lớp sáng phía sau nội dung không.
 *
 * ── vì sao câu hỏi ấy phải đi qua context ──
 *
 * `mutedForeground` được đo trên MỘT MẶT PHẲNG TỐI VÀ ĐỨNG YÊN — chú thích của
 * chính nó nói thế. Khi trang có wash, mặt sau thẻ không còn đứng yên và không
 * còn cùng độ sáng, và cùng con số ấy tụt xuống dưới sàn:
 *
 *     `mutedForeground` #828282 trên kính primary phủ wash   4,37:1  ✗
 *     `glassMuted`      #c8ccd4 ở đúng chỗ ấy               10,44:1  ✓
 *
 * Nhưng KHÔNG được dùng `glassMuted` ở mọi nơi: trên một thẻ phẳng không wash
 * nó quá gần `foreground` và thôi đọc ra là hạng hai — chú thích của token ghi
 * đúng điều đó, và đó là lý do hai token cùng tồn tại.
 *
 * Nên đây là câu hỏi về BỐI CẢNH, không phải về component. `MetricPill` không
 * thể tự biết màn nào đang bọc nó; `Screen` thì biết, vì chính nó dựng lớp
 * sáng ấy. Context là đường ngắn nhất từ chỗ biết tới chỗ cần.
 *
 * ── và nó KHÔNG đổi hình dạng cây ──
 *
 * Provider luôn được dựng, chỉ đổi `value`. Component đọc nó đổi MÀU chứ không
 * dựng-hoặc-không, nên `tools/theme-shape.mjs` không có gì để bắt.
 */
const WashContext = createContext(false);

export function WashProvider({ washed, children }: { washed: boolean; children: ReactNode }) {
  return <WashContext.Provider value={washed}>{children}</WashContext.Provider>;
}

/** Có wash phía sau không — dùng khi cần tự quyết, phần lớn chỗ dùng `useMuted`. */
export function useWashed(): boolean {
  return useContext(WashContext);
}

/**
 * Màu của chữ hạng hai, đúng cho bề mặt nó đang nằm trên.
 *
 * Mọi chỗ vẽ chữ phụ nên gọi hàm này thay vì đọc thẳng `c.mutedForeground`,
 * để một màn bật lớp sáng lên không phải đi sửa mười chỗ — và quan trọng hơn,
 * để không ai QUÊN sửa chín trong mười chỗ ấy.
 */
export function useMuted(): string {
  const c = usePalette();
  return useWashed() ? c.glassMuted : c.mutedForeground;
}
