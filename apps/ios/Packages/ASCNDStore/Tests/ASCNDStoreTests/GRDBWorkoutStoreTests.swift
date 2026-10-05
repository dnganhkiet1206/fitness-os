import ASCNDCore
@testable import ASCNDStore
import Foundation
import Testing

private func entry(_ id: String) -> OutboxEntry {
  OutboxEntry(id: id, userId: "u1", kind: "workout", payload: .object(["id": .string(id)]), createdAt: EpochMillis(0))
}

private func ticked(_ keys: String...) -> DayState {
  var p = DayProgress()
  for k in keys { p.done[k] = true }
  return DayState(progress: p)
}

private func tempPath() -> String {
  FileManager.default.temporaryDirectory.appendingPathComponent("ascnd-\(UUID().uuidString).sqlite").path
}

/// Hợp đồng `WorkoutStore` trên SQLite thật — cùng các điều mà store giả của
/// ASCNDCore giữ, để test của controller nói đúng về bản chạy trên máy.
struct GRDBWorkoutStoreTests {
  @Test func saveThenLoad() async throws {
    let store = GRDBWorkoutStore(try ASCNDDatabase())
    #expect(try await store.loadDay("k") == nil)
    try await store.saveDay("k", ticked("a"))
    try await store.saveDay("k", ticked("a", "b"))
    #expect(try await store.loadDay("k")?.progress.done == ["a": true, "b": true])
  }

  /// "Kill app": mở lại cùng tệp, ngày còn nguyên.
  @Test func survivesReopen() async throws {
    let path = tempPath()
    defer { try? FileManager.default.removeItem(atPath: path) }
    do {
      let store = GRDBWorkoutStore(try ASCNDDatabase(path: path))
      try await store.saveDay("k", ticked("a"))
    }
    let reopened = GRDBWorkoutStore(try ASCNDDatabase(path: path))
    #expect(try await reopened.loadDay("k")?.progress.done == ["a": true])
  }

  /// Một transaction: sau khi trả về, CẢ hàng outbox (worker thấy qua
  /// `OutboxStore` trên cùng database) LẪN ngày đã chốt đều có.
  @Test func commitFinishWritesBothSides() async throws {
    let db = try ASCNDDatabase()
    let store = GRDBWorkoutStore(db)
    var s = ticked("a")
    s.loggedSessionId = "s1"
    #expect(try await store.commitFinish("k", s, entry("s1")))
    #expect(try await store.loadDay("k")?.loggedSessionId == "s1")
    #expect(try OutboxStore(db).load().pending.map(\.id) == ["s1"])
  }

  @Test func commitFinishIsIdempotentById() async throws {
    let db = try ASCNDDatabase()
    let store = GRDBWorkoutStore(db)
    let s = DayState(loggedSessionId: "s1")
    #expect(try await store.commitFinish("k", s, entry("s1")))
    #expect(try await store.commitFinish("k", s, entry("s1")) == false)
    #expect(try OutboxStore(db).load().pending.count == 1)
  }

  /// Ngày đã chốt là khoá: id khác không chèn buổi thứ hai, bản chụp không
  /// mang id không mở khoá được — và cả hai KHÔNG ghi gì.
  @Test func loggedDayIsLocked() async throws {
    let db = try ASCNDDatabase()
    let store = GRDBWorkoutStore(db)
    try await store.commitFinish("k", DayState(progress: ticked("a").progress, loggedSessionId: "s1"), entry("s1"))

    await #expect(throws: DayAlreadyLogged(sessionId: "s1")) {
      try await store.commitFinish("k", DayState(loggedSessionId: "s2"), entry("s2"))
    }
    await #expect(throws: DayAlreadyLogged(sessionId: "s1")) {
      try await store.saveDay("k", ticked("b"))
    }
    #expect(try OutboxStore(db).load().pending.map(\.id) == ["s1"])
    let day = try await store.loadDay("k")
    #expect(day?.loggedSessionId == "s1")
    #expect(day?.progress.done == ["a": true])
  }

  /// Đăng xuất: ngày đã chốt của người trước không còn khoá người sau.
  @Test func clearAllDropsEveryDayIncludingLocks() async throws {
    let db = try ASCNDDatabase()
    let store = GRDBWorkoutStore(db)
    try await store.commitFinish("k", DayState(loggedSessionId: "s1"), entry("s1"))
    try await store.saveDay("k2", ticked("a"))
    #expect(try await store.clearAll() == 2)
    #expect(try await store.loadDay("k") == nil)
    try await store.commitFinish("k", DayState(loggedSessionId: "s2"), entry("s2"))
    #expect(try await store.loadDay("k")?.loggedSessionId == "s2")
  }

  @Test func pruneKeepsFourteenDays() async throws {
    let store = GRDBWorkoutStore(try ASCNDDatabase())
    let today = try #require(LocalDate("2026-10-05"))
    for back in [0, 13, 14, 30] {
      try await store.saveDay(DayProgressStore.key(date: today.adding(days: -back), templateId: "t"), ticked("a"))
    }
    #expect(try await store.pruneDays(today: today) == 2)
    #expect(try await store.loadDay(DayProgressStore.key(date: today.adding(days: -13), templateId: "t")) != nil)
    #expect(try await store.loadDay(DayProgressStore.key(date: today.adding(days: -14), templateId: "t")) == nil)
  }
}

/// Màn tập trên SQLite thật, đầu tới cuối: tick → chốt → kill → mở lại.
@MainActor
struct WorkoutFlowOnSQLiteTests {
  private let rows = [
    PlannedSet(key: "b1", exerciseId: "ex-bench", exerciseName: "Bench Press", ordinal: 1, of: 2, weightKg: 60, reps: 8, plannedRest: 90),
    PlannedSet(key: "b2", exerciseId: "ex-bench", exerciseName: "Bench Press", ordinal: 2, of: 2, weightKg: 60, reps: 8, plannedRest: 90),
  ]
  private let utc = TimeZone(identifier: "UTC")!

  private struct Clock: WallClock {
    func now() -> Date { Date(timeIntervalSince1970: 1_791_216_000) } // 2026-10-05T16:00:00Z
  }

  private func controller(_ db: ASCNDDatabase, id: String) async -> WorkoutSessionController {
    let c = WorkoutSessionController(
      plan: .init(date: LocalDate("2026-10-05")!, templateId: "tpl", templateName: "Push A", rows: rows),
      userId: "u1", store: GRDBWorkoutStore(db), clock: Clock(), timeZone: utc, makeId: { id })
    await c.load()
    return c
  }

  @Test func tickFinishKillReopen() async throws {
    let path = tempPath()
    defer { try? FileManager.default.removeItem(atPath: path) }
    let sessionId: String
    do {
      let db = try ASCNDDatabase(path: path)
      let c = await controller(db, id: "sess-a")
      #expect(await c.toggle("b1"))
      #expect(await c.setRepsText("10", for: "b1"))
      // Kill giữa buổi.
      let mid = await controller(try ASCNDDatabase(path: path), id: "unused")
      #expect(mid.progress.done["b1"] == true)
      #expect(mid.performed(rows[0]).reps == 10)
      sessionId = try await c.finish().sessionId
    }
    let db = try ASCNDDatabase(path: path)
    let c = await controller(db, id: "sess-b")
    #expect(c.phase == .finished(sessionId: sessionId))
    #expect(!c.canFinish)
    let pending = try OutboxStore(db).load().pending
    #expect(pending.map(\.id) == ["sess-a"])
    #expect(pending.first?.payload["volume_load"] == .number(600))
  }

  /// Worker đã nạp hàng đợi TRƯỚC khi chốt; nó gửi xong một hàng cũ và ghi
  /// bước của nó SAU khi chốt. Buổi vừa chốt vẫn còn — cùng tệp, hai store.
  @Test func workerStepDoesNotEatAFreshSession() async throws {
    let db = try ASCNDDatabase()
    let outbox = OutboxStore(db)
    try outbox.append(OutboxEntry(id: "old", userId: "u1", kind: "water", payload: .null, createdAt: EpochMillis(0)))
    var box = try outbox.load()

    let c = await controller(db, id: "sess-a")
    await c.toggle("b1")
    _ = try await c.finish()

    _ = box.next(now: EpochMillis(0), online: true, signedInUser: "u1")
    box.succeeded(id: "old")
    try outbox.persist(box, settled: ["old"])
    #expect(try outbox.load().pending.map(\.id) == ["sess-a"])
  }
}

/// Server giả tối thiểu: nhận theo id (upsert `ignoreDuplicates`).
private actor Server: RemoteWriter {
  var rows: [String: JSONValue] = [:]
  func send(_ entry: OutboxEntry) async throws(WriteFailure) {
    if rows[entry.id] == nil { rows[entry.id] = entry.payload }
  }
}

/// Đầu-cuối trên SQLite thật: chốt OFFLINE → kill → mở lại → có mạng → buổi
/// lên server đúng một lần, hàng đợi trên đĩa rỗng.
@MainActor
struct OfflineFinishThenSyncTests {
  @Test func finishOfflineKillReopenSync() async throws {
    let path = tempPath()
    defer { try? FileManager.default.removeItem(atPath: path) }
    let server = Server()
    let rows = [PlannedSet(key: "b1", exerciseId: "ex", exerciseName: "Bench", ordinal: 1, of: 1, weightKg: 60, reps: 8, plannedRest: 0)]
    do {
      let db = try ASCNDDatabase(path: path)
      let worker = SyncWorker(store: OutboxStore(db), remote: server, online: false, signedInUser: "u1")
      let c = WorkoutSessionController(
        plan: .init(date: LocalDate("2026-10-05")!, templateId: "t", templateName: "Push", rows: rows),
        userId: "u1", store: GRDBWorkoutStore(db), timeZone: TimeZone(identifier: "UTC")!,
        makeId: { "sess-1" }, onEnqueued: { _ in worker.kick() })
      await c.load()
      await c.toggle("b1")
      _ = try await c.finish()
      await worker.settle()
      #expect(await server.rows.isEmpty)
    }
    let db = try ASCNDDatabase(path: path)
    let worker = SyncWorker(store: OutboxStore(db), remote: server, online: false, signedInUser: "u1")
    worker.setOnline(true)
    await worker.settle()
    #expect(await server.rows.keys.sorted() == ["sess-1"])
    #expect(try OutboxStore(db).load().pending.isEmpty)
  }
}

struct GRDBTemplateCacheTests {
  private let snap = TemplateSnapshot(
    routine: [RoutineDay(dayOfWeek: 0, isRest: false, isDeload: true, templateId: "t1")],
    templates: [WorkoutTemplate(id: "t1", name: "Push", exercises: [
      TemplateExercise(exerciseId: "b", exerciseName: "Bench", sets: 3, reps: 8, weightKg: 62.5, rpe: 8, restSeconds: 120),
    ])],
    fetchedAt: EpochMillis(1_791_216_000_000))

  @Test func roundTripPerUserAndSurvivesReopen() async throws {
    let path = tempPath()
    defer { try? FileManager.default.removeItem(atPath: path) }
    do {
      let cache = GRDBTemplateCache(try ASCNDDatabase(path: path))
      #expect(try await cache.load(userId: "u1") == nil)
      try await cache.save(userId: "u1", snap)
    }
    let cache = GRDBTemplateCache(try ASCNDDatabase(path: path))
    #expect(try await cache.load(userId: "u1") == snap)
    #expect(try await cache.load(userId: "u2") == nil)
    try await cache.clearAll()
    #expect(try await cache.load(userId: "u1") == nil)
  }
}

struct GRDBRecordBookCacheTests {
  @Test func roundTripPerUserAndClearedWithReadCache() async throws {
    let db = try ASCNDDatabase()
    let cache = GRDBRecordBookCache(db)
    let bests = PersonalRecords.bests(from: [RecordSet(exerciseName: "Bench", weightKg: 100, reps: 5)])
    try await cache.save(userId: "u1", bests)
    #expect(try await cache.load(userId: "u1") == bests)
    #expect(try await cache.load(userId: "u2") == nil)
    // Đăng xuất xoá cả bảng read_cache (GRDBTemplateCache.clearAll).
    try await GRDBTemplateCache(db).clearAll()
    #expect(try await cache.load(userId: "u1") == nil)
  }
}
