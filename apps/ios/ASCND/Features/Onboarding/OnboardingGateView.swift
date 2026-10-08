import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Cổng sau đăng nhập (#527 1.3) — `app/_layout.tsx:292` @ fac9ac2:
///
/// - hồ sơ chưa xong onboarding → luồng onboarding, app (tab, luồng tập, đồng
///   bộ đọc) chưa dựng — RN cũng chưa gắn Stack / `HealthAutoSync` ở đây;
/// - đọc hỏng mà không có bản nhớ → "không tải được" + Thử lại + Đăng xuất
///   (lối thoát khi hàng hồ sơ mất hẳn — thử lại mãi vẫn hỏng);
/// - không có hàng hồ sơ, hay đã xong → app.
///
/// Người quay lại không bao giờ thấy màn chờ khi offline: `OnboardingGate` đọc
/// bản nhớ trên máy trước rồi mới hỏi server.
struct OnboardingGateView<Content: View>: View {
  let userId: String
  @ViewBuilder let content: Content
  @Environment(AppServices.self) private var services
  @State private var gate: OnboardingGate?
  @State private var retrying = false

  var body: some View {
    Group {
      if let gate {
        switch gate.state {
        case .checking:
          DSLoadingView(message: String(localized: "rootgate.loading"))
        case .needsOnboarding:
          OnboardingFlowView(userId: userId, gate: gate)
        case .completed:
          content
        case .failed:
          failed(gate)
        }
      } else {
        DSLoadingView(message: String(localized: "rootgate.loading"))
      }
    }
    .task {
      // Mở chốt tài khoản TRƯỚC khi đọc nháp / cờ đã xong (#431): chốt đang
      // đóng thì đọc không thấy gì, và người cũ đã xong sẽ bị đẩy vào onboarding.
      // `SignedInScope` gọi lại sau — gọi hai lần là vô hại.
      await services.forgetOtherAccounts(keeping: userId)
      let g = services.makeOnboardingGate(userId: userId)
      gate = g
      await g.check()
    }
  }

  private func failed(_ gate: OnboardingGate) -> some View {
    VStack(spacing: DS.Spacing.md) {
      Image(systemName: "icloud.slash")
        .font(.title2)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .accessibilityHidden(true)
      Text(String(localized: "onboarding.gate.failed"))
        .font(DS.TextStyle.headline)
        .foregroundStyle(DS.Color.foreground.swiftUI)
        .multilineTextAlignment(.center)
        .accessibilityAddTraits(.isHeader)
      Text(String(localized: "onboarding.gate.failed.hint"))
        .font(DS.TextStyle.body)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .multilineTextAlignment(.center)
      DSButton(String(localized: "onboarding.gate.retry"), style: .secondary) {
        Task {
          retrying = true
          await gate.check()
          retrying = false
        }
      }
      .disabled(retrying)
      Button(String(localized: "onboarding.gate.signOut")) {
        Task { await services.session.signOut() }
      }
      .font(DS.TextStyle.footnote)
      .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      .frame(minHeight: 44)
    }
    .padding(DS.Spacing.lg)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(DS.Color.background.swiftUI)
  }
}
