import * as Haptics from 'expo-haptics';

/**
 * Mặt haptic duy nhất của app — mọi chỗ gọi haptics đi qua đây, không gọi
 * thẳng `expo-haptics`.
 *
 * Vì sao cần một lớp gom khi expo-haptics đã là native: 103 file đang gọi rời
 * rạc, mỗi nơi tự lo lỗi (có chỗ `.catch`, có chỗ không — unhandled rejection
 * trên máy không hỗ trợ haptics). Gom lại thì:
 *  - tên gọi theo ngữ nghĩa (`success()` thay vì nhớ enum nào),
 *  - lỗi được nuốt một chỗ,
 *  - sau này muốn thêm công tắc "giảm haptics" hay thay backend Swift thì chỉ
 *    sửa một file.
 *
 * Tất cả đều fire-and-forget: haptics không bao giờ được chặn UI.
 */
function fire(work: Promise<void>): void {
  work.catch(() => {
    // Máy không hỗ trợ haptics (giả lập cũ…) — lặng lẽ bỏ qua.
  });
}

export const haptics = {
  /** Chạm nhẹ: chọn, bật/tắt, điều chỉnh nhỏ. */
  light(): void {
    fire(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
  },
  /** Chạm vừa: xác nhận một bước, chuyển trạng thái. */
  medium(): void {
    fire(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
  },
  /** Chạm mạnh: cảnh báo, hành động quan trọng. */
  heavy(): void {
    fire(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy));
  },
  /** Lướt chọn: segmented, picker, cuộn qua nấc. */
  selection(): void {
    fire(Haptics.selectionAsync());
  },
  /** Thành công: ghi xong, hoàn thành set/bài. */
  success(): void {
    fire(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
  },
  /** Cảnh báo nhẹ: sắp hết giờ nghỉ, thao tác cần chú ý. */
  warning(): void {
    fire(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
  },
  /** Lỗi: thao tác thất bại. */
  error(): void {
    fire(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
  },
};
