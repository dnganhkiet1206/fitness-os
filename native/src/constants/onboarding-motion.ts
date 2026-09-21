import { Easing } from 'react-native-reanimated';

import { duration } from '@/constants/motion';

/**
 * Ngôn ngữ chuyển cảnh của onboarding — hai con số, một nguồn.
 *
 * ── vì sao nó là một TỆP chứ không phải vài dòng trong màn ──
 *
 * Giai đoạn 4 bản đầu để phép chọn chuyển cảnh nằm ngay trong `onboarding-flow`,
 * và audit runtime tìm ra đúng thứ cách ấy sinh ra: màn 13 tự dựng khung của nó
 * nên **không có chuyển cảnh nào** (đo được `(đứng yên)` ở cả bảy mốc từ 40ms
 * tới 900ms), còn cây thước thì mang hiệu ứng vào riêng và tự dâng 25 điểm đúng
 * ở cặp màn nó phải đứng yên. Hai lỗi cùng một gốc: không chỗ nào SỞ HỮU câu
 * hỏi *"hai màn này đi qua nhau thế nào"*, nên mỗi chỗ tự trả lời lấy.
 */

/**
 * Màn ra đi bao xa so với màn vào.
 *
 * 0,3 — tỉ lệ của chính iOS. Trong một cú push, màn cũ KHÔNG đứng yên và cũng
 * không đi hết bề ngang: nó lùi khoảng một phần ba rồi bị màn mới che lại. Cái
 * chênh lệch tốc độ ấy là toàn bộ thứ nói cho mắt biết hai màn nằm trên CÙNG
 * MỘT dải, chứ không phải là hai tấm ảnh thay nhau.
 *
 * Audit lượt trước đo ở `t=40ms` chỉ có MỘT tấm mang transform — màn cũ biến
 * mất tức thì. Đó đúng chế độ hỏng mà đặt hàng gọi tên: *"màn A biến mất rồi
 * màn B xuất hiện"*.
 */
export const PARALLAX = 0.3;

/**
 * Một nhịp, một easing, cho MỌI chuyển cảnh của luồng.
 *
 * `duration.swap` vì thang nhịp của repo định nghĩa `swap` là "một bề mặt đổi
 * nội dung của nó sang nội dung khác" — đúng việc đang làm, và không sinh thêm
 * một con số thứ năm cho `tools/motion.mjs` phải học.
 *
 * Easing là giảm tốc, KHÔNG vượt quá đích. Đặt hàng nói rõ "không bounce,
 * không overshoot", nên đây không phải lò xo — một lò xo dù `smooth` vẫn là mô
 * hình có khối lượng, và mô hình ấy đúng cho thứ người dùng vừa BUÔNG, không
 * đúng cho một cú chuyển do hệ thống điều khiển.
 *
 * ── `out(cubic)` chứ không phải bezier(0,16 · 1 · 0,3 · 1) ──
 *
 * Bản đầu dùng đường bezier ấy — tài liệu chuyển động của kho skill gợi ý nó
 * cho "một cú đến tự tin". Dựng ra rồi đo thì nó quá vội cho quãng này:
 *
 *     t = 40ms (12,5% nhịp)   tx 402 → 112…168   tức đã đi 60–72% quãng
 *
 * Bảy phần mười quãng đường trong một phần tám thời gian không đọc ra là một cú
 * trượt, nó đọc ra là một cú nhảy rồi bò nốt. Đặt hàng viết rõ: *"nhanh và nhẹ,
 * nhưng không được vội"*.
 *
 * `out(cubic)` ở cùng mốc ấy đi 1 − (1 − 0,125)³ = 33%, và vẫn hạ cánh gọn
 * trong 320ms. Cùng họ giảm tốc, không vượt đích, chỉ thôi dồn hết vào đầu.
 */
export const TIMING = {
  duration: duration.swap,
  easing: Easing.out(Easing.cubic),
} as const;
