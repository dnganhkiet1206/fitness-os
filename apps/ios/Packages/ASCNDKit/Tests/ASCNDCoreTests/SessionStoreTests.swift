import ASCNDCore
import Foundation
import Testing

/// `AuthAPI` giả: phiên đọc ra được cấu hình trước, sự kiện bắn tay.
private final class FakeAuth: AuthAPI, @unchecked Sendable {
  private let lock = NSLock()
  private var continuation: AsyncStream<(AuthEvent, AuthSession?)>.Continuation?
  private var _calls: [String] = []
  let stored: Result<AuthSession?, any Error>
  let signOutFails: Bool

  init(stored: Result<AuthSession?, any Error> = .success(nil), signOutFails: Bool = false) {
    self.stored = stored
    self.signOutFails = signOutFails
  }

  var calls: [String] { lock.withLock { _calls } }
  private func record(_ c: String) { lock.withLock { _calls.append(c) } }

  func emit(_ e: AuthEvent, _ s: AuthSession?) { lock.withLock { continuation }?.yield((e, s)) }

  func currentSession() async throws -> AuthSession? { try stored.get() }
  func stateChanges() -> AsyncStream<(AuthEvent, AuthSession?)> {
    AsyncStream { c in lock.withLock { continuation = c } }
  }
  func signUp(email: String, password: String, name: String) async throws { record("signUp:\(email):\(name)") }
  func signIn(email: String, password: String) async throws { record("signIn:\(email)") }
  func signInWithApple(identityToken: String, rawNonce: String) async throws { record("apple:\(rawNonce)") }
  func resetPassword(email: String) async throws { record("reset:\(email)") }
  func signOut() async throws {
    record("signOut")
    if signOutFails { throw URLError(.notConnectedToInternet) }
  }
}

private struct ReadFailed: Error {}
private let alice = AuthSession(userId: "u-alice", email: "a@example.com")

/// Đợi tới khi điều kiện đúng (sự kiện đi qua một Task) — có trần, không treo.
@MainActor
private func eventually(_ condition: () -> Bool) async {
  for _ in 0..<200 where !condition() { await Task.yield(); try? await Task.sleep(nanoseconds: 1_000_000) }
}

@MainActor
struct SessionStoreTests {
  @Test func restoresStoredSession() async {
    let store = SessionStore(api: FakeAuth(stored: .success(alice)))
    #expect(store.phase == .loading)
    await store.start()
    #expect(store.phase == .signedIn(alice))
  }

  /// Đọc phiên lỗi → đã đăng xuất, KHÔNG kẹt ở màn chờ (use-auth.tsx).
  @Test func unreadableSessionIsSignedOutNotLoading() async {
    let store = SessionStore(api: FakeAuth(stored: .failure(ReadFailed())))
    await store.start()
    #expect(store.phase == .signedOut)
  }

  /// Phiên kết thúc không do nút nào (token bị thu hồi, đổi mật khẩu ở máy
  /// khác) vẫn dọn dữ liệu của người vừa rời đi.
  @Test func serverSideSignOutRunsCleanup() async {
    let api = FakeAuth(stored: .success(alice))
    let store = SessionStore(api: api)
    var cleaned = 0
    store.onSignedOut { cleaned += 1 }
    await store.start()
    api.emit(.signedOut, nil)
    await eventually { cleaned > 0 }
    #expect(store.phase == .signedOut)
    #expect(cleaned == 1)
  }

  /// Mở app khi chưa từng đăng nhập: không có ai để dọn.
  /// Phiên bị thay thẳng bằng tài khoản khác (không có `signedOut`): dữ
  /// liệu của người trước vẫn phải được dọn. Cùng người làm mới token thì không.
  @Test func switchingAccountsRunsCleanup() async {
    let api = FakeAuth(stored: .success(alice))
    let store = SessionStore(api: api)
    var cleaned = 0
    store.onSignedOut { cleaned += 1 }
    await store.start()
    api.emit(.tokenRefreshed, alice)
    await eventually { false }
    #expect(cleaned == 0, "làm mới token của cùng người không phải kết thúc phiên")
    let bob = AuthSession(userId: "u-bob", email: "b@example.com")
    api.emit(.signedIn, bob)
    await eventually { cleaned == 1 }
    #expect(cleaned == 1)
    #expect(store.phase == .signedIn(bob))
  }

  @Test func initialSessionWithoutUserIsNotASignOut() async {
    let api = FakeAuth()
    let store = SessionStore(api: api)
    var cleaned = 0
    store.onSignedOut { cleaned += 1 }
    await store.start()
    api.emit(.initialSession, nil)
    await eventually { false }
    #expect(cleaned == 0)
    #expect(store.phase == .signedOut)
  }

  @Test func signInEventUpdatesPhase() async {
    let api = FakeAuth()
    let store = SessionStore(api: api)
    await store.start()
    api.emit(.signedIn, alice)
    await eventually { store.session != nil }
    #expect(store.session == alice)
  }

  /// Nút Đăng xuất: dọn XONG rồi mới trả về; mất mạng khi báo server vẫn đăng
  /// xuất trên máy này.
  @Test(arguments: [false, true])
  func signOutButtonWaitsForCleanup(serverFails: Bool) async {
    let api = FakeAuth(stored: .success(alice), signOutFails: serverFails)
    let store = SessionStore(api: api)
    var cleaned = false
    store.onSignedOut {
      try? await Task.sleep(nanoseconds: 5_000_000)
      cleaned = true
    }
    await store.start()
    await store.signOut()
    #expect(cleaned, "signOut() trả về trước khi dọn xong")
    #expect(store.phase == .signedOut)
    #expect(api.calls.contains("signOut"))
  }

  @Test func actionsReachTheAPI() async throws {
    let api = FakeAuth()
    let store = SessionStore(api: api)
    try await store.signUp(email: "b@example.com", password: "pw", name: "Bảo")
    try await store.signIn(email: "b@example.com", password: "pw")
    try await store.signInWithApple(identityToken: "tok", rawNonce: "n1")
    try await store.resetPassword(email: "b@example.com")
    #expect(api.calls == ["signUp:b@example.com:Bảo", "signIn:b@example.com", "apple:n1", "reset:b@example.com"])
  }
}
