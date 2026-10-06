import ASCNDCore
import ASCNDTestSupport
import Foundation
import Testing

private actor Source: HistorySource {
  var rows: [JSONValue]
  var down = false
  private(set) var lastSince: EpochMillis?
  init(_ rows: [JSONValue]) { self.rows = rows }
  func set(_ r: [JSONValue]) { rows = r }
  func setDown(_ d: Bool) { down = d }
  func sessions(userId: String, since: EpochMillis) async throws -> [JSONValue] {
    lastSince = since
    if down { throw URLError(.notConnectedToInternet) }
    return rows
  }
}
private actor Cache: HistoryCache {
  var store: [String: [HistoryEntry]] = [:]
  func load(userId: String) async throws -> [HistoryEntry]? { store[userId] }
  func save(userId: String, _ entries: [HistoryEntry]) async throws { store[userId] = entries }
}

private func row(_ id: String, _ iso: String, sets: String = #"[{"exerciseName":"Bench","weight":60,"reps":8}]"#) -> JSONValue {
  try! JSONDecoder().decode(JSONValue.self, from: Data("""
    {"id":"\(id)","date_time":"\(iso)","template_name":"Push","session_rpe":8,"volume_load":480,"pr_detected":false,"sets":\(sets)}
    """.utf8))
}

private let clock = ManualClock(EpochMillis(1_791_183_600_000))  // 2026-10-05 07:00Z

@MainActor
private func book(_ source: Source, cache: Cache = Cache(), store: InMemoryWorkoutStore = InMemoryWorkoutStore(), user: String = "u1") -> HistoryBook {
  HistoryBook(userId: user, source: source, cache: cache, store: store, clock: clock, makeId: { UUID().uuidString })
}

/// #400 — vector D-25 (WH-*).
@MainActor
struct HistoryBookTests {
  @Test func newestFirstNinetyDays() async throws {
    let src = Source([
      row("s1", "2026-10-03T18:00:00.000Z"), row("s2", "2026-10-05T18:00:00.000Z"), row("s3", "2026-10-04T18:00:00.000Z"),
    ])
    let b = book(src)
    await b.load()
    #expect(b.entries.map(\.id) == ["s2", "s3", "s1"], "WH-1a")
    #expect(await src.lastSince == EpochMillis(1_791_183_600_000 - 90 * 86_400_000), "cửa sổ 90 ngày (sessions.tsx:27)")
  }

  @Test func emptyHistory() async {
    let b = book(Source([]))
    await b.load()
    #expect(b.entries.isEmpty && b.loaded, "WH-1c")
  }

  /// Đếm như màn Tổng kết: không tính khởi động; số bài theo tên đã chuẩn hoá.
  @Test func rowsCountLikeTheSummary() async throws {
    let sets = #"""
      [{"exerciseName":"Bench","weight":40,"reps":10,"warmup":true},{"exerciseName":"Bench","weight":60,"reps":8},
       {"exerciseName":" bench ","weight":60,"reps":7},{"exerciseName":"Plank","weight":0,"reps":0,"durationSec":45}]
      """#
    let e = try #require(HistoryEntry(row: row("S1", "2026-10-05T07:00:00Z", sets: sets)))
    #expect(e.id == "s1")
    #expect(e.completedSets == 3)
    #expect(e.exerciseCount == 2)
    #expect(e.volumeKg == 480 && e.sessionRpe == 8 && !e.prDetected && e.templateName == "Push")
    #expect(HistoryEntry(row: .object(["id": .string("x")])) == nil, "không thời điểm → bỏ")
  }

  /// Offline: cache hiện ngay, lỗi có kiểu.
  @Test func offlineShowsCache() async {
    let cache = Cache()
    let src = Source([row("s1", "2026-10-05T07:00:00Z")])
    await book(src, cache: cache).load()
    await src.setDown(true)
    let b = book(src, cache: cache)
    await b.load()
    #expect(b.entries.map(\.id) == ["s1"])
    #expect(b.failure == .offline)
  }

  /// Cache theo người dùng (WH-1b): người khác không thấy lịch sử của mình.
  @Test func cacheIsPerUser() async {
    let cache = Cache()
    let src = Source([row("s1", "2026-10-05T07:00:00Z")])
    await book(src, cache: cache, user: "alice").load()
    await src.setDown(true)
    let bob = book(src, cache: cache, user: "bob")
    await bob.load()
    #expect(bob.entries.isEmpty)
  }

  /// Buổi vừa chốt hiện ngay, không chờ sync (WH-4a); bản ghi lại thay dòng.
  @Test func finishedSessionAppearsImmediately() async {
    let b = book(Source([row("s1", "2026-10-04T07:00:00Z")]))
    await b.load()
    let fresh = OutboxEntry(id: "new", userId: "u1", kind: WorkoutSessionRecord.outboxKind, payload: row("new", "2026-10-05T06:00:00Z"), createdAt: EpochMillis(0))
    await b.absorb(fresh)
    #expect(b.entries.map(\.id) == ["new", "s1"])
    let revised = OutboxEntry(
      id: "new@r1", userId: "u1", kind: WorkoutSessionRecord.revisionKind,
      payload: row("new", "2026-10-05T06:00:00Z", sets: #"[{"exerciseName":"Bench","weight":60,"reps":8},{"exerciseName":"Row","weight":50,"reps":10}]"#),
      createdAt: EpochMillis(0))
    await b.absorb(revised)
    #expect(b.entries.count == 2)
    #expect(b.entries.first?.exerciseCount == 2)
  }

  /// Xoá (WH-2a): biến ngay; một hàng outbox xoá theo id; mở khoá ngày đã chốt
  /// bằng buổi ấy trên máy; làm mới khi server chưa nhận lệnh xoá không hồi
  /// sinh nó.
  @Test func deleteIsImmediateDurableAndUnlocksTheDay() async throws {
    let src = Source([row("s1", "2026-10-05T07:00:00Z"), row("s2", "2026-10-04T07:00:00Z")])
    let store = InMemoryWorkoutStore(days: ["2026-10-05:tpl": DayState(loggedSessionId: "s1", loggedKeys: ["0-0"])])
    let b = book(src, store: store)
    await b.load()
    try await b.delete("s1")
    #expect(b.entries.map(\.id) == ["s2"])
    let entry = try #require(await store.outbox.last)
    #expect(entry.kind == WorkoutSessionRecord.deleteKind)
    #expect(entry.payload == .object(["id": .string("s1")]))
    #expect(entry.id.hasPrefix("s1@"))
    #expect(await store.days["2026-10-05:tpl"]?.loggedKeys == [], "ngày thôi giữ set nào trong buổi")
    await b.refresh()
    #expect(b.entries.map(\.id) == ["s2"], "server chưa nhận lệnh xoá: không hồi sinh")
  }

  /// Xoá lần hai (WH-2c) / buổi không có trong lịch sử của mình (WH-2b):
  /// từ chối, không ghi gì.
  @Test func deleteTwiceOrForeignIsRefused() async throws {
    let store = InMemoryWorkoutStore()
    let b = book(Source([row("s1", "2026-10-05T07:00:00Z")]), store: store)
    await b.load()
    try await b.delete("s1")
    await #expect(throws: HistoryBook.DeleteRefusal.notFound) { try await b.delete("s1") }
    await #expect(throws: HistoryBook.DeleteRefusal.notFound) { try await b.delete("someone-else") }
    #expect(await store.outbox.count == 1)
  }

  @Test func failedDeleteChangesNothing() async throws {
    let store = InMemoryWorkoutStore()
    let b = book(Source([row("s1", "2026-10-05T07:00:00Z")]), store: store)
    await b.load()
    await store.failNext()
    await #expect(throws: HistoryBook.DeleteRefusal.self) { try await b.delete("s1") }
    #expect(b.entries.map(\.id) == ["s1"])
    #expect(await store.outbox.isEmpty)
  }
}
