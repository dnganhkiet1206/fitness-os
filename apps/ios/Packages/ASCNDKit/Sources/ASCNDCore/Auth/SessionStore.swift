public import Observation

/// Phiên đăng nhập như phần còn lại của app thấy nó.
public struct AuthSession: Sendable, Hashable {
  public let userId: String
  public let email: String?
  public init(userId: String, email: String?) {
    self.userId = userId
    self.email = email
  }
}

/// Những gì backend báo về phiên — đủ cho app, không lộ kiểu của supabase.
public enum AuthEvent: Sendable, Hashable {
  case initialSession, signedIn, signedOut, tokenRefreshed, userUpdated, passwordRecovery, other
}

/// Cổng tới dịch vụ đăng nhập. Bản thật bọc supabase-swift (`ASCNDBackend`);
/// test dùng bản giả — nên `SessionStore` chạy được trên Linux.
public protocol AuthAPI: Sendable {
  /// Phiên đang lưu (Keychain). Ném lỗi = không đọc được.
  func currentSession() async throws -> AuthSession?
  /// Mọi thay đổi phiên, kể cả những thay đổi không do nút nào (token hết
  /// hạn, tài khoản bị xoá, đổi mật khẩu ở máy khác).
  func stateChanges() -> AsyncStream<(AuthEvent, AuthSession?)>
  func signUp(email: String, password: String, name: String) async throws
  func signIn(email: String, password: String) async throws
  func signInWithApple(identityToken: String, rawNonce: String) async throws
  func resetPassword(email: String) async throws
  func signOut() async throws
}

/// Trạng thái đăng nhập của app — một nguồn, quan sát được.
///
/// Theo `native/src/hooks/use-auth.tsx` @ fac9ac2:
/// - đọc phiên lỗi thì là ĐÃ ĐĂNG XUẤT, không kẹt ở "đang tải" (màn chờ không
///   bao giờ được là một ngõ cụt);
/// - MỌI cách một phiên kết thúc — không chỉ nút Đăng xuất — đều chạy dọn dẹp
///   dữ liệu của người dùng (`forgetPreviousAccount`): refresh token hết hạn,
///   tài khoản bị xoá, đổi mật khẩu ở máy khác đều đi qua sự kiện `signedOut`;
/// - đăng xuất bằng nút thì đợi dọn xong rồi mới trả về — "đã đăng xuất" nghĩa
///   là việc dọn đã xong. Dọn chạy hai lần là vô hại (idempotent).
@MainActor
@Observable
public final class SessionStore {
  public enum Phase: Sendable, Hashable {
    case loading
    case signedOut
    case signedIn(AuthSession)
  }

  public private(set) var phase: Phase = .loading

  public var session: AuthSession? {
    if case .signedIn(let s) = phase { return s }
    return nil
  }

  @ObservationIgnored private let api: any AuthAPI
  /// Dọn dữ liệu của người dùng vừa rời đi (hàng đợi offline theo #241, cache,
  /// tiến độ ngày…). Mỗi chủ dữ liệu tự đăng ký phần của mình.
  @ObservationIgnored private var cleanups: [@MainActor @Sendable () async -> Void] = []
  @ObservationIgnored private var listener: Task<Void, Never>?

  public init(api: any AuthAPI) {
    self.api = api
  }

  public func onSignedOut(_ cleanup: @escaping @MainActor @Sendable () async -> Void) {
    cleanups.append(cleanup)
  }

  /// Đọc phiên đã lưu rồi nghe mọi thay đổi. Gọi một lần lúc app mở.
  public func start() async {
    guard listener == nil else { return }
    let changes = api.stateChanges()
    listener = Task { [weak self] in
      for await (event, session) in changes {
        await self?.apply(event, session)
      }
    }
    do {
      let s = try await api.currentSession()
      // Nếu sự kiện đến trước và đã quyết, đừng đè bằng kết quả đọc muộn.
      if phase == .loading { phase = s.map(Phase.signedIn) ?? .signedOut }
    } catch {
      if phase == .loading { phase = .signedOut }
    }
  }

  public func stop() {
    listener?.cancel()
    listener = nil
  }

  private func apply(_ event: AuthEvent, _ session: AuthSession?) async {
    let previous = self.session?.userId
    phase = session.map(Phase.signedIn) ?? .signedOut
    // `initialSession` không có phiên là một lần mở app chưa từng đăng nhập —
    // không phải một lần đăng xuất, không có gì của ai để dọn.
    let ended = event == .signedOut || (previous != nil && session == nil && event != .initialSession)
    // Đổi thẳng sang tài khoản khác, không có `signedOut` xen giữa.
    // RN behavior: chỉ dọn khi `SIGNED_OUT` (`use-auth.tsx:112`) — người sau
    //   thừa hưởng dữ liệu trên máy của người trước nếu phiên bị thay thẳng.
    // Native behavior: đổi `userId` cũng là kết thúc phiên của người trước.
    // Reason: an toàn dữ liệu. Test: switchingAccountsRunsCleanup.
    let switched = previous != nil && session != nil && session?.userId != previous
    if ended || switched {
      await runCleanups()
    }
  }

  private func runCleanups() async {
    for c in cleanups { await c() }
  }

  public func signIn(email: String, password: String) async throws {
    try await api.signIn(email: email, password: password)
  }

  public func signUp(email: String, password: String, name: String) async throws {
    try await api.signUp(email: email, password: password, name: name)
  }

  public func signInWithApple(identityToken: String, rawNonce: String) async throws {
    try await api.signInWithApple(identityToken: identityToken, rawNonce: rawNonce)
  }

  public func resetPassword(email: String) async throws {
    try await api.resetPassword(email: email)
  }

  /// Đăng xuất và đợi dọn xong. Lỗi mạng khi báo server không giữ người dùng
  /// lại trong phiên: trên máy này họ đã đăng xuất.
  public func signOut() async {
    try? await api.signOut()
    phase = .signedOut
    await runCleanups()
  }
}
