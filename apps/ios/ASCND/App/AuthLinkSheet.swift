import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Link email auth vừa mở app (#527, deep link lát 1) — `SessionStore.authLink`.
///
/// - đang mở phiên → chờ;
/// - link đặt lại mật khẩu → `ChangePasswordView` (cùng luật / cùng lỗi có tên
///   như đổi mật khẩu ở Cài đặt): không hỏi mật khẩu cũ, vì chính link là bằng
///   chứng. "Để sau" đóng màn — phiên vẫn mở, đổi sau ở Cài đặt được;
/// - link hỏng → nói đúng lý do (hết hạn / khác máy / mất mạng / khác).
///
/// Đứng ở `RootGate`, ngoài cây theo phiên: mở phiên đổi màn bên dưới (đăng
/// nhập → app) mà màn này không bị dựng lại.
struct AuthLinkSheet: View {
  @Environment(AppServices.self) private var services
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    NavigationStack {
      content
    }
    .interactiveDismissDisabled(isVerifying)
  }

  private var isVerifying: Bool {
    if case .verifying? = services.session.authLink { return true }
    return false
  }

  @ViewBuilder private var content: some View {
    switch services.session.authLink {
    case .verifying?:
      DSLoadingView(message: String(localized: "auth.link.verifying"))
    case .recoveryReady?:
      ChangePasswordView(controller: PasswordChangeController(session: services.session))
        .safeAreaInset(edge: .top) {
          Text(String(localized: "auth.link.recovery.message"))
            .font(DS.TextStyle.footnote)
            .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, DS.Spacing.lg)
            .padding(.top, DS.Spacing.sm)
        }
        .toolbar {
          ToolbarItem(placement: .cancellationAction) {
            Button(String(localized: "auth.link.later")) { dismiss() }
          }
        }
    case .failed(let kind, let failure)?:
      DSEmptyState(
        systemImage: "link.badge.plus",
        title: String(localized: kind == .recovery ? "auth.link.error.title.recovery" : "auth.link.error.title"),
        message: Self.message(failure),
        actionTitle: String(localized: "common.ok"),
        action: { dismiss() })
    case nil:
      EmptyView()
    }
  }

  static func message(_ f: AuthLinkFailure) -> String {
    switch f {
    case .expired: String(localized: "auth.link.error.expired")
    case .otherDevice: String(localized: "auth.link.error.otherDevice")
    case .offline: String(localized: "auth.error.network")
    case .invalid: String(localized: "auth.link.error.invalid")
    }
  }
}
