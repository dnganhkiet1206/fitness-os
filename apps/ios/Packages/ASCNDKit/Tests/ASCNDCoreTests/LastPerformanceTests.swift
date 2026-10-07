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

/// #417: loại bài (`exercise-kind.ts`) + cân nặng ngày tập (`bodyweightOn`).
struct BodyweightPerformanceTests {
  private func set(_ w: Double, _ reps: Int, duration: Int? = nil) -> RecordSet {
    RecordSet(exerciseName: "x", weightKg: w, reps: reps, durationSec: duration)
  }
  private let day = 86_400_000 as Int64

  @Test func resolveKindFollowsTheBaseline() {
    #expect(ExerciseKind.resolve(declared: "isolation", sets: [set(0, 10)]) == .isolation, "khai báo thắng")
    #expect(ExerciseKind.resolve(declared: "nonsense", sets: [set(60, 5)]) == .compound)
    #expect(ExerciseKind.resolve(declared: nil, sets: []) == .compound)
    #expect(ExerciseKind.resolve(declared: nil, sets: [set(0, 0, duration: 45)]) == .timed, "giữ xét trước bodyweight")
    #expect(ExerciseKind.resolve(declared: nil, sets: [set(0, 8), set(0, 8), set(10, 6), set(10, 6)]) == .bodyweight,
            "hít xà 0,0,10,10: nửa không tạ vẫn là bodyweight")
    #expect(ExerciseKind.resolve(declared: nil, sets: [set(100, 5), set(100, 5), set(100, 5), set(0, 5)]) == .compound,
            "một ô tạ quên điền không biến squat thành bodyweight")
  }

  @Test func bodyweightOnUsesTheLatestWeighInAtOrBefore() {
    let w = [
      WeighIn(date: LocalDate("2026-09-01")!, kg: 70.004), WeighIn(date: LocalDate("2026-10-01")!, kg: 72),
      WeighIn(date: LocalDate("2026-10-10")!, kg: 99), WeighIn(date: LocalDate("2026-09-20")!, kg: -1),
    ]
    #expect(WeighIn.bodyweight(on: LocalDate("2026-10-05")!, w) == 72, "không dùng lần cân SAU ngày tập")
    #expect(WeighIn.bodyweight(on: LocalDate("2026-10-01")!, w) == 72, "cùng ngày được")
    #expect(WeighIn.bodyweight(on: LocalDate("2026-09-25")!, w) == 70, "bỏ số âm; làm tròn 2 chữ số")
    #expect(WeighIn.bodyweight(on: LocalDate("2026-08-01")!, w) == nil, "không có → nil, không phải 0")
  }

  /// Hít xà đeo đai 10 kg ngày cân 72 kg → "82 kg × 6"; không biết cân nặng →
  /// chỉ tạ đeo (như `lastSetText`); bài compound không cộng cân nặng.
  @Test func bodyweightLoadAddsTheBody() {
    let rows = [
      row("a", 1 * day, #"[{"exerciseName":"Pull-up","weight":0,"reps":8},{"exerciseName":"Squat","weight":100,"reps":5}]"#),
      row("b", 5 * day, #"[{"exerciseName":"Pull-up","weight":10,"reps":6},{"exerciseName":"Squat","weight":105,"reps":5}]"#),
    ]
    let weighed = PerformanceHistory.lastByExercise(rows, weighIns: [WeighIn(date: LocalDate("1970-01-03")!, kg: 72)], timeZone: utc)
    #expect(weighed["pull-up"]?.kind == .bodyweight, "loại theo CẢ cửa sổ: 0 và 10")
    #expect(weighed["pull-up"]?.bodyweightKg == 72)
    #expect(weighed["pull-up"]?.display == .loaded(weightKg: 82, reps: 6))
    #expect(weighed["squat"]?.display == .loaded(weightKg: 105, reps: 5))

    let unknown = PerformanceHistory.lastByExercise(rows, timeZone: utc)
    #expect(unknown["pull-up"]?.bodyweightKg == nil)
    #expect(unknown["pull-up"]?.display == .loaded(weightKg: 10, reps: 6), "không biết cơ thể: chỉ tạ đeo")

    let bare = PerformanceHistory.lastByExercise(Array(rows.prefix(1)), timeZone: utc)
    #expect(bare["pull-up"]?.display == .bodyweight(reps: 8))
  }

  /// Cache trước #417 (không `kind` / `bodyweightKg`) vẫn đọc được.
  @Test func legacyCacheDecodes() throws {
    let old = #"{"exerciseKey":"bench","exerciseName":"Bench","sessionId":"s","at":1000,"date":"1970-01-01","setCount":1,"totalReps":8,"totalVolumeKg":480,"topSet":{"weightKg":60,"reps":8}}"#
    let p = try JSONDecoder().decode(LastPerformance.self, from: Data(old.utf8))
    #expect(p.kind == .compound && p.bodyweightKg == nil)
    #expect(p.display == .loaded(weightKg: 60, reps: 8))
  }
}

private actor WeighingSource: PerformanceSource {
  let rows: [SessionHistoryRow]
  let weights: [WeighIn]
  private(set) var since: LocalDate?
  init(_ rows: [SessionHistoryRow], _ weights: [WeighIn]) {
    self.rows = rows
    self.weights = weights
  }
  func sessions(userId: String, since: EpochMillis) async throws -> [SessionHistoryRow] { rows }
  func weighIns(userId: String, since: LocalDate) async throws -> [WeighIn] {
    self.since = since
    return weights
  }
}
private actor MemCache: PerformanceCache {
  var t: [String: LastPerformance]?
  func load(userId: String) async throws -> [String: LastPerformance]? { t }
  func save(userId: String, _ table: [String: LastPerformance]) async throws { t = table }
}

@MainActor
struct BodyweightBookTests {
  /// Làm mới đọc cân nặng cùng cửa sổ 90 ngày; buổi vừa chốt dùng lần cân đã
  /// có, và giữ loại bài đã biết từ cả cửa sổ.
  @Test func bookCarriesWeighInsIntoAbsorb() async {
    let day: Int64 = 86_400_000
    let src = WeighingSource(
      [row("a", 1 * day, #"[{"exerciseName":"Pull-up","weight":0,"reps":8}]"#)],
      [WeighIn(date: LocalDate("1970-01-01")!, kg: 70)])
    let clock = ManualClock(EpochMillis(100 * day))
    let book = PerformanceBook(userId: "u", source: src, cache: MemCache(), clock: clock, timeZone: utc)
    await book.load()
    #expect(await src.since == LocalDate("1970-01-11"), "100 − 90 ngày")
    // Lần cân ngày 1/1, buổi ngày 2/1 → dùng được.
    #expect(book.last(for: "pull-up")?.bodyweightKg == 70)
    #expect(book.last(for: "pull-up")?.display == .loaded(weightKg: 70, reps: 8))
    await book.absorb(row: json(#"{"id":"b","date_time":"1970-04-10T00:00:00Z","sets":[{"exerciseName":"Pull-up","weight":10,"reps":5}]}"#))
    let p = book.last(for: "pull-up")
    #expect(p?.sessionId == "b")
    #expect(p?.kind == .bodyweight, "một buổi đeo đai không đổi loại đã biết")
    #expect(p?.display == .loaded(weightKg: 80, reps: 5))
  }
}
