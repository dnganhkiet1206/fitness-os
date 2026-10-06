import ASCNDCore
import ASCNDTestSupport
import Foundation
import Testing

private func json(_ s: String) -> JSONValue { try! JSONDecoder().decode(JSONValue.self, from: Data(s.utf8)) }
private let utc = TimeZone(identifier: "UTC")!
private let saigon = TimeZone(identifier: "Asia/Ho_Chi_Minh")!
private func row(_ id: String, _ at: Int64, _ sets: String) -> SessionHistoryRow {
  SessionHistoryRow(id: id, at: EpochMillis(at), sets: json(sets))
}

struct LastPerformanceTests {
  /// Buổi GẦN NHẤT thắng, bất kể thứ tự server trả về (mới nhất trước).
  @Test func latestSessionWins() {
    let t = PerformanceHistory.lastByExercise([
      row("new", 2_000, #"[{"exerciseName":"Bench","weight":62.5,"reps":8}]"#),
      row("old", 1_000, #"[{"exerciseName":"Bench","weight":60,"reps":8}]"#),
    ], timeZone: utc)
    #expect(t["bench"]?.sessionId == "new")
    #expect(t["bench"]?.topSet == .init(weightKg: 62.5, reps: 8))
  }

  /// RN BUG FOUND: max tạ và max rep ghép rời thành một set không có thật.
  @Test func topSetIsARealSet() {
    let t = PerformanceHistory.lastByExercise([
      row("s", 1, #"[{"exerciseName":"Bench","weight":100,"reps":3},{"exerciseName":"Bench","weight":60,"reps":12}]"#),
    ], timeZone: utc)
    #expect(t["bench"]?.display == .loaded(weightKg: 100, reps: 3), "không phải 100 × 12")
  }

  /// Bằng tạ thì set nhiều rep nhất.
  @Test func sameWeightMoreReps() {
    let t = PerformanceHistory.lastByExercise([
      row("s", 1, #"[{"exerciseName":"Row","weight":50,"reps":8},{"exerciseName":"Row","weight":50,"reps":10}]"#),
    ], timeZone: utc)
    #expect(t["row"]?.topSet?.reps == 10)
  }

  /// Khởi động không phải "lần trước"; bài chỉ có khởi động thì không có dòng.
  @Test func warmupsExcluded() {
    let t = PerformanceHistory.lastByExercise([
      row("s", 1, #"[{"exerciseName":"Squat","weight":140,"reps":5,"warmup":true},{"exerciseName":"Squat","weight":100,"reps":5},{"exerciseName":"Curl","weight":10,"reps":15,"warmup":true}]"#),
    ], timeZone: utc)
    #expect(t["squat"]?.topSet?.weightKg == 100)
    #expect(t["squat"]?.setCount == 1)
    #expect(t["curl"] == nil)
  }

  @Test func holdAndBodyweightDisplays() {
    let t = PerformanceHistory.lastByExercise([
      row("s", 1, #"[{"exerciseName":"Plank","weight":0,"durationSec":60},{"exerciseName":"Plank","weight":0,"durationSec":45},{"exerciseName":"Dips","weight":0,"reps":12}]"#),
    ], timeZone: utc)
    #expect(t["plank"]?.display == .hold(seconds: 60))
    #expect(t["dips"]?.display == .bodyweight(reps: 12))
  }

  /// Tên khớp theo `exerciseKey`; tên hiện là lần gõ gần nhất.
  @Test func matchesByKeyShowsLatestName() {
    let t = PerformanceHistory.lastByExercise([
      row("s", 1, #"[{"exerciseName":"bench  press","weight":60,"reps":5},{"exerciseName":" Bench Press ","weight":60,"reps":5}]"#),
    ], timeZone: utc)
    #expect(t["bench press"]?.exerciseName == "Bench Press")
    #expect(t["bench press"]?.setCount == 2)
  }

  /// `dayOf`: 23:30 UTC thứ Hai là 06:30 thứ Ba ở UTC+7.
  @Test func dateIsLocal() {
    let t = PerformanceHistory.lastByExercise([row("s", 1_791_156_600_000, #"[{"exerciseName":"X","weight":1,"reps":1}]"#)], timeZone: saigon)
    #expect(t["x"]?.date == LocalDate("2026-10-05"))
  }

  @Test func junkIsIgnored() {
    #expect(PerformanceHistory.lastByExercise([row("s", 1, #"{"x":1}"#), row("t", 2, "[]")], timeZone: utc).isEmpty)
  }
}

private actor Source: PerformanceSource {
  var rows: [SessionHistoryRow]
  var fail = false
  var lastSince: EpochMillis?
  init(_ rows: [SessionHistoryRow]) { self.rows = rows }
  func setFail() { fail = true }
  func sessions(userId: String, since: EpochMillis) async throws -> [SessionHistoryRow] {
    struct Down: Error {}
    lastSince = since
    if fail { throw Down() }
    return rows
  }
}
private actor Cache: PerformanceCache {
  var store: [String: [String: LastPerformance]] = [:]
  func load(userId: String) async throws -> [String: LastPerformance]? { store[userId] }
  func save(userId: String, _ table: [String: LastPerformance]) async throws { store[userId] = table }
}

@MainActor
struct PerformanceBookTests {
  private let clock = ManualClock(EpochMillis(100 * 86_400_000))

  @Test func refreshAsksForNinetyDays() async {
    let src = Source([row("s", 99 * 86_400_000, #"[{"exerciseName":"Bench","weight":60,"reps":8}]"#)])
    let book = PerformanceBook(userId: "u", source: src, cache: Cache(), clock: clock, timeZone: utc)
    await book.load()
    #expect(await src.lastSince == EpochMillis(10 * 86_400_000))
    #expect(book.last(for: " BENCH ")?.topSet?.weightKg == 60)
  }

  /// Offline: cache hiện ngay.
  @Test func offlineUsesCache() async throws {
    let cache = Cache()
    try await cache.save(userId: "u", PerformanceHistory.lastByExercise([row("s", 1, #"[{"exerciseName":"Bench","weight":55,"reps":9}]"#)], timeZone: utc))
    let src = Source([])
    await src.setFail()
    let book = PerformanceBook(userId: "u", source: src, cache: cache, clock: clock, timeZone: utc)
    await book.load()
    #expect(book.last(for: "Bench")?.display == .loaded(weightKg: 55, reps: 9))
  }

  /// Buổi vừa chốt thành "lần trước" ngay, không đợi sync; buổi cũ hơn không đè.
  @Test func absorbFinishedSession() async {
    let book = PerformanceBook(userId: "u", source: Source([]), cache: Cache(), clock: clock, timeZone: utc)
    await book.absorb(row: json(#"{"id":"a","date_time":"2026-10-05T07:00:00.000Z","sets":[{"exerciseName":"Bench","weight":65,"reps":5}]}"#))
    #expect(book.last(for: "Bench")?.sessionId == "a")
    await book.absorb(row: json(#"{"id":"old","date_time":"2026-10-01T07:00:00.000Z","sets":[{"exerciseName":"Bench","weight":50,"reps":5}]}"#))
    #expect(book.last(for: "Bench")?.sessionId == "a")
  }
}
