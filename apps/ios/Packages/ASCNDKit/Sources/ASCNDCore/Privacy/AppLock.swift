public import Foundation

/// Khoá app bằng Face ID (#527 mục 7, Kiệt duyệt mock v2 01/11).
///
/// RN behavior: `use-app-lock.tsx` — bật được khi máy có Face ID / Touch ID đã cài;
///   mở app là khoá; rời app quá 20 giây thì khoá lại; mật mã máy dự phòng.
/// Native behavior: người dùng chọn lúc khoá lại — ngay (mặc định), sau 1 phút, sau
///   5 phút. Ngay = như khoá app có sẵn của iOS 18 (hỏi mỗi lần mở).
/// Reason: app không đọc được cài đặt khoá của máy (không có API) — Kiệt 01/11: "nếu
///   không theo điện thoại được thì cho người dùng chọn".
public enum AppLock {
  public enum Relock: String, Sendable, Hashable, CaseIterable {
    case immediately, oneMinute, fiveMinutes

    public var seconds: TimeInterval {
      switch self {
      case .immediately: 0
      case .oneMinute: 60
      case .fiveMinutes: 300
      }
    }
  }

  /// Quay lại app sau `away` giây có phải mở khoá lại không. Vừa vào nền chưa đầy một
  /// giây (kéo Trung tâm điều khiển, hộp hệ thống như chính Face ID) thì không, kể cả
  /// "Ngay" — không thì hộp Face ID tự gây khoá lại vòng tròn.
  public static func needsUnlock(away: TimeInterval, relock: Relock) -> Bool {
    away >= max(1, relock.seconds)
  }
}
