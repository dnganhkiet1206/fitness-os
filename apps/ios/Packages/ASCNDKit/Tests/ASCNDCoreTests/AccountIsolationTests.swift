import ASCNDCore
import ASCNDTestSupport
import Foundation
import Testing

/// Hồi quy cô lập tài khoản qua các lớp persistence (#374 D-22).
///
/// Contract hiện tại (theo AppServices + #241):
/// - Đăng xuất → ĐỖ hàng đợi outbox (`park`, round 3 AUD-06 / #241 (b)): bản ghi
///   ở lại máy với `userId` của chủ, người khác không thấy, không gửi được; chính
///   chủ đăng nhập lại thì gửi.
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
  /// #441 thêm vào `AuthAPI`; luồng phiên ở đây không đổi mật khẩu.
  func updatePassword(_ password: String) async throws {}
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

/// Lắp dây như AppServices: đăng xuất → đỗ hàng đợi.
@MainActor
private func wiredSession(outbox: LockedOutbox) -> (SessionStore, FakeAuth) {
  let api = FakeAuth()
  let store = SessionStore(api: api)
  store.onSignedOut { outbox.park() }
  return (store, api)
}

/// OutboxStore là struct — bọc để cleanup closure mutate được.
private final class LockedOutbox: @unchecked Sendable {
  private let lock = NSLock()
  private var box = Outbox()
  var pendingCount: Int { lock.withLock { box.pending.count } }
  func pendingCount(for user: String?) -> Int { lock.withLock { box.pending(for: user).count } }
  func enqueue(_ e: OutboxEntry) { lock.withLock { box.enqueue(e) } }
  func park() { lock.withLock { _ = box.park() } }
  func next(as user: String?) -> Outbox.Next {
    lock.withLock { box.next(now: EpochMillis(0), online: true, signedInUser: user) }
  }
}

@MainActor
struct AccountIsolationTests {
  /// A ghi hàng đợi → đăng xuất → hàng đợi ĐỖ lại → B đăng nhập không thấy, không
  /// gửi được gì của A → A đăng nhập lại thì bản ghi của A được gửi.
  /// Lớp sở hữu: Outbox.park / next, nối qua SessionStore.onSignedOut.
  @Test func signOutParksQueueAndOnlyItsOwnerSendsIt() async {
    let outbox = LockedOutbox()
    let (session, api) = wiredSession(outbox: outbox)

    // A đăng nhập, ghi một revision vào hàng đợi.
    api.emit(.signedIn, alice)
    await eventually { session.session?.userId == "u-alice" }
    outbox.enqueue(entry("sess-a@1", user: "u-alice"))
    #expect(outbox.pendingCount == 1)

    // A đăng xuất → bản ghi của A KHÔNG mất (AUD-06).
    await session.signOut()
    #expect(session.phase == .signedOut)
    #expect(outbox.pendingCount == 1)
    #expect(outbox.next(as: nil) == .idle)

    // B đăng nhập trên cùng máy: không thấy, không gửi được hàng đợi của A.
    api.emit(.signedIn, bob)
    await eventually { session.session?.userId == "u-bob" }
    #expect(outbox.pendingCount(for: "u-bob") == 0)
    #expect(outbox.next(as: "u-bob") == .idle)

    // A đăng nhập lại: bản ghi của A được gửi, dưới phiên của A.
    await session.signOut()
    api.emit(.signedIn, alice)
    await eventually { session.session?.userId == "u-alice" }
    #expect(outbox.next(as: "u-alice") == .send(entry("sess-a@1", user: "u-alice")))
    session.stop()
  }

  /// Kill sau khi đăng xuất: tiến trình mới (bộ nhớ mới) của B không thấy gì của A.
  /// (Bản ghi đỗ của A sống trên đĩa — `OutboxStoreTests` ghim phần ấy.)
  @Test func killReopenAfterSignOutShowsNothingOfA() async {
    let outbox = LockedOutbox()
    let (session, api) = wiredSession(outbox: outbox)
    api.emit(.signedIn, alice)
    await eventually { session.session?.userId == "u-alice" }
    outbox.enqueue(entry("sess-a@1", user: "u-alice"))
    await session.signOut()
    #expect(outbox.pendingCount(for: "u-bob") == 0)

    // Kill: dựng lại mọi thứ như app mở lại.
    session.stop()
    let outbox2 = LockedOutbox() // tiến trình mới = bộ nhớ mới
    let (session2, api2) = wiredSession(outbox: outbox2)
    await session2.start()
    await eventually { session2.phase == .signedOut }
    api2.emit(.signedIn, bob)
    await eventually { session2.session?.userId == "u-bob" }
    #expect(outbox2.pendingCount(for: "u-bob") == 0)
    session2.stop()
  }

  /// Dữ liệu đã commit KHÔNG bị dọn khi đăng xuất — chỉ hàng đợi bị bỏ.
  /// Đây là contract hiện tại; test ghim để ai đổi contract phải sửa test.
  @Test func committedDayDataSurvivesSignOut() async throws {
    let store = InMemoryWorkoutStore()
    let key = "routine-day:2026-10-05:tpl-1"
    try await store.saveDay(key, DayState(), userId: "u-alice")
    #expect(try await store.loadDay(key) != nil)

    let outbox = LockedOutbox()
    let (session, _) = wiredSession(outbox: outbox)
    await session.signOut()

    // Ngày đã lưu vẫn còn — đăng xuất chỉ bỏ hàng đợi.
    #expect(try await store.loadDay(key) != nil)
    session.stop()
  }

  /// Dọn chạy hai lần vô hại: đăng xuất hai lần không sinh lỗi, không nhân đôi
  /// hay làm mất bản ghi đang đỗ (AUD-06).
  @Test func cleanupIsIdempotentAcrossReopen() async {
    let outbox = LockedOutbox()
    let (session, api) = wiredSession(outbox: outbox)
    api.emit(.signedIn, alice)
    await eventually { session.session?.userId == "u-alice" }
    outbox.enqueue(entry("sess-a@1", user: "u-alice"))
    await session.signOut()
    await session.signOut() // dọn lần hai
    #expect(outbox.pendingCount == 1)
    #expect(outbox.pendingCount(for: nil) == 0)
    session.stop()
  }
}
