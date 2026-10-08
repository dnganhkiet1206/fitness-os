import ASCNDCore
import ASCNDTestSupport
import Foundation
import Testing

/// Xoá buổi: hệ quả + đối soát cache qua kill / gửi lại / xoá trùng (#429, D-25).

/// Mọi đường đọc buổi tập của app, đọc thẳng từ bảng `workout_sessions` của
/// server giả — như các nguồn Supabase thật (`id` đi kèm mọi hàng).
private struct ServerReads: HistorySource, PerformanceSource, RecordHistory, TrainingHistory {
  let server: FakeServer
  func rows() async -> [JSONValue] {
    await server.table.values.sorted { ($0["date_time"]?.stringValue ?? "") > ($1["date_time"]?.stringValue ?? "") }
  }
  func sessions(userId: String, since: EpochMillis) async throws -> [JSONValue] { await rows() }
  func sessions(userId: String, since: EpochMillis) async throws -> [SessionHistoryRow] {
    await rows().compactMap { r in
      guard let id = r["id"]?.stringValue, let at = r["date_time"]?.stringValue.flatMap({ EpochMillis(iso8601: $0) })
      else { return nil }
      return SessionHistoryRow(id: id, at: at, sets: r["sets"])
    }
  }
  func recentSessionSets(userId: String, limit: Int) async throws -> [JSONValue] {
    await rows().map { .object(["id": $0["id"] ?? .null, "sets": $0["sets"] ?? .null]) }
  }
  func sessionTimes(userId: String, since: EpochMillis) async throws -> [EpochMillis] {
    await rows().compactMap { $0["date_time"]?.stringValue.flatMap { EpochMillis(iso8601: $0) } }
  }
}

/// Nguồn lịch sử giữ được truy vấn giữa chừng — dựng "chốt / xoá trong lúc
/// lần làm mới đang bay".
private actor HeldSource: HistorySource {
  let rows: [JSONValue]
  private var parked: CheckedContinuation<Void, Never>?
  private var holding = true
  init(_ rows: [JSONValue]) { self.rows = rows }
  var waiting: Bool { parked != nil }
  func release() {
    holding = false
    parked?.resume()
    parked = nil
  }
  func sessions(userId: String, since: EpochMillis) async throws -> [JSONValue] {
    if holding { await withCheckedContinuation { parked = $0 } }
    return rows
  }
}

private actor Templates: TemplateSource, TemplateCache {
  let snapshot: TemplateSnapshot
  var cached: TemplateSnapshot?
  init(_ s: TemplateSnapshot) { snapshot = s }
  func fetch(userId: String) async throws -> TemplateSnapshot { snapshot }
  func load(userId: String) async throws -> TemplateSnapshot? { cached }
  func save(userId: String, _ snapshot: TemplateSnapshot) async throws { cached = snapshot }
}

/// Cache trên "đĩa" — sống qua kill như GRDB.
private actor Disk: RecordBookCache, PerformanceCache, HistoryCache, InsightCache {
  var bests: PersonalRecords.Bests?
  var table: [String: LastPerformance]?
  var history: [HistoryEntry]?
  var insight: InsightSnapshot?
  func load(userId: String) async throws -> PersonalRecords.Bests? { bests }
  func save(userId: String, _ b: PersonalRecords.Bests) async throws { bests = b }
  func load(userId: String) async throws -> [String: LastPerformance]? { table }
  func save(userId: String, _ t: [String: LastPerformance]) async throws { table = t }
  func load(userId: String) async throws -> [HistoryEntry]? { history }
  func save(userId: String, _ e: [HistoryEntry]) async throws { history = e }
  func load(userId: String) async throws -> InsightSnapshot? { insight }
  func save(userId: String, _ s: InsightSnapshot) async throws { insight = s }
}

private let saigon = TimeZone(identifier: "Asia/Ho_Chi_Minh")!
/// 2026-10-05 (Thứ Hai) 14:00 Sài Gòn.
private let now = EpochMillis(1_791_183_600_000)

private func session(_ id: String, _ iso: String, kg: Double, reps: Int = 5) -> OutboxEntry {
  let row: JSONValue = .object([
    "id": .string(id), "user_id": .string("u1"), "date_time": .string(iso), "template_name": .string("Push"),
    "session_rpe": .number(8), "volume_load": .number(kg * Double(reps)), "pr_detected": .bool(false),
    "sets": .array([.object([
      "exerciseId": .string("ex-bench"), "exerciseName": .string("Bench"), "weight": .number(kg), "reps": .number(Double(reps)),
    ])]),
  ])
  return OutboxEntry(id: id, userId: "u1", kind: WorkoutSessionRecord.outboxKind, payload: row, createdAt: EpochMillis(0))
}

@MainActor
private final class Harness {
  let clock = ManualClock(now)
  let server = FakeServer()
  let store = InMemoryWorkoutStore()
  let disk = Disk()
  let templates: Templates
  private(set) var flow: WorkoutFlow!

  init(rest: Bool = true) {
    let tpl = WorkoutTemplate(id: "tpl", name: "Push", exercises: [TemplateExercise(exerciseName: "Bench", sets: 1, reps: 5, weightKg: 60)])
    templates = Templates(TemplateSnapshot(
      routine: [RoutineDay(dayOfWeek: 0, isRest: rest, templateId: rest ? nil : "tpl")], templates: [tpl], fetchedAt: EpochMillis(1)))
    flow = make()
  }

  /// Một lần mở app trên cùng máy (cùng store, cùng đĩa, cùng server).
  func make() -> WorkoutFlow {
    let reads = ServerReads(server: server)
    let today = TodayController(
      userId: "u1", repository: TodayRepository(source: templates, cache: templates, edits: store), history: reads,
      workouts: store, clock: clock, timeZone: saigon)
    return WorkoutFlow(
      today: today, records: RecordBook(userId: "u1", history: reads, cache: disk, pending: store),
      performance: PerformanceBook(userId: "u1", source: reads, cache: disk, clock: clock, timeZone: saigon, pending: store),
      history: HistoryBook(userId: "u1", source: reads, cache: disk, store: store, clock: clock, pending: store),
      insights: InsightBook(userId: "u1", source: reads, cache: disk, clock: clock, timeZone: saigon, pending: store),
      store: store, clock: clock, timeZone: saigon)
  }

  func reopen() { flow = make() }

  /// Server có sẵn: buổi tốt (28/9, 60 kg × 5) và buổi ghi nhầm (hôm nay 07:00
  /// giờ VN, 100 kg thay vì 10).
  func seed() async throws {
    try await server.send(session("s-good", "2026-09-28T03:00:00.000Z", kg: 60))
    try await server.send(session("s-bad", "2026-10-05T00:00:00.000Z", kg: 100))
  }

  func sync() async -> SyncWorker {
    let w = SyncWorker(store: store, remote: server, clock: clock, signedInUser: "u1", sleep: clock.sleeper)
    w.kick()
    await w.settle()
    return w
  }

  var history: HistoryBook { flow.history! }
}

@MainActor
struct DeleteReconcileTests {
  /// Xoá buổi ghi nhầm: lịch sử, "lần trước", phân tích, kỷ lục và ngày "đã
  /// tập" theo ngay — kể cả bảng kỷ lục (buổi 100 kg không còn chặn kỷ lục).
  @Test func deleteReconcilesEveryReadModel() async throws {
    let h = Harness(rest: false)
    try await h.seed()
    await h.flow.start()
    await h.flow.settled()
    #expect(h.flow.records.bests?["bench"]?.topWeight == 100)
    #expect(h.flow.today.plan?.status == .done, "hôm nay có buổi trên server")
    try await h.history.delete("s-bad")
    await h.flow.settled()
    #expect(h.history.entries.map(\.id) == ["s-good"])
    #expect(h.flow.performance.last(for: "Bench")?.sessionId == "s-good")
    #expect(h.flow.insights!.history(for: "Bench").count == 1)
    #expect(h.flow.records.bests?["bench"]?.topWeight == 60, "bảng kỷ lục dựng lại không có buổi đã xoá")
    #expect(h.flow.today.plan?.status != .done)
    #expect(await h.store.outbox.count == 1, "một hàng xoá, chưa gửi")
  }

  /// Kill trước khi kịp gửi, mở lại (server vẫn còn buổi): không model nào
  /// cho buổi đã xoá sống lại. Trước #429 lần làm mới đầu tiên hồi sinh nó.
  @Test func killBeforeSyncDoesNotResurrect() async throws {
    let h = Harness(rest: false)
    try await h.seed()
    await h.flow.start()
    try await h.history.delete("s-bad")
    await h.flow.settled()
    h.reopen()
    await h.flow.start()
    await h.flow.settled()
    #expect(await h.server.table["s-bad"] != nil, "server chưa nhận lệnh xoá")
    #expect(h.history.entries.map(\.id) == ["s-good"])
    #expect(h.flow.performance.last(for: "Bench")?.sessionId == "s-good")
    #expect(h.flow.insights!.history(for: "Bench").map(\.sessionId) == ["s-good"])
    #expect(h.flow.records.bests?["bench"]?.topWeight == 60)
    #expect(h.flow.today.plan?.status != .done, "hôm nay thôi 'đã tập'")
    // Gửi xong: server và máy cùng một sự thật; mở lại lần nữa vẫn vậy.
    _ = await h.sync()
    #expect(await h.server.table["s-bad"] == nil)
    #expect(await h.store.outbox.isEmpty)
    h.reopen()
    await h.flow.start()
    await h.flow.settled()
    #expect(h.history.entries.map(\.id) == ["s-good"])
    #expect(h.flow.records.bests?["bench"]?.topWeight == 60)
  }

  /// Lệnh xoá mất phản hồi (server ĐÃ xoá) → gửi lại → xoá hàng đã mất không
  /// phải lỗi: hàng đợi trống, không có hàng chết.
  @Test func lostResponseRetryIsIdempotent() async throws {
    let h = Harness()
    try await h.seed()
    await h.flow.start()
    try await h.history.delete("s-bad")
    let entry = try #require(await h.store.outbox.first)
    await h.server.script(entry.id, .lostResponse)
    let w = await h.sync()
    _ = w
    #expect(await h.server.attempts.filter { $0 == entry.id }.count == 2)
    #expect(await h.server.table["s-bad"] == nil)
    #expect(await h.store.outbox.isEmpty)
    #expect(await h.store.deadEntries.isEmpty)
  }

  /// Bấm xoá hai lần: lần hai không tìm thấy, không có hàng outbox thứ hai.
  @Test func duplicateDeleteIsRefused() async throws {
    let h = Harness()
    try await h.seed()
    await h.flow.start()
    try await h.history.delete("s-bad")
    await #expect(throws: HistoryBook.DeleteRefusal.notFound) { try await h.history.delete("s-bad") }
    #expect(await h.store.outbox.count == 1)
  }

  /// Ngày có HAI buổi: xoá một thì ngày vẫn "đã tập" (bỏ đúng một buổi).
  @Test func dayWithAnotherSessionStaysTrained() async throws {
    let h = Harness(rest: false)
    try await h.seed()
    try await h.server.send(session("s-real", "2026-10-05T01:00:00.000Z", kg: 60))
    await h.flow.start()
    try await h.history.delete("s-bad")
    await h.flow.settled()
    h.reopen()
    await h.flow.start()
    await h.flow.settled()
    #expect(h.flow.today.plan?.status == .done)
  }

  /// Buổi vừa chốt mà chưa gửi: lần làm mới (và mở lại app) không làm nó biến
  /// khỏi lịch sử — trước #429 bản server thay hẳn danh sách.
  @Test func unsyncedFinishSurvivesRefreshAndReopen() async throws {
    let h = Harness(rest: false)
    try await h.server.send(session("s-good", "2026-09-28T03:00:00.000Z", kg: 60))
    await h.flow.start()
    let s = try #require(h.flow.session)
    await s.toggle("0-0")
    _ = try await h.flow.finish()
    await h.flow.settled()
    let fresh = try #require(h.history.entries.first { $0.id != "s-good" })
    await h.history.refresh()
    #expect(h.history.entries.contains { $0.id == fresh.id })
    h.reopen()
    await h.flow.start()
    await h.flow.settled()
    #expect(h.history.entries.contains { $0.id == fresh.id })
    #expect(h.flow.performance.last(for: "Bench")?.sessionId == fresh.id)
  }

  /// Người khác không xoá được buổi của mình: lịch sử theo người dùng, và
  /// `bob` không có buổi `s-bad` để xoá.
  @Test func wrongUserCannotDelete() async throws {
    let h = Harness()
    try await h.seed()
    let bob = HistoryBook(
      userId: "bob", source: ServerReads(server: h.server), cache: Disk(), store: h.store, clock: h.clock, pending: h.store)
    await #expect(throws: HistoryBook.DeleteRefusal.notFound) { try await bob.delete("s-bad") }
    #expect(await h.store.outbox.isEmpty)
  }

  /// Chốt và xoá tới trong lúc lần làm mới đang bay (bản server chụp TRƯỚC
  /// chúng): cả hai còn nguyên sau khi bản server về.
  @Test func changesDuringAnInFlightRefreshAreKept() async throws {
    let src = HeldSource([session("s-good", "2026-09-28T03:00:00.000Z", kg: 60).payload,
                          session("s-bad", "2026-10-05T00:00:00.000Z", kg: 100).payload])
    let store = InMemoryWorkoutStore()
    let book = HistoryBook(userId: "u1", source: src, cache: Disk(), store: store, clock: ManualClock(now), pending: store)
    let refresh = Task { await book.refresh() }
    while !(await src.waiting) { await Task.yield() }
    // Đã gửi xong (không còn trong outbox) nhưng bản server đang bay chưa thấy.
    await book.absorb(session("s-new", "2026-10-05T05:00:00.000Z", kg: 62))
    await book.absorb(OutboxEntry(
      id: "s-bad@del-1", userId: "u1", kind: WorkoutSessionRecord.deleteKind,
      payload: .object(["id": .string("s-bad")]), createdAt: EpochMillis(0)))
    await src.release()
    await refresh.value
    #expect(Set(book.entries.map(\.id)) == ["s-good", "s-new"])
  }

  /// Lớp phủ thuần: áp theo thứ tự hàng đợi, áp lại là không đổi gì.
  @Test func overlayIsOrderedAndIdempotent() {
    let a = session("a", "2026-10-01T00:00:00.000Z", kg: 50).payload
    let b = session("b", "2026-10-02T00:00:00.000Z", kg: 70).payload
    let bRevised = session("b", "2026-10-02T00:00:00.000Z", kg: 75).payload
    let changes: [SessionChange] = [.upsert(bRevised), .delete(id: "A", at: nil)]
    let once = PendingSessions.apply(changes, to: [a, b])
    #expect(once == [bRevised])
    #expect(PendingSessions.apply(changes, to: once) == once)
    let other = OutboxEntry(id: "x", userId: "u2", kind: WorkoutSessionRecord.deleteKind, payload: .object(["id": .string("b")]), createdAt: EpochMillis(0))
    #expect(PendingSessions.changes([other], userId: "u1").isEmpty, "hàng của người khác không phủ lên")
  }
}
