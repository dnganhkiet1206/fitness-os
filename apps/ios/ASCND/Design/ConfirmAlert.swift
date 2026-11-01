import SwiftUI
import UIKit

/// Hộp xác nhận bằng `UIAlertController`, hiện từ màn trên cùng.
///
/// 16/10 (chủ dự án: "vẫn không đăng xuất được"): trong Cài đặt — một sheet mở
/// chồng trên sheet Hồ sơ — `.alert` của SwiftUI hiện ra và đóng lại bình thường
/// nhưng KHÔNG gọi hành động của nút (log: chạm hàng có, chạm nút trong hộp
/// không). Hộp UIKit gọi thẳng closure, không qua cây view.
///
/// 31/10: cùng lỗi ở Cộng đồng — bài mở trong sheet chồng trên sheet Hồ sơ, "Tắt
/// bình luận" đóng hộp mà không gọi server (trên feed thì chạy). Thêm nữa, trong
/// sheet chồng sheet view chỉ vẽ lại khi có chạm: state đổi từ tác vụ nền (kết quả
/// server) hay từ nút của hộp UIKit không làm `.alert` / `onChange` chạy. Nên Cộng
/// đồng mở MỌI hộp thẳng bằng hàm ở đây (`choose`, `ok`), không qua state.
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

  /// Hộp nhiều nút; hành động của nút có thể mở hộp kế tiếp.
  static func choose(title: String?, message: String? = nil, choices: [AlertChoice]) {
    let alert = UIAlertController(title: title, message: message, preferredStyle: .alert)
    for c in choices {
      let style: UIAlertAction.Style = c.role == .cancel ? .cancel : c.role == .destructive ? .destructive : .default
      alert.addAction(UIAlertAction(title: c.title, style: style) { _ in
        MainActor.assumeIsolated { c.run() }
      })
    }
    show(alert)
  }

  /// Hộp mở từ nút của hộp trước (Xoá → xác nhận): hộp trước còn đang đóng thì UIKit
  /// lặng lẽ bỏ qua `present` — chờ nó đóng xong (tối đa ~1 giây) rồi mới mở.
  private static func show(_ alert: UIAlertController, tries: Int = 0) {
    guard let top = topMost() else { return }
    if top.presentedViewController != nil, tries < 10 {
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
        MainActor.assumeIsolated { show(alert, tries: tries + 1) }
      }
      return
    }
    top.present(alert, animated: true)
  }

  /// Hộp báo, chỉ có OK.
  static func ok(_ title: String, message: String? = nil) {
    choose(title: title, message: message, choices: [AlertChoice(title: String(localized: "common.ok"), role: .cancel)])
  }

  static func topMost() -> UIViewController? {
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    let window = scenes.flatMap(\.windows).first { $0.isKeyWindow } ?? scenes.first?.windows.first
    var top = window?.rootViewController
    while let next = top?.presentedViewController, !next.isBeingDismissed { top = next }
    return top
  }
}

/// Một nút của `ConfirmAlert.choose`.
struct AlertChoice {
  let title: String
  var role: ButtonRole?
  var run: @MainActor () -> Void = {}

  static func cancel() -> AlertChoice { AlertChoice(title: String(localized: "common.cancel"), role: .cancel) }
}
