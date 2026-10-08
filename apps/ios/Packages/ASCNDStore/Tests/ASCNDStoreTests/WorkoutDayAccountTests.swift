import ASCNDCore
@testable import ASCNDStore
import Foundation
import GRDB
import Testing

/// `workout_day` theo tài khoản (#452).

private let today = LocalDate("2026-10-05")!
private let key = DayProgressStore.key(date: today, templateId: "tpl")

private func ticks(_ done: [String]) -> DayProgress {
  var p = DayProgress()
  for k in done { p.done[k] = true }
  return p
}

private func progress(_ done: [String] = ["0-0"]) -> DayState { DayState(progress: ticks(done)) }

private func logged(_ sessionId: String) -> DayState {
  DayState(progress: ticks(["0-0"]), loggedSessionId: sessionId, loggedKeys: ["0-0"])
}

private func entry(_ id: String, user: String) -> OutboxEntry {
  OutboxEntry(
    id: id, userId: user, kind: WorkoutSessionRecord.outboxKind, payload: .object(["id": .string(id)]),
    createdAt: EpochMillis(0))
}

private func outboxCount(_ db: ASCNDDatabase) throws -> Int {
  try db.queue.read { try Int.fetchOne($0, sql: "SELECT COUNT(*) FROM outbox") ?? 0 }
}

private func owners(_ db: ASCNDDatabase) throws -> [String] {
  try db.queue.read { try String.fetchAll($0, sql: "SELECT userId FROM workout_day ORDER BY userId") }
}

private func tempPath() -> String {
  FileManager.default.temporaryDirectory.appendingPathComponent("wd-\(UUID().uuidString).sqlite").path
}

struct WorkoutDayAccountTests {
  /// A ghi ngày; B (đổi thẳng tài khoản) không đọc được, có ngày riêng cùng
  /// khoá, chốt được dù A đã chốt; A quay lại thấy đúng của A.
  @Test func accountsNeverSeeEachOthersDays() async throws {
    let db = try ASCNDDatabase()
    let store = GRDBWorkoutStore(db)
    db.accounts.signIn("a")
    _ = try await store.commitFinish(key, logged("sa"), entry("sa", user: "a"))
    db.accounts.signIn("b")
    #expect(try await store.loadDay(key) == nil, "B không đọc được ngày của A")
    try await store.saveDay(key, progress(["0-1"]))
    _ = try await store.commitFinish(key, logged("sb"), entry("sb", user: "b"))
    #expect(try await store.loadDay(key)?.loggedSessionId == "sb", "khoá ngày của A không chặn B")
    db.accounts.signIn("a")
    #expect(try await store.loadDay(key)?.loggedSessionId == "sa")
    #expect(try owners(db) == ["a", "b"])
  }

  /// Đăng xuất: lượt ghi muộn bị từ chối TRƯỚC khi có gì bền — không dựng lại
  /// ngày, không chèn hàng outbox (giao dịch chốt vẫn là tất-cả-hoặc-không).
  @Test func lateWriteAfterSignOutIsRefusedAtomically() async throws {
    let db = try ASCNDDatabase()
    let store = GRDBWorkoutStore(db)
    db.accounts.signIn("a")
    try await store.saveDay(key, progress())
    db.accounts.signOut()
    _ = try await store.clearAll()
    await #expect(throws: AccountScopeClosed.self) { try await store.saveDay(key, progress(["0-0", "0-1"])) }
    await #expect(throws: AccountScopeClosed.self) {
      _ = try await store.commitFinish(key, logged("late"), entry("late", user: "a"))
    }
    await #expect(throws: AccountScopeClosed.self) { try await store.commitDelete(sessionId: "x", entry("x@del", user: "a")) }
    #expect(try await store.loadDay(key) == nil)
    #expect(try owners(db).isEmpty)
    #expect(try outboxCount(db) == 0)
  }

  /// Hai controller cùng chốt một ngày của CÙNG người: khoá ngày giữ nguyên.
  @Test func dayLockStillHoldsWithinAnAccount() async throws {
    let db = try ASCNDDatabase()
    let store = GRDBWorkoutStore(db)
    db.accounts.signIn("a")
    async let first: Error? = { do { _ = try await store.commitFinish(key, logged("s1"), entry("s1", user: "a")); return nil } catch { return error } }()
    async let second: Error? = { do { _ = try await store.commitFinish(key, logged("s2"), entry("s2", user: "a")); return nil } catch { return error } }()
    let errors = await [first, second]
    #expect(errors.filter { $0 == nil }.count == 1)
    #expect(errors.contains { $0 is DayAlreadyLogged })
    #expect(try outboxCount(db) == 1)
  }

  /// Xoá buổi chỉ mở khoá ngày của chính chủ.
  @Test func commitDeleteTouchesOnlyTheOwnersDays() async throws {
    let db = try ASCNDDatabase()
    let store = GRDBWorkoutStore(db)
    db.accounts.signIn("b")
    _ = try await store.commitFinish(key, logged("same"), entry("same-b", user: "b"))
    db.accounts.signIn("a")
    _ = try await store.commitFinish(key, logged("same"), entry("same-a", user: "a"))
    try await store.commitDelete(sessionId: "same", entry("same@del", user: "a"))
    #expect(try await store.loadDay(key)?.loggedKeys == [])
    db.accounts.signIn("b")
    #expect(try await store.loadDay(key)?.loggedKeys == ["0-0"], "ngày của B không bị đụng")
  }

  /// Kill / mở lại cùng tệp: mỗi người thấy đúng của mình; chưa đăng nhập
  /// (lúc vừa mở app, `AppServices` đóng chốt) thì không thấy gì.
  @Test func killAndReopenKeepsOwnership() async throws {
    let path = tempPath()
    defer { try? FileManager.default.removeItem(atPath: path) }
    do {
      let db = try ASCNDDatabase(path: path)
      db.accounts.signIn("a")
      try await GRDBWorkoutStore(db).saveDay(key, progress(["0-0", "0-1"]))
    }
    let db = try ASCNDDatabase(path: path)
    let store = GRDBWorkoutStore(db)
    db.accounts.signOut()
    #expect(try await store.loadDay(key) == nil)
    db.accounts.signIn("b")
    #expect(try await store.loadDay(key) == nil)
    db.accounts.signIn("A")
    #expect(try await store.loadDay(key)?.progress.done.count == 2)
  }

  /// Nâng cấp từ bản cũ (v3: `workout_day` không có chủ): hàng cũ được giữ
  /// nhưng KHÔNG gán cho ai — không người đăng nhập nào (kể cả chế độ không
  /// chốt) đọc / ghi / chốt / xoá được chúng; dọn theo tuổi vẫn dọn.
  @Test func legacyRowsAreKeptButNeverAdopted() async throws {
    let path = tempPath()
    defer { try? FileManager.default.removeItem(atPath: path) }
    let stale = DayProgressStore.key(date: today.adding(days: -30), templateId: "tpl")
    do {
      let queue = try DatabaseQueue(path: path)
      try ASCNDDatabase.migrator.migrate(queue, upTo: "v3-read-cache")
      let fresh = try OutboxStore.json(logged("legacy-session"))
      try await queue.write { db in
        try db.execute(sql: "INSERT INTO workout_day (key, state) VALUES (?, ?)", arguments: [key, fresh])
        try db.execute(sql: "INSERT INTO workout_day (key, state) VALUES (?, ?)", arguments: [stale, fresh])
      }
    }
    let db = try ASCNDDatabase(path: path)
    let store = GRDBWorkoutStore(db)
    #expect(try owners(db) == [AccountScope.legacyOwner, AccountScope.legacyOwner], "giữ lại, không xoá")
    #expect(try await store.loadDay(key) == nil, "chế độ không chốt cũng không thấy")
    db.accounts.signIn("a")
    #expect(try await store.loadDay(key) == nil, "người đăng nhập kế tiếp không nhận ngày cũ")
    // Khoá "đã chốt" của hàng cũ không chặn người mới.
    _ = try await store.commitFinish(key, logged("mine"), entry("mine", user: "a"))
    #expect(try await store.loadDay(key)?.loggedSessionId == "mine")
    try await store.commitDelete(sessionId: "legacy-session", entry("legacy-session@del", user: "a"))
    let legacyState = try await db.queue.read { db in
      try String.fetchOne(db, sql: "SELECT state FROM workout_day WHERE userId = ? AND key = ?", arguments: [AccountScope.legacyOwner, key])
    }
    #expect(legacyState?.contains("\"loggedKeys\":[\"0-0\"]") == true, "xoá của A không chạm hàng cũ")
    #expect(try await store.pruneDays(today: today) == 1, "dọn theo tuổi gồm cả hàng cũ")
    #expect(try owners(db).sorted() == [AccountScope.legacyOwner, "a"])
  }

  /// Dọn 14 ngày theo tuổi, mọi chủ — chạy lúc mở app khi chưa ai đăng nhập.
  @Test func pruneIsByAgeAcrossOwners() async throws {
    let db = try ASCNDDatabase()
    let store = GRDBWorkoutStore(db)
    let old = DayProgressStore.key(date: today.adding(days: -20), templateId: "tpl")
    for user in ["a", "b"] {
      db.accounts.signIn(user)
      try await store.saveDay(old, progress())
      try await store.saveDay(key, progress())
    }
    db.accounts.signOut()
    #expect(try await store.pruneDays(today: today) == 2)
    #expect(try owners(db) == ["a", "b"])
  }
}
