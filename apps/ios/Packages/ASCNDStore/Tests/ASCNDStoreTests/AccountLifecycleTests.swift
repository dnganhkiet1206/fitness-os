import ASCNDCore
@testable import ASCNDStore
import Foundation
import GRDB
import Testing

/// Vòng đời tài khoản của `workout_day` ở tầng ứng dụng (#455): `AccountLifecycle`
/// (thứ tự mà `AppServices` chạy) + `WorkoutSessionController` thật + SQLite
/// thật. Lượt ghi "muộn" của controller người cũ được GIỮ ở cổng
/// (`HeldStore`) rồi thả ở từng điểm của lượt đổi tài khoản.

private let saigon = TimeZone(identifier: "Asia/Ho_Chi_Minh")!
/// 14:00 giờ Sài Gòn ngày 05/10/2026.
private let clock = FixedClock(at: Date(timeIntervalSince1970: 1_791_183_600))
private let today = LocalDate("2026-10-05")!
private let rows = [
  PlannedSet(key: "b1", exerciseId: "ex-bench", exerciseName: "Bench", ordinal: 1, of: 2, weightKg: 60, reps: 8, plannedRest: 90),
  PlannedSet(key: "b2", exerciseId: "ex-bench", exerciseName: "Bench", ordinal: 2, of: 2, weightKg: 60, reps: 8, plannedRest: 90),
]
/// Cùng ngày, cùng template cho mọi người — cùng khoá `routine-day:…`.
private let plan = WorkoutSessionController.Plan(date: today, templateId: "tpl", templateName: "Push", rows: rows)
private let dayKey = DayProgressStore.key(date: today, templateId: "tpl")

private struct FixedClock: WallClock {
  let at: Date
  func now() -> Date { at }
}

/// `GRDBWorkoutStore` có cổng: `hold()` giữ mọi lượt ghi lại tới `release()`.
private actor HeldStore: WorkoutStore {
  let inner: GRDBWorkoutStore
  private var holding = false
  private var parked: [CheckedContinuation<Void, Never>] = []
  init(_ inner: GRDBWorkoutStore) { self.inner = inner }

  func hold() { holding = true }
  func release() {
    holding = false
    parked.forEach { $0.resume() }
    parked = []
  }
  var waiting: Int { parked.count }
  private func gate() async { if holding { await withCheckedContinuation { parked.append($0) } } }

  func loadDay(_ key: String) async throws -> DayState? { try await inner.loadDay(key) }
  func saveDay(_ key: String, _ state: DayState, userId: String) async throws {
    await gate()
    try await inner.saveDay(key, state, userId: userId)
  }
  func commitFinish(_ key: String, _ state: DayState, _ entry: OutboxEntry) async throws -> Bool {
    await gate()
    return try await inner.commitFinish(key, state, entry)
  }
  func commitDelete(sessionId: String, _ entry: OutboxEntry) async throws {
    await gate()
    try await inner.commitDelete(sessionId: sessionId, entry)
  }
}

/// Một "máy": tệp SQLite, database đang mở, vòng đời, store.
@MainActor
private final class Device {
  let path = FileManager.default.temporaryDirectory.appendingPathComponent("life-\(UUID().uuidString).sqlite").path
  var db: ASCNDDatabase!
  var life: AccountLifecycle!
  var store: GRDBWorkoutStore!
  var ids = 0

  init() throws { try launch() }
  deinit { try? FileManager.default.removeItem(atPath: path) }

  /// Mở app (lần đầu, hoặc sau kill): như `AppServices.init`.
  func launch() throws {
    db = try ASCNDDatabase(path: path)
    life = AccountLifecycle(db)
    life.launched()
    store = GRDBWorkoutStore(db)
  }

  func controller(_ user: String, store: (any WorkoutStore)? = nil) async -> WorkoutSessionController {
    ids += 1
    let id = "\(user.lowercased())-s\(ids)"
    let c = WorkoutSessionController(
      plan: plan, userId: user, store: store ?? self.store, clock: clock, timeZone: saigon, makeId: { id })
    await c.load()
    return c
  }

  /// Đọc thẳng trên đĩa, qua mặt chốt.
  func owners() throws -> [String] {
    try db.queue.read { try String.fetchAll($0, sql: "SELECT userId FROM workout_day ORDER BY userId") }
  }
  func outboxUsers() throws -> [String] {
    try db.queue.read { try String.fetchAll($0, sql: "SELECT userId FROM outbox ORDER BY userId") }
  }
  func readCacheUsers() throws -> [String] {
    try db.queue.read { try String.fetchAll($0, sql: "SELECT DISTINCT userId FROM read_cache ORDER BY userId") }
  }
  func cacheTemplates(_ user: String) async throws {
    try await GRDBTemplateCache(db).save(
      userId: user, TemplateSnapshot(routine: [], templates: [], fetchedAt: EpochMillis(1)))
  }
}


/// Đợi tới khi `store` có `n` lượt ghi bị giữ.
private func parked(_ store: HeldStore, _ n: Int = 1) async {
  for _ in 0..<10_000 where await store.waiting < n { await Task.yield() }
}

/// Các điểm thả lượt ghi muộn của A trong lượt đổi A → B.
enum Release: CaseIterable, CustomStringConvertible {
  /// Trước khi phiên của A kết thúc — lượt ghi là của A, đúng lúc.
  case beforeSessionEnded
  /// Giữa lượt dọn: chốt đã đóng, chưa dọn (`between`).
  case midCleanup
  /// Dọn xong, B chưa mở phiên.
  case afterCleanup
  /// B đã mở phiên.
  case afterNextStarted

  var description: String {
    switch self {
    case .beforeSessionEnded: "trước khi phiên A kết thúc"
    case .midCleanup: "giữa lượt dọn"
    case .afterCleanup: "sau lượt dọn"
    case .afterNextStarted: "sau khi B mở phiên"
    }
  }
}

@MainActor
struct AccountLifecycleTests {
  /// Mở app: chốt đóng; không đọc / ghi được gì cho tới khi phiên mở.
  @Test func launchIsFailClosed() async throws {
    let d = try Device()
    #expect(d.db.accounts.current == .signedOut)
    let c = await d.controller("a")
    #expect(await !c.toggle("b1"), "chưa đăng nhập: ghi bị từ chối")
    #expect(c.unsaved != nil)
    #expect(try d.owners().isEmpty)
    await d.life.sessionStarted(userId: "a", today: today)
    let a = await d.controller("a")
    #expect(await a.toggle("b1"))
    #expect(try d.owners() == ["a"])
  }

  /// Đăng xuất: chốt đóng TRƯỚC bước dọn đầu tiên — lượt ghi của A chạy trong
  /// `between` (lúc hàng đợi đang bị bỏ) đã bị từ chối; sau đó không còn gì.
  @Test func signOutClosesTheScopeBeforeCleanup() async throws {
    let d = try Device()
    await d.life.sessionStarted(userId: "a", today: today)
    let a = await d.controller("a")
    #expect(await a.toggle("b1"))
    try await d.cacheTemplates("a")
    let store = d.store!, accounts = d.db.accounts
    await d.life.sessionEnded(next: nil) {
      #expect(accounts.current == .signedOut, "chốt đóng trước khi dọn")
      await #expect(throws: AccountScopeClosed.self) {
        try await store.saveDay(dayKey, DayState(), userId: "a")
      }
    }
    #expect(try d.owners().isEmpty && d.readCacheUsers().isEmpty)
    #expect(await !a.toggle("b2"), "controller cũ của A không ghi lại được")
    #expect(try d.owners().isEmpty)
  }

  /// Lượt ghi muộn của controller A (tick + chốt buổi) được thả ở MỌI điểm
  /// của lượt đổi A → B: không bao giờ thành ngày / khoá / hàng outbox trên
  /// máy sau khi đổi xong; B dùng cùng khoá ngày và chốt được.
  @Test(arguments: Release.allCases)
  func delayedWriteOfThePreviousAccount(_ when: Release) async throws {
    let d = try Device()
    await d.life.sessionStarted(userId: "a", today: today)
    let held = HeldStore(d.store)
    let a = await d.controller("a", store: held)
    #expect(await a.toggle("b1"))
    await held.hold()
    let lateTick = Task { await a.toggle("b2") }
    await parked(held)
    let release: @MainActor () async -> Void = { await held.release(); _ = await lateTick.value }

    if when == .beforeSessionEnded { await release() }
    let r = Box(release)
    await d.life.sessionEnded(next: "b") { @MainActor in
      if when == .midCleanup { await r.run() }
    }
    if when == .afterCleanup { await release() }
    await d.life.sessionStarted(userId: "b", today: today)
    if when == .afterNextStarted { await release() }

    // Lượt chốt muộn của A (buổi được dựng khi A còn trong phiên), tới sau đổi.
    await #expect(throws: AccountScopeClosed.self) {
      _ = try await d.store.commitFinish(
        dayKey, DayState(progress: DayProgress(), loggedSessionId: "a-late", loggedKeys: ["b1"]),
        OutboxEntry(id: "a-late", userId: "a", kind: WorkoutSessionRecord.outboxKind, payload: .null, createdAt: EpochMillis(0)))
    }
    #expect(try d.owners().isEmpty, "\(when): không còn ngày của A")
    #expect(try d.outboxUsers().isEmpty, "\(when): không có hàng outbox của A")

    let b = await d.controller("b")
    #expect(b.progress.done.isEmpty, "\(when): B không thừa hưởng tick của A")
    #expect(await b.toggle("b1"))
    let summary = try await b.finish()
    #expect(summary.sessionId.hasPrefix("b-"), "\(when): khoá ngày của A không chặn B")
    #expect(try d.owners() == ["b"] && d.outboxUsers() == ["b"])
  }

  /// Đổi thẳng A → B: `SessionStore` đặt phiên B rồi mới chạy lượt dọn của A,
  /// và lượt dọn ấy nhường ở giữa — màn của B có thể mở phiên và GHI trước khi
  /// lượt dọn chạy tiếp. Lượt dọn không được đóng chốt của B, không được xoá
  /// ngày / cache của B. (Trước #455: `clearAll()` xoá luôn tick của B.)
  @Test func nextAccountStartingMidCleanupKeepsItsData() async throws {
    let d = try Device()
    await d.life.sessionStarted(userId: "a", today: today)
    let a = await d.controller("a")
    #expect(await a.toggle("b1"))
    try await d.cacheTemplates("a")

    let life = d.life!
    let b = Box2()
    await life.sessionEnded(next: "B") { @MainActor in
      // Lượt dọn nhường (bỏ hàng đợi); màn của B chạy.
      await life.sessionStarted(userId: "B", today: today)
      b.controller = await d.controller("B")
      #expect(await b.controller!.toggle("b2"))
      try? await d.cacheTemplates("B")
    }
    #expect(d.db.accounts.current == .signedIn("b"), "lượt dọn của A không đóng chốt của B")
    #expect(try d.owners() == ["b"], "ngày của A đi, của B ở lại")
    #expect(try d.readCacheUsers() == ["B"])
    let reloaded = await d.controller("B")
    #expect(reloaded.progress.done == ["b2": true])
    #expect(await reloaded.toggle("b1"), "B vẫn ghi được")
  }

  /// Thứ tự ngược hẳn: B mở phiên và ghi TRƯỚC khi lượt dọn của A bắt đầu.
  /// Lượt dọn vẫn không đóng chốt của B, không xoá của B.
  @Test func nextAccountStartedBeforeCleanupBegins() async throws {
    let d = try Device()
    await d.life.sessionStarted(userId: "a", today: today)
    #expect(await d.controller("a").toggle("b1"))
    await d.life.sessionStarted(userId: "b", today: today)
    let b = await d.controller("b")
    #expect(await b.toggle("b2"))
    await d.life.sessionEnded(next: "b")
    #expect(d.db.accounts.current == .signedIn("b"))
    #expect(try d.owners() == ["b"])
    #expect(await b.toggle("b1"), "B vẫn ghi được sau lượt dọn của A")
  }

  /// Thứ tự thường (dọn của A xong rồi B mới mở phiên): như trên.
  @Test func nextAccountStartingAfterCleanup() async throws {
    let d = try Device()
    await d.life.sessionStarted(userId: "a", today: today)
    #expect(await d.controller("a").toggle("b1"))
    await d.life.sessionEnded(next: "b")
    #expect(d.db.accounts.current == .signedOut, "B chưa mở phiên: chốt đóng")
    #expect(try d.owners().isEmpty)
    await d.life.sessionStarted(userId: "b", today: today)
    let b = await d.controller("b")
    #expect(b.progress.done.isEmpty)
    #expect(await b.toggle("b2"))
    #expect(try d.owners() == ["b"])
  }

  /// Kill / mở lại ở từng ranh giới: mở app luôn là chốt đóng; người cũ mở
  /// phiên lại thấy đúng của mình nếu chưa dọn; người khác không bao giờ thấy.
  @Test func killAndReopenAtEachBoundary() async throws {
    let d = try Device()
    // Kill giữa phiên của A.
    await d.life.sessionStarted(userId: "a", today: today)
    #expect(await d.controller("a").toggle("b1"))
    try d.launch()
    #expect(try await d.store.loadDay(dayKey) == nil, "mở lại: chốt đóng")
    await d.life.sessionStarted(userId: "a", today: today)
    #expect(await d.controller("a").progress.done == ["b1": true], "A mở lại thấy của A")

    // Kill giữa lượt dọn: chốt đã đóng (bước đầu), chưa dọn gì. Ngày của A
    // còn trên đĩa nhưng cách ly: B mở phiên không thấy.
    d.db.accounts.signOut()
    try d.launch()
    #expect(try d.owners() == ["a"])
    await d.life.sessionStarted(userId: "b", today: today)
    #expect(await d.controller("b").progress.done.isEmpty, "B không thấy gì của A")

    // Kill sau khi B chốt buổi; mở lại, B thấy khoá của mình; A thì không.
    let b = await d.controller("b")
    #expect(await b.toggle("b2"))
    _ = try await b.finish()
    try d.launch()
    await d.life.sessionStarted(userId: "b", today: today)
    #expect(await d.controller("b").loggedSessionId != nil)
    await d.life.sessionEnded(next: "a")
    await d.life.sessionStarted(userId: "a", today: today)
    #expect(await d.controller("a").loggedSessionId == nil, "A không thừa hưởng khoá của B")
  }

  /// A → B → A: mỗi lần đổi thẳng; A quay lại không thấy gì của B, không thấy
  /// ngày cũ của chính mình (đã dọn khi phiên kết thúc — #241, không đổi), và
  /// chốt được cùng khoá ngày mà B đã chốt.
  @Test func aThenBThenA() async throws {
    let d = try Device()
    await d.life.sessionStarted(userId: "a", today: today)
    let a1 = await d.controller("a")
    #expect(await a1.toggle("b1"))
    _ = try await a1.finish()

    await d.life.sessionEnded(next: "b")
    await d.life.sessionStarted(userId: "b", today: today)
    let b = await d.controller("b")
    #expect(b.loggedSessionId == nil, "khoá của A không theo sang B")
    #expect(await b.toggle("b2"))
    _ = try await b.finish()
    #expect(await !a1.toggle("b2"), "controller cũ của A không ghi được trong phiên B")

    await d.life.sessionEnded(next: "a")
    await d.life.sessionStarted(userId: "a", today: today)
    let a2 = await d.controller("a")
    #expect(a2.loggedSessionId == nil && a2.progress.done.isEmpty, "A không thấy gì của B")
    #expect(await a2.toggle("b1"))
    let s = try await a2.finish()
    #expect(s.sessionId.hasPrefix("a-"))
    #expect(try d.owners() == ["a"])
  }

  /// #469: mở app (có phiên cũ hay không) không đọc / ghi / dọn gì khi chốt
  /// đóng. Phiên mở: mở chốt, bỏ ngày của người khác (sót lại từ app chết giữa
  /// lượt dọn), rồi dọn ngày cũ CHỈ của người ấy.
  @Test func coldLaunchTouchesNothingUntilTheSessionOpens() async throws {
    let d = try Device()
    let old = DayProgressStore.key(date: today.adding(days: -20), templateId: "tpl")
    for user in ["a", "b"] {
      d.db.accounts.signIn(user)
      try await d.store.saveDay(old, DayState(), userId: user)
      try await d.store.saveDay(dayKey, DayState(), userId: user)
    }
    try d.launch()
    #expect(try d.owners() == ["a", "a", "b", "b"], "mở app không dọn gì")
    await #expect(throws: AccountScopeClosed.self) { try await d.store.pruneDays(today: today) }
    #expect(try d.owners() == ["a", "a", "b", "b"])
    await d.life.sessionStarted(userId: "A", today: today)
    #expect(try d.owners() == ["a"], "của B đi; ngày cũ của A đi; hôm nay của A ở lại")
    #expect(try await d.store.loadDay(dayKey) != nil)
  }

  /// #469: khởi động với phiên đã hết hạn — `SessionStore` báo hết phiên ngay
  /// lúc đọc: dọn hết, chốt vẫn đóng, không có lượt dọn ngày cũ nào chạy.
  @Test func expiredSessionAtStartupClearsAndStaysClosed() async throws {
    let d = try Device()
    d.db.accounts.signIn("a")
    try await d.store.saveDay(dayKey, DayState(), userId: "a")
    try d.launch()
    await d.life.sessionEnded(next: nil)
    #expect(d.db.accounts.current == .signedOut)
    #expect(try d.owners().isEmpty)
    await #expect(throws: AccountScopeClosed.self) { try await d.store.pruneDays(today: today) }
  }
}

/// Giữ closure / controller qua ranh giới `@Sendable` của `between`.
private final class Box: @unchecked Sendable {
  let run: @MainActor () async -> Void
  init(_ run: @escaping @MainActor () async -> Void) { self.run = run }
}
@MainActor
private final class Box2 {
  var controller: WorkoutSessionController?
}
