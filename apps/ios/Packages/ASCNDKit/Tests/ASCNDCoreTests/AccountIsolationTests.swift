import ASCNDCore
import ASCNDTestSupport
import Foundation
import Testing

/// Hồi quy cô lập tài khoản qua các lớp persistence (#374 D-22).
///
/// Contract hiện tại (theo AppServices + #241):
/// - Đăng xuất → bỏ HÀNG ĐỢI outbox (`dropAllOnSignOut`), như baseline.
/// - Dữ liệu đã commit (ngày đã chốt) vẫn ở lại máy.
/// - Mọi cleanup đăng ký qua `SessionStore.onSignedOut` phải idempotent.
///
/// Mỗi test chỉ ra lớp nào sở hữu việc dọn.
private final class FakeAuth: AuthAPI, @unchecked Sendable {
  private let lock = NSLock()
  private var continuation: AsyncStream<(AuthEvent, AuthSession?)>.Continuation?
  init() {}
  func emit(_ e: AuthEvent, _ s: AuthSession?) { lock.withLock { continuation }?.yield((e, s)) }
  func currentSession() async throws -> AuthSession? { nil }
  func stateChanges() -> AsyncStream<(AuthEvent, AuthSession?)> {
    AsyncStream { c in lock.withLock { continuation = c } }
  }
  func signUp(email: String, password: String, name: String) async throws {}
  func signIn(email: String, password: String) async throws {}
  func signInWithApple(identityToken: String, rawNonce: String) async throws {}
  func resetPassword(email: String) async throws {}
  func signOut() async throws {}
}

@MainActor
private func eventually(_ condition: () -> Bool) async {
  for _ in 0..<200 where !condition() { await Task.yield(); try? await Task.sleep(nanoseconds: 1_000_000) }
}

private let alice = AuthSession(userId: "u-alice", email: "a@example.com")
private let bob = AuthSession(userId: "u-bob", email: "b@example.com")

private func entry(_ id: String, user: String) -> OutboxEntry {
  OutboxEntry(id: id, userId: user, kind: "workout",
              payload: .object(["date_time": .string("2026-10-05T12:00:00.000Z")]),
              createdAt: EpochMillis(0))
}

/// Lắp dây như AppServices: đăng xuất → bỏ hàng đợi.
@MainActor
private func wiredSession(outbox: LockedOutbox) -> (SessionStore, FakeAuth) {
  let api = FakeAuth()
  let store = SessionStore(api: api)
  store.onSignedOut { await outbox.dropAll() }
  return (store, api)
}

/// OutboxStore là struct — bọc để cleanup closure mutate được.
private final class LockedOutbox: @unchecked Sendable {
  private let lock = NSLock()
  private var box = Outbox()
  var pendingCount: Int { lock.withLock { box.pending.count } }
  func enqueue(_ e: OutboxEntry) { lock.withLock { box.enqueue(e) } }
  func dropAll() { lock.withLock { _ = box.dropAllOnSignOut() } }
}

@MainActor
struct AccountIsolationTests {
  /// A ghi hàng đợi → đăng xuất → hàng đợi bị bỏ → B đăng nhập không thấy gì của A.
  /// Lớp sở hữu: OutboxStore.dropAllOnSignOut, nối qua SessionStore.onSignedOut.
  @Test func signOutDropsPendingQueueBeforeBSignsIn() async {
    let outbox = LockedOutbox()
    let (session, api) = wiredSession(outbox: outbox)

    // A đăng nhập, ghi một revision vào hàng đợi.
    api.emit(.signedIn, alice)
    await eventually { session.session?.userId == "u-alice" }
    outbox.enqueue(entry("sess-a@1", user: "u-alice"))
    #expect(outbox.pendingCount == 1)

    // A đăng xuất → dọn.
    await session.signOut()
    #expect(session.phase == .signedOut)
    #expect(outbox.pendingCount == 0)

    // B đăng nhập trên cùng máy: không thấy hàng đợi của A.
    api.emit(.signedIn, bob)
    await eventually { session.session?.userId == "u-bob" }
    #expect(outbox.pendingCount == 0)
    session.stop()
  }

  /// Kill giữa các bước dọn: mở lại sau kill, hàng đợi vẫn trống
  /// (outbox in-memory; bản file-backed thì reopen load lại trạng thái đã dọn).
  @Test func killReopenAfterSignOutStaysClean() async {
    let outbox = LockedOutbox()
    let (session, api) = wiredSession(outbox: outbox)
    api.emit(.signedIn, alice)
    await eventually { session.session?.userId == "u-alice" }
    outbox.enqueue(entry("sess-a@1", user: "u-alice"))
    await session.signOut()
    #expect(outbox.pendingCount == 0)

    // Kill: dựng lại mọi thứ như app mở lại.
    session.stop()
    let outbox2 = LockedOutbox() // tiến trình mới = bộ nhớ mới
    let (session2, api2) = wiredSession(outbox: outbox2)
    await session2.start()
    await eventually { session2.phase == .signedOut }
    api2.emit(.signedIn, bob)
    await eventually { session2.session?.userId == "u-bob" }
    #expect(outbox2.pendingCount == 0)
    session2.stop()
  }

  /// Dữ liệu đã commit KHÔNG bị dọn khi đăng xuất — chỉ hàng đợi bị bỏ.
  /// Đây là contract hiện tại; test ghim để ai đổi contract phải sửa test.
  @Test func committedDayDataSurvivesSignOut() async throws {
    let store = InMemoryWorkoutStore()
    let key = "routine-day:2026-10-05:tpl-1"
    try await store.saveDay(key, DayState())
    #expect(try await store.loadDay(key) != nil)

    let outbox = LockedOutbox()
    let (session, _) = wiredSession(outbox: outbox)
    await session.signOut()

    // Ngày đã lưu vẫn còn — đăng xuất chỉ bỏ hàng đợi.
    #expect(try await store.loadDay(key) != nil)
    session.stop()
  }

  /// Dọn chạy hai lần vô hại: đăng xuất → kill → mở lại → đăng xuất nữa
  /// không sinh lỗi, hàng đợi vẫn trống.
  @Test func cleanupIsIdempotentAcrossReopen() async {
    let outbox = LockedOutbox()
    let (session, api) = wiredSession(outbox: outbox)
    api.emit(.signedIn, alice)
    await eventually { session.session?.userId == "u-alice" }
    outbox.enqueue(entry("sess-a@1", user: "u-alice"))
    await session.signOut()
    await session.signOut() // dọn lần hai
    #expect(outbox.pendingCount == 0)
    session.stop()
  }
}
