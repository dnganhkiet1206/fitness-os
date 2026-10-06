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
      SignInView()
    case .signedIn(let s):
      // `id`: đổi tài khoản dựng lại cả cây — không state nào của người trước
      // (tab đang mở, màn tập, ô đang gõ) sống sót sang người sau.
      RootTabView()
        .id(s.userId)
    }
  }
}
