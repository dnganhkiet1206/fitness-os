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
  /// Server không bao giờ trả lời (mạng treo).
  func signOut() async throws { try await Task.sleep(for: .seconds(600)) }
  func updatePassword(_ password: String) async throws {}
}

@MainActor
struct SignOutTimeoutTests {
  @Test func aHangingServerDoesNotKeepTheUserSignedIn() async {
    let api = HangingAuth()
    let store = SessionStore(api: api)
    var cleaned = false
    store.onSignedOut { cleaned = true }
    let started = ContinuousClock.now
    await store.signOut(remoteTimeout: .milliseconds(100))
    #expect(store.phase == .signedOut)
    #expect(cleaned)
    // Server treo 600 s; trần rộng vì CI chạy song song hơn 1400 test làm MainActor
    // trễ hàng chục giây (đo được 13 s), dưới 60 s vẫn chứng tỏ không chờ server.
    #expect(ContinuousClock.now - started < .seconds(60))
  }
}
