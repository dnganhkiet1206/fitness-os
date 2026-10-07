@testable import ASCNDCore
import ASCNDTestSupport
import Foundation
import Testing

/// Read model của Exercise Insights (#419): local-first, theo người dùng,
/// theo kịp buổi vừa chốt / vừa xoá. Công thức đã khớp RN ở golden test.

private let saigon = TimeZone(identifier: "Asia/Ho_Chi_Minh")!
/// 2026-10-05 14:00 Sài Gòn.
private let now: Int64 = 1_791_183_600_000
private let day: Int64 = 86_400_000

private func set(_ name: String, _ kg: Double, _ reps: Int) -> JSONValue {
  .object(["exerciseName": .string(name), "weight": .number(kg), "reps": .number(Double(reps))])
}
private func row(_ id: String, daysAgo: Int64, _ sets: [JSONValue]) -> SessionHistoryRow {
  SessionHistoryRow(id: id, at: EpochMillis(now - daysAgo * day), sets: .array(sets))
}
/// Bench lên đều: 60 → 62.5 → 65 → 67.5 (×5).
private let benchRows = [
  row("s1", daysAgo: 12, [set("Bench", 60, 5)]),
  row("s2", daysAgo: 9, [set("Bench", 62.5, 5)]),
  row("s3", daysAgo: 6, [set("Bench", 65, 5)]),
  row("s4", daysAgo: 3, [set("Bench", 67.5, 5)]),
]

private actor Source: PerformanceSource {
  var rows: [SessionHistoryRow]
  var weighIns: [WeighIn] = []
  var down = false
  private(set) var since: [EpochMillis] = []
  init(_ rows: [SessionHistoryRow]) { self.rows = rows }
  func set(_ rows: [SessionHistoryRow]) { self.rows = rows }
  func setDown(_ d: Bool) { down = d }
  func setWeighIns(_ w: [WeighIn]) { weighIns = w }
  func sessions(userId: String, since: EpochMillis) async throws -> [SessionHistoryRow] {
    self.since.append(since)
    if down { throw URLError(.notConnectedToInternet) }
    return rows
  }
  func weighIns(userId: String, since: LocalDate) async throws -> [WeighIn] {
    if down { throw URLError(.notConnectedToInternet) }
    return weighIns
  }
}

private actor Cache: InsightCache {
  var byUser: [String: InsightSnapshot] = [:]
  func load(userId: String) async throws -> InsightSnapshot? { byUser[userId] }
  func save(userId: String, _ snapshot: InsightSnapshot) async throws { byUser[userId] = snapshot }
}

@MainActor
private func book(_ source: Source, _ cache: Cache = Cache(), user: String = "u1", clock: ManualClock = ManualClock(EpochMillis(now))) -> InsightBook {
  InsightBook(userId: user, source: source, cache: cache, clock: clock, timeZone: saigon)
}

@MainActor
struct InsightBookTests {
  /// Không có lịch sử: không có phân tích, không phải lỗi.
  @Test func noHistoryIsEmptyNotAFailure() async {
    let b = book(Source([]))
    await b.load()
    #expect(b.loaded && b.insights.isEmpty && b.performances.isEmpty && b.failure == nil)
  }

  /// Một buổi: một bài, chưa đủ dữ liệu.
  @Test func singleSessionIsInsufficient() async throws {
    let b = book(Source([benchRows[0]]))
    await b.load()
    let i = try #require(b.insight(for: "bench"))
    #expect(i.trend == .insufficientData && i.sessions == 1 && i.confidence == .low)
    #expect(i.bestE1rmKg == 70)  // 60 × (1 + 5/30)
  }

  /// Nhiều buổi: xu hướng, e1RM, lịch sử cho biểu đồ (cũ trước).
  @Test func multiSessionReadsATrend() async throws {
    let b = book(Source(benchRows.reversed()))
    await b.load()
    let i = try #require(b.insight(for: " BENCH "))
    #expect(i.trend == .improving && i.readiness == .readyToProgress && i.confidence == .high)
    #expect(b.history(for: "Bench").map(\.sessionId) == ["s1", "s2", "s3", "s4"])
  }

  /// Buổi bị xoá (#398 / #400): phân tích đổi ngay, không đợi server.
  @Test func deletedSessionLeavesTheAnalysisAtOnce() async throws {
    let b = book(Source(benchRows))
    await b.load()
    await b.forget(sessionId: "s4")
    #expect(b.history(for: "Bench").map(\.sessionId) == ["s1", "s2", "s3"])
    #expect(try #require(b.insight(for: "Bench")).sessions == 3)
  }

  /// Buổi vừa chốt (hàng outbox) vào phân tích ngay; bản ghi lại cùng id
  /// thay bản cũ, không thành buổi thứ hai.
  @Test func absorbedSessionCountsOnceAndRevisionsReplaceIt() async throws {
    let b = book(Source(Array(benchRows.prefix(3))))
    await b.load()
    let payload = { (kg: Double) -> JSONValue in
      .object([
        "id": .string("new"), "date_time": .string(WorkoutSessionRecord.iso8601(EpochMillis(now))),
        "sets": .array([set("Bench", kg, 5)]),
      ])
    }
    await b.absorb(row: payload(70))
    await b.absorb(row: payload(72.5))
    let h = b.history(for: "Bench")
    #expect(h.map(\.sessionId) == ["s1", "s2", "s3", "new"])
    #expect(h.last?.bestWeightKg == 72.5)
  }

  /// Offline: bản trên máy hiện, lỗi được gọi đúng tên.
  @Test func offlineShowsTheCacheAndSaysSo() async throws {
    let source = Source(benchRows)
    let cache = Cache()
    await book(source, cache).load()
    await source.setDown(true)
    let again = book(source, cache)
    await again.load()
    #expect(again.failure == .offline)
    #expect(again.insight(for: "Bench")?.sessions == 4)
  }

  /// Cache theo người dùng: người sau không thấy phân tích của người trước.
  @Test func cacheIsPerUser() async throws {
    let source = Source(benchRows)
    let cache = Cache()
    await book(source, cache, user: "u1").load()
    await source.setDown(true)
    let other = book(source, cache, user: "u2")
    await other.load()
    #expect(other.insights.isEmpty)
  }

  /// Cửa sổ 90 ngày: hỏi đúng mốc; buổi trong cache đã trượt khỏi cửa sổ
  /// không còn được tính.
  @Test func windowIsNinetyDays() async throws {
    let source = Source([row("old", daysAgo: 85, [set("Bench", 100, 5)])] + benchRows)
    let clock = ManualClock(EpochMillis(now))
    let b = book(source, clock: clock)
    await b.load()
    #expect(await source.since.first == EpochMillis(now - 90 * day))
    #expect(b.history(for: "Bench").count == 5)
    await source.setDown(true)
    clock.advance(10 * day)
    b.recompute()
    #expect(b.history(for: "Bench").count == 4)
    #expect(b.insight(for: "Bench")?.lastTrainedDays == 13, "đếm theo hôm nay mới")
  }

  /// Cân nặng hỏng không làm hỏng phân tích; lần cân đã biết được giữ.
  @Test func weighInsAreOptional() async throws {
    let source = Source([
      row("a", daysAgo: 9, [set("Pull-up", 0, 8)]), row("b", daysAgo: 6, [set("Pull-up", 0, 9)]),
      row("c", daysAgo: 3, [set("Pull-up", 0, 10)]),
    ])
    await source.setWeighIns([WeighIn(date: LocalDate("2026-09-01")!, kg: 70)])
    let b = book(source)
    await b.load()
    #expect(b.insight(for: "Pull-up")?.unit == .kgRep)
    #expect(b.insight(for: "Pull-up")?.current == 700)
  }

  /// Loại bài khai báo (thư viện, #420) đổi thang đo.
  @Test func declaredKindChangesTheScale() async throws {
    let b = book(Source(benchRows))
    await b.load()
    #expect(b.insight(for: "Bench")?.unit == .kg)
    b.declaredKinds = ["bench": "isolation"]
    #expect(b.insight(for: "Bench")?.unit == .kgRep)
  }
}

private struct NoPlan: TemplateSource, TemplateCache, TrainingHistory, RecordHistory {
  func fetch(userId: String) async throws -> TemplateSnapshot { TemplateSnapshot(routine: [], templates: [], fetchedAt: EpochMillis(0)) }
  func load(userId: String) async throws -> TemplateSnapshot? { nil }
  func save(userId: String, _ snapshot: TemplateSnapshot) async throws {}
  func sessionTimes(userId: String, since: EpochMillis) async throws -> [EpochMillis] { [] }
  func recentSessionSets(userId: String, limit: Int) async throws -> [JSONValue] { [] }
}
private actor NoCaches: RecordBookCache, PerformanceCache {
  func load(userId: String) async throws -> PersonalRecords.Bests? { nil }
  func save(userId: String, _ bests: PersonalRecords.Bests) async throws {}
  func load(userId: String) async throws -> [String: LastPerformance]? { nil }
  func save(userId: String, _ table: [String: LastPerformance]) async throws {}
}

@MainActor
struct InsightFlowTests {
  /// Ghi một buổi (ở đây: ghi tay #418) → phân tích có nó ngay; gỡ set cuối
  /// cùng của buổi (xoá) → phân tích bỏ nó ngay. Cùng đường `enqueued` với
  /// "lần trước" và kỷ lục.
  @Test func flowFeedsInsights() async throws {
    let clock = ManualClock(EpochMillis(now))
    let store = InMemoryWorkoutStore()
    let source = Source(Array(benchRows.prefix(3)))
    let insights = InsightBook(userId: "u1", source: source, cache: Cache(), clock: clock, timeZone: saigon)
    let flow = WorkoutFlow(
      today: TodayController(
        userId: "u1", repository: TodayRepository(source: NoPlan(), cache: NoPlan()), history: NoPlan(),
        workouts: store, clock: clock, timeZone: saigon),
      records: RecordBook(userId: "u1", history: NoPlan(), cache: NoCaches()),
      performance: PerformanceBook(userId: "u1", source: source, cache: NoCaches(), clock: clock, timeZone: saigon),
      insights: insights, store: store, clock: clock, timeZone: saigon)
    await flow.start()
    #expect(insights.history(for: "Bench").count == 3)

    let log = flow.makeManualLog()
    await log.load()
    let id = try #require(log.rows.first?.id)
    await log.setExerciseName("Bench", row: id)
    await log.setWeight("70", row: id)
    await log.setReps("5", row: id)
    let saved = try await log.save()
    await flow.settled()
    #expect(insights.history(for: "Bench").last?.sessionId == saved.sessionId)

    // Xoá từ lịch sử (#400) đi qua `onDeleted` → `sessionDeleted`.
    await flow.sessionDeleted(saved.sessionId, at: EpochMillis(now))
    #expect(insights.history(for: "Bench").count == 3)
  }
}
