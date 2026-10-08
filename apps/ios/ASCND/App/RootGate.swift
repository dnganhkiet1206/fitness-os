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
        // `id`: đổi tài khoản dựng lại cả cây — không state nào của người trước
        // (tab đang mở, màn tập, ô đang gõ) sống sót sang người sau.
        SignedInScope(userId: s.userId) {
          RootTabView()
        }
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

/// Mọi thứ sống theo một phiên đăng nhập. Hiện là luồng tập (#272): dựng một
/// lần ở đây, mọi màn nhận qua `environment` — không màn nào tự dựng
/// controller, nên Today, màn tập và Summary luôn nhìn cùng một buổi.
private struct SignedInScope<Content: View>: View {
  let userId: String
  @ViewBuilder let content: Content
  @Environment(AppServices.self) private var services
  @Environment(RestTimerController.self) private var rest
  @Environment(\.scenePhase) private var scenePhase
  @State private var flow: WorkoutFlow?
  /// Hồ sơ của ĐÚNG tài khoản này — nguồn đơn vị tạ (#527 1.9-A). Dựng lại
  /// cùng phiên (`.id(userId)`), nên không bao giờ mang đơn vị người trước.
  @State private var profile: ProfileBook?

  var body: some View {
    Group {
      if let flow {
        content.environment(flow)
          .environment(\.weightUnit, WeightUnit(profile: profile?.profile))
      } else {
        ProgressView()
          .frame(maxWidth: .infinity, maxHeight: .infinity)
      }
    }
    .task {
      let f = services.makeWorkoutFlow(userId: userId, rest: rest)
      flow = f
      await services.forgetOtherAccounts(keeping: userId)
      // Sau `forgetOtherAccounts`: bản nhớ hồ sơ chỉ đọc được khi phiên đã là
      // của người này. Song song với luồng tập — không chờ nhau.
      let book = services.makeProfileBook(userId: userId)
      profile = book
      async let units: Void = book.load()
      await f.start()
      await units
    }
    // Phiên kết thúc (đăng xuất, đổi tài khoản → `.id` đổi): huỷ lượt làm mới
    // đang bay, để nó không ghi cache của người vừa rời đi.
    .onDisappear { flow?.close() }
    // Transition opacity (#302) giữ cây cũ thêm một nhịp sau khi phase đổi;
    // `onDisappear` chỉ chạy khi gỡ xong. Đóng ngay lúc phiên không còn là
    // của `userId` này, để lượt làm mới của người cũ không ghi cache sau
    // `forgetOtherAccounts` của người mới. `close()` gọi lại là vô hại.
    .onChange(of: isCurrentSession) { _, current in
      if !current { flow?.close() }
    }
    .onChange(of: scenePhase) { _, phase in
      // Ra tiền cảnh: qua nửa đêm thì "hôm nay" đổi; dữ liệu cũ hơn một phút
      // thì làm mới (`focusManager` của baseline).
      if phase == .active, let flow { Task { await flow.becameActive() } }
      // Đổi đơn vị ở máy khác: ra tiền cảnh thì đọc lại hồ sơ.
      if phase == .active, let profile { Task { await profile.refresh() } }
    }
    .onChange(of: services.sync.online) { _, online in
      // Có mạng lại (`refetchOnReconnect` của baseline).
      if online, let flow { Task { await flow.reconnected() } }
    }
  }

  private var isCurrentSession: Bool {
    if case .signedIn(let s) = services.session.phase { return s.userId == userId }
    return false
  }
}

// MARK: - Preview

#Preview("RootGate — loading") {
  RootGate()
    .environment(AppServices())
}

// Reduce Motion không dựng được bằng preview: `accessibilityReduceMotion` là
// EnvironmentValues chỉ đọc (theo cài đặt hệ thống). Kiểm bằng Accessibility
// Inspector / bật Reduce Motion trên máy.
