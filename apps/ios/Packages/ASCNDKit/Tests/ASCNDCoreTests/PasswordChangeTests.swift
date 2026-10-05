import ASCNDCore
import Foundation
import Testing

/// Đổi mật khẩu (#423) — `app/change-password.tsx` @ fac9ac2.

private actor Calls {
  var passwords: [String] = []
  func add(_ p: String) { passwords.append(p) }
}

@MainActor
struct PasswordChangeTests {
  /// Luật của màn: ≥ 6 (đếm như JS), trùng nhau; cờ hiện dưới ô.
  @Test func formRules() {
    let c = PasswordChangeController(change: { _ throws(PasswordChangeFailure) in })
    #expect(!c.tooShort && !c.mismatch && !c.canSave, "ô trống không báo lỗi")
    c.newPassword = "abc12"
    #expect(c.tooShort && !c.canSave)
    c.newPassword = "abc123"
    #expect(!c.tooShort && !c.canSave)
    c.confirmation = "abc124"
    #expect(c.mismatch && !c.canSave)
    c.confirmation = "abc123"
    #expect(!c.mismatch && c.canSave)
  }

  /// Đếm như `String.length` của JS: 3 emoji là 6 đơn vị — đủ dài ở RN, nên
  /// đủ dài ở đây; "é" tổ hợp (e + dấu) là 2.
  @Test func lengthCountsLikeJavaScript() {
    #expect(PasswordRules.length("😀😀😀") == 6)
    #expect(PasswordRules.length("e\u{301}") == 2)
    let c = PasswordChangeController(change: { _ throws(PasswordChangeFailure) in })
    c.newPassword = "😀😀😀"
    c.confirmation = "😀😀😀"
    #expect(c.canSave)
  }

  /// Một lời gọi; xong thì nút tắt luôn — không gửi lần hai.
  @Test func savesOnceThenStaysDisabled() async {
    let calls = Calls()
    let c = PasswordChangeController(change: { p throws(PasswordChangeFailure) in await calls.add(p) })
    c.newPassword = "secret1"
    c.confirmation = "secret1"
    #expect(await c.submit())
    #expect(c.saved && !c.canSave && c.failure == nil)
    #expect(!(await c.submit()))
    #expect(await calls.passwords == ["secret1"])
  }

  /// Lỗi được gọi đúng tên; sửa rồi gửi lại được.
  @Test func failureIsTypedAndRetryable() async {
    var next: PasswordChangeFailure? = .samePassword
    let c = PasswordChangeController(change: { _ throws(PasswordChangeFailure) in
      if let f = next {
        next = nil
        throw f
      }
    })
    c.newPassword = "secret1"
    c.confirmation = "secret1"
    #expect(!(await c.submit()))
    #expect(c.failure == .samePassword && !c.saved && c.canSave)
    #expect(await c.submit())
    #expect(c.failure == nil && c.saved)
  }

  @Test func invalidFormNeverCalls() async {
    let calls = Calls()
    let c = PasswordChangeController(change: { p throws(PasswordChangeFailure) in await calls.add(p) })
    c.newPassword = "short"
    c.confirmation = "short"
    #expect(!(await c.submit()))
    #expect(await calls.passwords.isEmpty)
  }
}

/// `AuthAPI` giả cho đường đi qua `SessionStore`.
private final class Auth: AuthAPI, @unchecked Sendable {
  private let lock = NSLock()
  private var continuation: AsyncStream<(AuthEvent, AuthSession?)>.Continuation?
  var failure: (any Error)?
  private(set) var updated: [String] = []
  let session: AuthSession?
  init(session: AuthSession?) { self.session = session }
  func emit(_ e: AuthEvent, _ s: AuthSession?) { lock.withLock { continuation }?.yield((e, s)) }
  func currentSession() async throws -> AuthSession? { session }
  func stateChanges() -> AsyncStream<(AuthEvent, AuthSession?)> { AsyncStream { c in lock.withLock { continuation = c } } }
  func signUp(email: String, password: String, name: String) async throws {}
  func signIn(email: String, password: String) async throws {}
  func signInWithApple(identityToken: String, rawNonce: String) async throws {}
  func resetPassword(email: String) async throws {}
  func updatePassword(_ password: String) async throws {
    if let failure { throw failure }
    lock.withLock { updated.append(password) }
  }
  func signOut() async throws {}
}

@MainActor
struct PasswordChangeSessionTests {
  private let alice = AuthSession(userId: "u-alice", email: "a@example.com")

  /// Đổi xong: phiên vẫn là phiên ấy (`USER_UPDATED`), không dọn dữ liệu gì —
  /// chính sách đăng xuất không đổi.
  @Test func successKeepsTheSession() async throws {
    let api = Auth(session: alice)
    let store = SessionStore(api: api)
    var cleaned = 0
    store.onSignedOut { cleaned += 1 }
    await store.start()
    let c = PasswordChangeController(session: store)
    c.newPassword = "secret1"
    c.confirmation = "secret1"
    #expect(await c.submit())
    api.emit(.userUpdated, alice)
    try await Task.sleep(for: .milliseconds(50))
    #expect(store.session == alice && cleaned == 0)
    #expect(api.updated == ["secret1"])
  }

  /// Server kết thúc phiên sau khi đổi: đi đường `signedOut` như mọi đường
  /// khác — dữ liệu của người vừa rời đi được dọn.
  @Test func serverEndingTheSessionRunsCleanup() async throws {
    let api = Auth(session: alice)
    let store = SessionStore(api: api)
    var cleaned = 0
    store.onSignedOut { cleaned += 1 }
    await store.start()
    try await store.updatePassword("secret1")
    api.emit(.signedOut, nil)
    for _ in 0..<50 where cleaned == 0 { try await Task.sleep(for: .milliseconds(10)) }
    #expect(cleaned == 1 && store.session == nil)
  }

  /// Không có phiên: không gọi server.
  @Test func signedOutNeverCalls() async {
    let api = Auth(session: nil)
    let store = SessionStore(api: api)
    await store.start()
    await #expect(throws: PasswordChangeFailure.signedOut) { try await store.updatePassword("secret1") }
    #expect(api.updated.isEmpty)
  }

  /// Lỗi đã dịch đi nguyên; mất mạng thô thành `offline`; lạ thành `server`.
  @Test func errorsAreNamed() async {
    let api = Auth(session: alice)
    let store = SessionStore(api: api)
    await store.start()
    api.failure = PasswordChangeFailure.weakPassword(reasons: ["length"])
    await #expect(throws: PasswordChangeFailure.weakPassword(reasons: ["length"])) { try await store.updatePassword("x") }
    api.failure = URLError(.notConnectedToInternet)
    await #expect(throws: PasswordChangeFailure.offline) { try await store.updatePassword("x") }
    struct Weird: Error {}
    api.failure = Weird()
    await #expect(throws: PasswordChangeFailure.server(code: nil)) { try await store.updatePassword("x") }
  }
}
