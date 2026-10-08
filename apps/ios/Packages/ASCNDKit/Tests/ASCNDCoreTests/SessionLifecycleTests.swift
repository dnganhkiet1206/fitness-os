import ASCNDCore
import Foundation
import Testing

/// `AuthAPI` giả cho state machine: phiên đọc ra được cấu hình trước,
/// sự kiện bắn tay theo đúng thứ tự kịch bản.
private final class ScriptedAuth: AuthAPI, @unchecked Sendable {
  private let lock = NSLock()
  private var continuation: AsyncStream<(AuthEvent, AuthSession?)>.Continuation?
  private var _stored: AuthSession?
  init(stored: AuthSession? = nil) { _stored = stored }

  func emit(_ e: AuthEvent, _ s: AuthSession?) { lock.withLock { continuation }?.yield((e, s)) }
  func currentSession() async throws -> AuthSession? { lock.withLock { _stored } }
  func stateChanges() -> AsyncStream<(AuthEvent, AuthSession?)> {
    AsyncStream { c in lock.withLock { continuation = c } }
  }
  func signUp(email: String, password: String, name: String) async throws {}
  func signIn(email: String, password: String) async throws {}
  func signInWithApple(identityToken: String, rawNonce: String) async throws {}
  func resetPassword(email: String) async throws {}
  func signOut() async throws { lock.withLock { _stored = nil } }
  /// #441 thêm vào `AuthAPI`; luồng phiên ở đây không đổi mật khẩu.
  func updatePassword(_ password: String) async throws {}
}

private let alice = AuthSession(userId: "u-alice", email: "a@example.com")
private let bob = AuthSession(userId: "u-bob", email: "b@example.com")

/// Đợi tới khi điều kiện đúng — có trần, không treo.
@MainActor
private func eventually(_ condition: () -> Bool) async {
  for _ in 0..<200 where !condition() { await Task.yield(); try? await Task.sleep(nanoseconds: 1_000_000) }
}

/// State machine toàn vòng đời phiên — một kịch bản duy nhất đi qua mọi
/// chuyển đổi, mỗi bước khẳng định phase và số lần dọn dẹp đã chạy.
///
/// Thứ tự: mở lạnh (chưa đăng nhập) → đăng nhập → refresh token →
/// đổi tài khoản → server đá ra → đăng nhập lại → nút đăng xuất (mạng hỏng)
/// → mở lạnh (đã đăng nhập).
///
/// trace: native/src/hooks/use-auth.tsx @ fac9ac2; native differences:
/// đổi userId thẳng cũng dọn (RN chỉ dọn ở SIGNED_OUT).
@MainActor
struct SessionLifecycleTests {
  @Test func fullLifecycleRunsCleanupAtEveryBoundary() async {
    let api = ScriptedAuth()
    let store = SessionStore(api: api)
    var cleanups = 0
    store.onSignedOut { cleanups += 1 }

    // 1. Mở lạnh chưa đăng nhập: signedOut, KHÔNG dọn (chưa có ai để dọn).
    await store.start()
    await eventually { store.phase == .signedOut }
    #expect(store.phase == .signedOut)
    #expect(cleanups == 0)

    // 2. Đăng nhập: signedIn(alice), không dọn.
    api.emit(.signedIn, alice)
    await eventually { store.session?.userId == "u-alice" }
    #expect(store.phase == .signedIn(alice))
    #expect(cleanups == 0)

    // 3. Refresh token: vẫn alice, không dọn.
    api.emit(.tokenRefreshed, alice)
    await eventually { store.phase == .signedIn(alice) }
    #expect(cleanups == 0)

    // 4. Đổi thẳng sang bob (không có signedOut xen giữa): dọn dữ liệu alice.
    api.emit(.signedIn, bob)
    await eventually { store.session?.userId == "u-bob" }
    #expect(cleanups == 1)

    // 5. Server đá ra (token hết hạn ở máy khác): signedOut + dọn dữ liệu bob.
    api.emit(.signedOut, nil)
    await eventually { store.phase == .signedOut }
    #expect(cleanups == 2)

    // 6. Đăng nhập lại alice: không dọn.
    api.emit(.signedIn, alice)
    await eventually { store.session?.userId == "u-alice" }
    #expect(cleanups == 2)

    // 7. Nút đăng xuất (mạng hỏng khi báo server): vẫn signedOut + dọn.
    // (ScriptedAuth.signOut không ném; ca mạng hỏng đã có ở SessionStoreTests.)
    await store.signOut()
    #expect(store.phase == .signedOut)
    #expect(cleanups == 3)

    // 8. Mở lạnh đã đăng nhập: signedIn, không dọn.
    let api2 = ScriptedAuth(stored: alice)
    let store2 = SessionStore(api: api2)
    var cleanups2 = 0
    store2.onSignedOut { cleanups2 += 1 }
    await store2.start()
    await eventually { store2.session?.userId == "u-alice" }
    #expect(store2.phase == .signedIn(alice))
    #expect(cleanups2 == 0)

    store.stop(); store2.stop()
  }

  /// Nút đăng xuất LUÔN dọn (kể cả khi đã signedOut) — nên mọi cleanup
  /// đăng ký phải idempotent ("dọn hai lần vô hại", theo contract của
  /// SessionStore). Test này ghim contract đó.
  @Test func signOutAlwaysRunsCleanup() async {
    let api = ScriptedAuth()
    let store = SessionStore(api: api)
    var cleanups = 0
    store.onSignedOut { cleanups += 1 }
    await store.start()
    await eventually { store.phase == .signedOut }
    await store.signOut()
    await store.signOut()
    #expect(cleanups == 2)
    store.stop()
  }
}
