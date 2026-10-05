import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Màn nào theo phiên (#273, polish #302): đang đọc phiên → chờ; chưa đăng
/// nhập → đăng nhập; đã đăng nhập → app. Đọc phiên hỏng là "chưa đăng nhập",
/// không kẹt ở màn chờ (`SessionStore.start`, như `use-auth.tsx`).
///
/// Polish #302:
/// - transition mượt giữa các phase (opacity, tôn trọng Reduce Motion);
/// - không flash sai màn khi loading (dùng DSLoadingView);
/// - đổi tài khoản dựng lại cả cây (`.id(userId)`) — không state cũ sống sót.
struct RootGate: View {
  @Environment(AppServices.self) private var services
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    Group {
      switch services.session.phase {
      case .loading:
        DSLoadingView(message: String(localized: "rootgate.loading"))
          .transition(.opacity)
      case .signedOut:
        AuthView()
          .transition(.opacity)
      case .signedIn(let s):
        RootTabView()
          .id(s.userId)
          .transition(.opacity)
      }
    }
    .animation(
      reduceMotion ? nil : .easeInOut(duration: 0.25),
      value: phaseKey
    )
  }

  /// Key để SwiftUI biết khi nào phase đổi → chạy transition.
  private var phaseKey: String {
    switch services.session.phase {
    case .loading: "loading"
    case .signedOut: "signedOut"
    case .signedIn(let s): "signedIn:\(s.userId)"
    }
  }
}

// MARK: - Preview

#Preview("RootGate — loading") {
  RootGate()
    .environment(AppServices())
}

#Preview("RootGate — Reduce Motion") {
  RootGate()
    .environment(AppServices())
    .environment(\.accessibilityReduceMotion, true)
}
