import UIKit

/// Hộp xác nhận bằng `UIAlertController`, hiện từ màn trên cùng.
///
/// 16/10 (chủ dự án: "vẫn không đăng xuất được"): trong Cài đặt — một sheet mở
/// chồng trên sheet Hồ sơ — `.alert` của SwiftUI hiện ra và đóng lại bình thường
/// nhưng KHÔNG gọi hành động của nút (log: chạm hàng có, chạm nút trong hộp
/// không). Hộp UIKit gọi thẳng closure, không qua cây view.
@MainActor
enum ConfirmAlert {
  static func present(
    title: String, message: String, confirm: String, cancel: String, destructive: Bool = true,
    action: @escaping () -> Void
  ) {
    let alert = UIAlertController(title: title, message: message, preferredStyle: .alert)
    alert.addAction(UIAlertAction(title: cancel, style: .cancel))
    alert.addAction(UIAlertAction(title: confirm, style: destructive ? .destructive : .default) { _ in MainActor.assumeIsolated { action() } })
    topMost()?.present(alert, animated: true)
  }

  static func topMost() -> UIViewController? {
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    let window = scenes.flatMap(\.windows).first { $0.isKeyWindow } ?? scenes.first?.windows.first
    var top = window?.rootViewController
    while let next = top?.presentedViewController, !next.isBeingDismissed { top = next }
    return top
  }
}
