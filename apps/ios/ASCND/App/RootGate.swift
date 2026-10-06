import ASCNDCore
import SwiftUI

/// Màn nào theo phiên (#273): đang đọc phiên → chờ; chưa đăng nhập → đăng
/// nhập; đã đăng nhập → app. Đọc phiên hỏng là "chưa đăng nhập", không kẹt ở
/// màn chờ (`SessionStore.start`, như `use-auth.tsx`).
struct RootGate: View {
  @Environment(AppServices.self) private var services

  var body: some View {
    switch services.session.phase {
    case .loading:
      ProgressView()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    case .signedOut:
      AuthView()
    case .signedIn(let s):
      // `id`: đổi tài khoản dựng lại cả cây — không state nào của người trước
      // (tab đang mở, màn tập, ô đang gõ) sống sót sang người sau.
      SignedInScope(userId: s.userId) {
        RootTabView()
      }
      .id(s.userId)
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

  var body: some View {
    Group {
      if let flow {
        content.environment(flow)
      } else {
        ProgressView()
          .frame(maxWidth: .infinity, maxHeight: .infinity)
      }
    }
    .task {
      let f = services.makeWorkoutFlow(userId: userId, rest: rest)
      flow = f
      await services.forgetOtherAccounts(keeping: userId)
      await f.start()
    }
    // Phiên kết thúc (đăng xuất, đổi tài khoản → `.id` đổi): huỷ lượt làm mới
    // đang bay, để nó không ghi cache của người vừa rời đi.
    .onDisappear { flow?.close() }
    .onChange(of: scenePhase) { _, phase in
      // Ra tiền cảnh: qua nửa đêm thì "hôm nay" đổi; dữ liệu cũ hơn một phút
      // thì làm mới (`focusManager` của baseline).
      if phase == .active, let flow { Task { await flow.becameActive() } }
    }
    .onChange(of: services.sync.online) { _, online in
      // Có mạng lại (`refetchOnReconnect` của baseline).
      if online, let flow { Task { await flow.reconnected() } }
    }
  }
}
