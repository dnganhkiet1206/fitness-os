import { useSyncExternalStore } from 'react';

/**
 * "Tay người dùng đang chạm vào một thứ gì đó."
 *
 * ── vì sao cần ──
 *
 * `tools/frame-churn.mjs` đo Dashboard trong lúc vuốt deck: 73 lượt sửa mỗi
 * khung hình, trong đó **89%** là mascot (một svg 54×68 với 26 nhóm `<g>`, thở
 * và đung đưa mãi mãi), còn chính cú vuốt — deck, chữ, bố cục — chỉ được
 * **10%**. Cú vuốt của người dùng chạy trên một phần mười ngân sách khung
 * hình; chín phần mười thuộc về một hoạt ảnh trang trí.
 *
 * Trên web thì không lộ (`<g>` chỉ là node DOM, đổi `transform` gần như miễn
 * phí, nên `khung dài = 0`). Trên iOS mỗi nhóm là một lớp Core Animation và
 * cập nhật là VẼ LẠI. Cái đo được và đáng tin ở đây là TỈ LỆ, không phải giá.
 *
 * ── vì sao không phải "dừng khi khuất tầm nhìn" ──
 *
 * Đó là phương án tôi đề xuất trước và nó VÔ DỤNG cho triệu chứng này: mascot
 * nằm ở y≈544 trên màn cao 874, tức nó đang hiện ngay lúc vuốt. Dừng-khi-khuất
 * không chạm tới đúng khoảnh khắc đang giật.
 *
 * ── vì sao là store ngoài React, không phải context ──
 *
 * Bài học từ `AnimatedNumber`: bản trước gắn một cờ vào state React, và mỗi
 * lần cờ đổi thì mọi con số phải dựng lại — đổi một cú giật lấy một cú giật
 * khác. Ở đây chỉ đúng thứ ĐỌC cờ mới dựng lại, và hiện chỉ có mascot đọc. Bắt
 * đầu và kết thúc một cú chạm không được phép làm cả cây dựng lại.
 *
 * ── đếm, không phải cờ ──
 *
 * Nhiều nguồn cùng báo bận: vuốt deck, và một ô nhập đang được gõ. Một cờ
 * boolean thì nguồn kết thúc trước sẽ tắt nhầm cho nguồn còn đang chạy. Đếm
 * thì chỉ về 0 khi nguồn cuối cùng buông.
 */
let depth = 0;
let handle: ReturnType<typeof setTimeout> | null = null;
const subs = new Set<() => void>();

function emit() {
  for (const s of subs) s();
}

/** Một nguồn bắt đầu chạm. PHẢI có đúng một `endInteraction` đi kèm. */
export function beginInteraction(): void {
  if (handle) {
    clearTimeout(handle);
    handle = null;
  }
  depth += 1;
  if (depth === 1) emit();
}

/**
 * Nguồn ấy buông.
 *
 * `linger` để giữ yên thêm một quãng sau khi ngón tay nhấc: cú vuốt còn một lò
 * xo snap chạy tiếp ~300ms sau khi buông, và cho mascot sống lại đúng giữa lò
 * xo ấy là trả lại cú giật ở nửa sau chuyển động.
 */
export function endInteraction(linger = 0): void {
  depth = Math.max(0, depth - 1);
  if (depth !== 0) return;
  if (!linger) return emit();
  if (handle) clearTimeout(handle);
  handle = setTimeout(() => {
    handle = null;
    if (depth === 0) emit();
  }, linger);
}

function subscribe(fn: () => void) {
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
}

/* `handle` khác null nghĩa là đang trong quãng giữ yên, nên vẫn tính là bận. */
const snapshot = () => depth > 0 || handle !== null;

/** Đọc trạng thái. Chỉ component gọi hàm này mới dựng lại khi nó đổi. */
export function useInteracting(): boolean {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
