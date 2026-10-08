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
        // Cổng onboarding (#527 1.3, `_layout.tsx:292`) đứng TRƯỚC phiên app:
        // chưa xong onboarding thì luồng tập / tab chưa dựng.
        OnboardingGateView(userId: s.userId) {
          SignedInScope(userId: s.userId) {
            RootTabView()
          }
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
          .environment(\.weightUnit, weightUnit)
          // Cùng MỘT hồ sơ cho đơn vị tạ và cho màn sửa hồ sơ: lưu xong thì
          // màn tập đổi đơn vị ngay, không đợi lượt đọc lại.
          .environment(profile)
      } else {
        ProgressView()
          .frame(maxWidth: .infinity, maxHeight: .infinity)
      }
    }
    .task {
      let f = services.makeWorkoutFlow(userId: userId, rest: rest)
      f.setWeightUnit(weightUnit)
      flow = f
      // "Đang kết nối lại" thoát khi lượt tải của phiên này xong. Giữ `weak`:
      // phiên đã đóng thì không còn gì để chờ. Không gỡ ở `onDisappear` — cây
      // của người mới có thể đã đăng ký trước khi cây cũ gỡ xong.
      services.net.busyProbe = { [weak f] in f?.isBusy ?? false }
      await services.forgetOtherAccounts(keeping: userId)
      // Sau `forgetOtherAccounts`: bản nhớ hồ sơ chỉ đọc được khi phiên đã là
      // của người này. Đơn vị từ bản nhớ (không mạng) có TRƯỚC khi buổi tập
      // dựng (#527 1.9-D) — mở lại app, ô tạ hiện lb ngay, không nháy kg; đọc
      // server song song với luồng tập.
      let book = services.makeProfileBook(userId: userId)
      profile = book
      // Hồ sơ cũng là một lượt tải của phiên (RN: query `profile` trong
      // `isFetching`). Đăng ký lại cùng probe, thêm hồ sơ — vẫn `weak`.
      services.net.busyProbe = { [weak f, weak book] in
        (f?.isBusy ?? false) || (book?.isRefreshing ?? false)
      }
      await book.loadCached()
      f.setWeightUnit(weightUnit)
      async let units: Void = book.refresh()
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
    // Màn tập đọc và gõ theo đơn vị của tài khoản (#527 1.9-B): controller đổi
    // chữ trong ô về kg theo đúng đơn vị màn đang hiện. Hồ sơ chưa nạp → kg,
    // như RN `useUnits`.
    .onChange(of: weightUnit, initial: true) { _, unit in
      flow?.setWeightUnit(unit)
    }
    .onChange(of: services.sync.online) { _, online in
      // Có mạng lại (`refetchOnReconnect` của baseline).
      if online, let flow { Task { await flow.reconnected() } }
    }
  }

  private var weightUnit: WeightUnit { WeightUnit(profile: profile?.profile) }

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
