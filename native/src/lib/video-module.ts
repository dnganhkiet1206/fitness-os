import { Platform } from 'react-native';

/**
 * Binary NÀY có phần native của `expo-video` không?
 *
 * ── vì sao câu hỏi này phải được hỏi TRƯỚC ──
 *
 * `expo-video/build/NativeVideoModule.js` gọi `requireNativeModule('ExpoVideo')`
 * ở PHẠM VI MODULE, và hàm ấy NÉM khi không tìm thấy. Nên chỉ cần chạm vào gói
 * là đã quá muộn — và một `try/catch` quanh `require` không cứu được, vì Metro
 * bọc lượt require ngoài cùng bằng guard của chính nó:
 *
 *     152  if (!inGuard && global.ErrorUtils) {
 *     156      returnValue = loadModuleImplementation(...);
 *     157    } catch (e) {
 *     158      global.ErrorUtils.reportFatalError(e);   ← báo FATAL, KHÔNG ném lại
 *
 * Lỗi không bao giờ tới `catch` của mình; app dựng màn đỏ. Đã xảy ra hai lượt
 * trên máy chủ dự án, lần gần nhất ngay khi bấm nút toàn màn ở một bài CHỈ CÓ
 * ẢNH (`media-viewer.tsx:151` gọi `videoGate()` vô điều kiện).
 *
 * `requireOptionalNativeModule` hỏi ĐÚNG câu ấy mà TRẢ VỀ `null` thay vì ném —
 * xem `expo-modules-core/src/requireNativeModule.ts`. Nó không nạp `expo-video`,
 * chỉ tra sổ đăng ký native. Nên hỏi nó trước là cách duy nhất biết được câu
 * trả lời mà không phải trả giá bằng cả app.
 *
 * `expo-modules-core` đã nằm sẵn trong bộ nhớ từ lúc khởi động (chính `expo`
 * nạp nó), nên `require` ở đây chỉ lấy bản đã cache — không có lượt nạp mới
 * nào để mà bị guard.
 *
 * ── vì sao WEB trả `true` ──
 *
 * Trên web không có sổ đăng ký native nào để tra, và `expo-video` có bản web
 * của riêng nó (`NativeVideoModule.web.js`, `VideoView.web.js`) nên nó không
 * hỏi registry. Trả `false` ở đây sẽ tắt video trên web vì một lý do chỉ đúng
 * trên máy thật.
 */
export function hasVideoModule(): boolean {
  if (Platform.OS === 'web') return true;
  try {
    const core = require('expo-modules-core') as typeof import('expo-modules-core');
    return core.requireOptionalNativeModule('ExpoVideo') !== null;
  } catch {
    /* Ngay cả câu hỏi cũng hỏi không được thì câu trả lời là không. */
    return false;
  }
}
