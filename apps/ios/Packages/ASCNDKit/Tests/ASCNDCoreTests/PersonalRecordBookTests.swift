import ASCNDCore
import ASCNDTestSupport
import Foundation
import Testing

private func rs(_ name: String, _ kg: Double, _ reps: Int, warmup: Bool = false) -> RecordSet {
  RecordSet(exerciseName: name, weightKg: kg, reps: reps, warmup: warmup)
}
private func json(_ s: String) -> JSONValue { try! JSONDecoder().decode(JSONValue.self, from: Data(s.utf8)) }

/// `personal-record.ts` @ fac9ac2 — `bestsFrom` / `findRecords` / `setsFromJson`.
struct PersonalRecordRulesTests {
  private let history = PersonalRecords.bests(from: [rs("Bench Press", 100, 5), rs("Bench Press", 80, 10), rs("Squat", 120, 5)])

  @Test func heavierIsAWeightRecord() {
    let r = PersonalRecords.findRecords([rs("Bench Press", 102.5, 3)], bests: history)
    #expect(r == [PersonalRecord(exercise: "Bench Press", kind: .weight, value: 102.5, previous: 100, atWeight: nil)])
  }

  /// Bằng kỷ lục cũ, hay chỉ hơn trong biên 0,05 kg (kg ↔ lb khứ hồi) — không phải kỷ lục.
  @Test(arguments: [100.0, 100.02, 100.05])
  func tieOrPhantomIsNotARecord(kg: Double) {
    #expect(PersonalRecords.findRecords([rs("Bench Press", kg, 5)], bests: history).isEmpty)
  }

  @Test func moreRepsAtAKnownLoadIsARepRecord() {
    let r = PersonalRecords.findRecords([rs("bench press", 80, 12)], bests: history)
    #expect(r.first?.kind == .reps)
    #expect(r.first?.value == 12 && r.first?.previous == 10 && r.first?.atWeight == 80)
  }

  /// Mức tạ chưa từng dùng: chưa có gì để vượt.
  @Test func newLoadWithoutHeavierIsNotARecord() {
    #expect(PersonalRecords.findRecords([rs("Bench Press", 90, 20)], bests: history).isEmpty)
  }

  /// Không có lịch sử bài ấy: buổi đầu tiên không nổ kỷ lục cho mọi bài.
  @Test func missingHistoryIsNotARecord() {
    #expect(PersonalRecords.findRecords([rs("Deadlift", 200, 1)], bests: history).isEmpty)
    #expect(PersonalRecords.findRecords([rs("Bench Press", 200, 1)], bests: [:]).isEmpty)
  }

  /// Khởi động không bao giờ là kỷ lục — kể cả rep record ở mức tạ cũ.
  @Test func warmupIsNeverARecord() {
    #expect(PersonalRecords.findRecords([rs("Bench Press", 80, 15, warmup: true)], bests: history).isEmpty)
    #expect(PersonalRecords.bests(from: [rs("X", 500, 1, warmup: true)]).isEmpty, "khởi động không vào lịch sử")
  }

  /// Nhiều set một bài: một kỷ lục mỗi bài, tạ thắng reps; xếp theo mức tăng.
  @Test func oneRecordPerExerciseSortedByGain() {
    let r = PersonalRecords.findRecords([
      rs("Bench Press", 80, 12),    // reps +20 %
      rs("Bench Press", 105, 1),    // tạ +5 % → thắng reps của cùng bài
      rs("Squat", 150, 1),          // tạ +25 %
    ], bests: history)
    #expect(r.map(\.exercise) == ["Squat", "Bench Press"])
    #expect(r[1].kind == .weight && r[1].value == 105)
  }

  /// `exerciseKey`: trim, chữ thường, gộp khoảng trắng — "Bench  press " là Bench Press.
  @Test func namesMatchByKey() {
    #expect(PersonalRecords.exerciseKey("  Bench   PRESS ") == "bench press")
    #expect(!PersonalRecords.findRecords([rs("  bench   PRESS ", 110, 1)], bests: history).isEmpty)
  }

  /// `setsFromJson`: JSONB tự do — ép cái ép được, bỏ cái không, không ném.
  @Test func setsFromJSONIsTolerant() {
    let sets = PersonalRecords.sets(fromJSON: json("""
      [{"exerciseName":"Bench","weight":"100","reps":5},
       {"exerciseName":"Plank","weight":0,"durationSec":60},
       {"exerciseName":"Curl","weight":20,"reps":12,"warmup":true},
       {"exerciseName":"","weight":10,"reps":5},
       {"exerciseName":"Row","reps":5},
       {"exerciseName":"Dip","weight":0},
       "junk", null]
      """))
    #expect(sets.map(\.exerciseName) == ["Bench", "Plank", "Curl"])
    #expect(sets[0].weightKg == 100 && sets[1].reps == 0 && sets[1].durationSec == 60 && sets[2].warmup)
    #expect(PersonalRecords.sets(fromJSON: json(#"{"a":1}"#)).isEmpty)
  }
}

/// RN BUG FOUND: `useLogWorkoutSession` gọi
/// `findRecords(sets.map(s => ({ exerciseName, weight, reps })))`
/// (`use-fitness-data.ts:375`) — ĐÁNH RƠI `warmup`, nên một hiệp khởi động ở
/// mức tạ cũ nổ rep record, trái với chính luật `counts()` ("a warm-up is not
/// a record"). Native truyền đủ set kèm cờ khởi động.
struct WarmupRecordRegressionTests {
  @Test func sessionWarmupDoesNotPostARecord() throws {
    let history = PersonalRecords.bests(from: [rs("Bench", 40, 8), rs("Bench", 100, 5)])
    let record = try #require(WorkoutSessionRecord(
      id: "s", userId: "u", dateTime: EpochMillis(0), templateId: nil, templateName: "W",
      sets: [SessionSet(exerciseId: "", exerciseName: "Bench", weightKg: 40, reps: 12, rpe: 5, warmup: true),
             SessionSet(exerciseId: "", exerciseName: "Bench", weightKg: 100, reps: 5, rpe: 8)]))
    #expect(PersonalRecords.findRecords(record.recordSets, bests: history).isEmpty)
    // Đường của RN (bỏ cờ) — đây là thứ đã sai:
    let rnStyle = record.recordSets.map { RecordSet(exerciseName: $0.exerciseName, weightKg: $0.weightKg, reps: $0.reps) }
    #expect(!PersonalRecords.findRecords(rnStyle, bests: history).isEmpty)
  }
}

private actor History: RecordHistory {
  var rows: [JSONValue]
  var fail = false
  init(_ rows: [JSONValue]) { self.rows = rows }
  func setFail(_ f: Bool) { fail = f }
  func recentSessionSets(userId: String, limit: Int) async throws -> [JSONValue] {
    struct Down: Error {}
    if fail { throw Down() }
    return rows
  }
}
private actor Cache: RecordBookCache {
  var store: [String: PersonalRecords.Bests] = [:]
  func load(userId: String) async throws -> PersonalRecords.Bests? { store[userId] }
  func save(userId: String, _ bests: PersonalRecords.Bests) async throws { store[userId] = bests }
}

@MainActor
struct RecordBookFlowTests {
  private let rows = [PlannedSet(key: "b1", exerciseName: "Bench", ordinal: 1, of: 1, weightKg: 105, reps: 3, plannedRest: 0)]

  private func controller(_ store: InMemoryWorkoutStore, book: RecordBook, id: String) async -> WorkoutSessionController {
    let c = WorkoutSessionController(
      plan: .init(date: LocalDate("2026-10-05")!, templateId: "t", templateName: "Push", rows: rows),
      userId: "u1", store: store, clock: FixedWallClock(iso8601: "2026-10-05T10:00:00Z"),
      timeZone: TimeZone(identifier: "UTC")!, bests: { book.bests }, makeId: { id },
      onEnqueued: { e in Task { await book.absorb(setsJSON: e.payload["sets"]) } })
    await c.load()
    return c
  }

  /// Chốt → kỷ lục thật trong `pr_detected` và tổng kết; buổi thứ hai cùng
  /// mức tạ (đã gộp vào lịch sử) KHÔNG nổ lại.
  @Test func finishDetectsThenAbsorbs() async throws {
    let book = RecordBook(userId: "u1", history: History([json(#"[{"exerciseName":"Bench","weight":100,"reps":5}]"#)]), cache: Cache())
    await book.load()
    let store = InMemoryWorkoutStore()
    let c = await controller(store, book: book, id: "s1")
    await c.toggle("b1")
    let s = try await c.finish()
    #expect(s.prDetected)
    #expect(s.records.first?.kind == .weight && s.records.first?.value == 105)
    #expect(await store.outbox.first?.payload["pr_detected"] == .bool(true))
    for _ in 0..<20 { await Task.yield() }
    #expect(book.bests?["bench"]?.topWeight == 105)

    let again = WorkoutSessionController(
      plan: .init(date: LocalDate("2026-10-06")!, templateId: "t", templateName: "Push", rows: rows),
      userId: "u1", store: store, clock: FixedWallClock(iso8601: "2026-10-06T10:00:00Z"),
      timeZone: TimeZone(identifier: "UTC")!, bests: { book.bests }, makeId: { "s2" })
    await again.load()
    await again.toggle("b1")
    #expect(try await again.finish().prDetected == false)
  }

  /// Chưa biết lịch sử (offline, chưa có cache): không nhận kỷ lục — như baseline.
  @Test func unknownHistoryMeansNoRecord() async throws {
    let h = History([])
    await h.setFail(true)
    let book = RecordBook(userId: "u1", history: h, cache: Cache())
    await book.load()
    #expect(book.bests == nil)
    let c = await controller(InMemoryWorkoutStore(), book: book, id: "s1")
    await c.toggle("b1")
    #expect(try await c.finish().prDetected == false)
  }

  /// Offline nhưng có cache từ lần trước: vẫn so được kỷ lục.
  @Test func offlineUsesCachedBests() async throws {
    let cache = Cache()
    try await cache.save(userId: "u1", PersonalRecords.bests(from: [rs("Bench", 100, 5)]))
    let h = History([])
    await h.setFail(true)
    let book = RecordBook(userId: "u1", history: h, cache: cache)
    await book.load()
    let c = await controller(InMemoryWorkoutStore(), book: book, id: "s1")
    await c.toggle("b1")
    #expect(try await c.finish().prDetected)
  }
}
