import ASCNDCore
import Foundation
import Testing

/// Đăng xuất không bị treo theo mạng (16/10, chủ dự án: "app không đăng xuất được").
private final class HangingAuth: AuthAPI, @unchecked Sendable {
  private let lock = NSLock()
  private var continuation: AsyncStream<(AuthEvent, AuthSession?)>.Continuation?
  func emit(_ e: AuthEvent, _ s: AuthSession?) { lock.withLock { continuation }?.yield((e, s)) }
  func currentSession() async throws -> AuthSession? { nil }
  func stateChanges() -> AsyncStream<(AuthEvent, AuthSession?)> {
    AsyncStream { c in lock.withLock { continuation = c } }
  }
  func signUp(email: String, password: String, name: String) async throws {}
  func signIn(email: String, password: String) async throws {}
  func signInWithApple(identityToken: String, rawNonce: String) async throws {}
  func resetPassword(email: String) async throws {}
  /// Server không bao giờ trả lời (mạng treo): chỉ kết thúc khi bị huỷ.
  private var outcome: String?
  var signOutOutcome: String? { lock.withLock { outcome } }
  func signOut() async throws {
    do {
      try await Task.sleep(for: .seconds(600))
      lock.withLock { outcome = "answered" }
    } catch {
      lock.withLock { outcome = "cancelled" }
      throw error
    }
  }
  func updatePassword(_ password: String) async throws {}
}

@MainActor
struct SignOutTimeoutTests {
  /// Không đo đồng hồ (01/11: runner Linux chậm đo được 70+ s > trần 60 s, đỏ oan):
  /// `signOut` chỉ trả về khi lời gọi server đã kết thúc, nên "server bị huỷ, không tự
  /// trả lời" là bằng chứng nó không chờ server. Hồi quy (chờ server) thì treo — trần
  /// thời gian của test bắt, thay vì treo cả CI.
  @Test(.timeLimit(.minutes(5))) func aHangingServerDoesNotKeepTheUserSignedIn() async {
    let api = HangingAuth()
    let store = SessionStore(api: api)
    var cleaned = false
    store.onSignedOut { cleaned = true }
    await store.signOut(remoteTimeout: .milliseconds(100))
    #expect(store.phase == .signedOut)
    #expect(cleaned)
    #expect(api.signOutOutcome == "cancelled", "đăng xuất phải bỏ server treo, không chờ nó trả lời")
  }
}
