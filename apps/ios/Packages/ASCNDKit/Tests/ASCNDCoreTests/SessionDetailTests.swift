import ASCNDCore
import ASCNDTestSupport
import Foundation
import Testing

/// Chi tiết buổi đã tập (#428).

private func json(_ s: String) -> JSONValue { try! JSONDecoder().decode(JSONValue.self, from: Data(s.utf8)) }

private func row(
  _ id: String, _ iso: String, sets: String, rpe: String = "8", volume: String = "480", pr: Bool = false,
  name: String = #""Push""#
) -> JSONValue {
  json("""
    {"id":"\(id)","date_time":"\(iso)","template_name":\(name),"session_rpe":\(rpe),"volume_load":\(volume),"pr_detected":\(pr),"sets":\(sets)}
    """)
}

private func entry(_ r: JSONValue) -> HistoryEntry { HistoryEntry(row: r)! }

private actor Source: HistorySource {
  var rows: [JSONValue]
  init(_ rows: [JSONValue]) { self.rows = rows }
  func sessions(userId: String, since: EpochMillis) async throws -> [JSONValue] { rows }
}
private actor Cache: HistoryCache {
  var store: [String: [HistoryEntry]] = [:]
  func load(userId: String) async throws -> [HistoryEntry]? { store[userId] }
  func save(userId: String, _ entries: [HistoryEntry]) async throws { store[userId] = entries }
}

struct SessionDetailTests {
  /// Bài theo thứ tự xuất hiện, khoá id hoặc tên; khởi động hiện nhưng không
  /// vào set đã làm / set nặng nhất / volume; set giữ đếm riêng.
  @Test func groupsExercisesLikeTheShareCard() {
    let sets = """
      [{"exerciseId":"e-bench","exerciseName":"Bench","weight":40,"reps":10,"warmup":true,"rpe":4},
       {"exerciseId":"e-bench","exerciseName":"Bench","weight":60,"reps":8,"rpe":8},
       {"exerciseId":"","exerciseName":" Dips ","weight":0,"reps":12},
       {"exerciseId":"e-bench","exerciseName":"Bench","weight":60,"reps":9,"rpe":9},
       {"exerciseId":"e-bench","exerciseName":"Bench","weight":57.5,"reps":12},
       {"exerciseName":"Plank","weight":0,"reps":0,"durationSec":45},
       {"exerciseName":"","weight":10,"reps":5}]
      """
    let d = SessionDetail(entry(row("s1", "2026-10-05T07:00:00Z", sets: sets)), history: [])
    #expect(d.exercises.map(\.key) == ["e-bench", "name:Dips", "name:Plank", "name:?"])
    let bench = d.exercises[0]
    #expect(bench.sets.map(\.position) == [1, 2, 4, 5] && bench.sets[0].warmup)
    #expect(bench.workingSets == 3)
    #expect(bench.topWeightKg == 60 && bench.topReps == 9, "nặng nhất, bằng tạ thì nhiều rep hơn")
    #expect(bench.volumeKg == 60 * 8 + 60 * 9 + 690)
    #expect(bench.sets[1].rpe == 8 && bench.sets[3].rpe == nil)
    #expect(d.exercises[1].exerciseId == nil && d.exercises[1].name == "Dips")
    #expect(d.completedSets == 6 && d.warmupSets == 1 && d.holdSets == 1)
    #expect(d.title == "Push" && d.sessionRpe == 8 && d.volumeKg == 480 && !d.prDetected)
    // trainingMinutes: 6 set có rep (khởi động vẫn là set có rep, như RN),
    // reps 10+8+12+9+12+5 = 56 → 168 s + 6 × 90 s = 708 s → 12 phút.
    #expect(d.estimatedMinutes == 12)
  }

  /// Dữ liệu thiếu không thành số bịa.
  @Test func missingDataStaysMissing() {
    let sets = #"[{"exerciseName":"Row","weight":"abc","reps":"8"},{"exerciseName":"Row","weight":null,"reps":null},"junk",{"exerciseName":"Row","weight":50,"reps":6,"restSeconds":30}]"#
    let d = SessionDetail(entry(row("s1", "2026-10-05T07:00:00Z", sets: sets, rpe: "null", volume: "null", name: #""  ""#)), history: [])
    #expect(d.title == nil && d.sessionRpe == nil && d.volumeKg == nil)
    let rowEx = d.exercises[0]
    #expect(rowEx.sets.count == 3, "phần tử không phải object bị bỏ")
    #expect(rowEx.sets[0].weightKg == nil && rowEx.sets[0].reps == 8)
    #expect(rowEx.sets[1].weightKg == nil && rowEx.sets[1].reps == nil)
    #expect(rowEx.topWeightKg == 50 && rowEx.topReps == 6)
    // 8 × 3 + 90 + 6 × 3 + 30 = 162 s → 3 phút.
    #expect(d.estimatedMinutes == 3)

    let empty = SessionDetail(entry(row("s2", "2026-10-05T07:00:00Z", sets: "null")), history: [])
    #expect(empty.exercises.isEmpty && empty.estimatedMinutes == nil && empty.completedSets == 0)
    let zero = SessionDetail(entry(row("s3", "2026-10-05T07:00:00Z", sets: "[]", volume: "0")), history: [])
    #expect(zero.volumeKg == 0, "0 kg đã lưu là con số thật, khác cột trống")
  }

  /// Kỷ lục: chỉ khi buổi được ghi là có; chỉ so với buổi TRƯỚC nó.
  @Test func recordsOnlyForFlaggedSessionsAgainstEarlierOnes() {
    let older = entry(row("a", "2026-09-20T07:00:00Z", sets: #"[{"exerciseName":"Squat","weight":100,"reps":5},{"exerciseName":"Bench","weight":70,"reps":5}]"#))
    let later = entry(row("c", "2026-10-04T07:00:00Z", sets: #"[{"exerciseName":"Squat","weight":140,"reps":5}]"#))
    let sets = #"[{"exerciseName":"Squat","weight":110,"reps":5},{"exerciseName":"Bench","weight":70,"reps":6},{"exerciseName":"Curl","weight":20,"reps":10}]"#
    let flagged = entry(row("b", "2026-10-01T07:00:00Z", sets: sets, pr: true))
    let d = SessionDetail(flagged, history: [later, flagged, older])
    #expect(d.comparedSessions == 1, "chỉ buổi trước nó")
    #expect(d.records.map(\.exercise) == ["Bench", "Squat"], "mức tăng lớn nhất trước: 6/5 > 110/100")
    #expect(d.exercises.first { $0.name == "Squat" }?.record?.kind == .weight)
    #expect(d.exercises.first { $0.name == "Bench" }?.record?.kind == .reps)
    #expect(d.exercises.first { $0.name == "Curl" }?.record == nil, "lần đầu không phải kỷ lục")

    let unflagged = entry(row("b", "2026-10-01T07:00:00Z", sets: sets, pr: false))
    #expect(SessionDetail(unflagged, history: [older, unflagged]).records.isEmpty, "không tự nhận kỷ lục")
  }

  /// Cache ghi trước #428 (không có `sets` / `volumeLoad`) vẫn đọc được.
  @Test func oldCacheStillDecodes() throws {
    let old = #"[{"id":"s1","at":1791183600000,"templateName":"Push","sessionRpe":8,"volumeKg":480,"prDetected":false,"completedSets":3,"exerciseCount":1}]"#
    let entries = try JSONDecoder().decode([HistoryEntry].self, from: Data(old.utf8))
    #expect(entries.first?.sets == nil && entries.first?.volumeLoad == nil)
    let d = SessionDetail(entries[0], history: entries)
    #expect(d.exercises.isEmpty && d.volumeKg == nil)
    let round = try JSONDecoder().decode(
      [HistoryEntry].self, from: JSONEncoder().encode([entry(row("s1", "2026-10-05T07:00:00Z", sets: #"[{"exerciseName":"Bench","weight":60,"reps":8}]"#))]))
    #expect(round.first?.sets != nil && round.first?.volumeLoad == 480)
  }
}

@MainActor
struct HistoryDetailStateTests {
  private let clock = ManualClock(EpochMillis(1_791_183_600_000))

  private func book(_ rows: [JSONValue], cache: Cache = Cache(), store: InMemoryWorkoutStore = InMemoryWorkoutStore(), user: String = "u1") -> HistoryBook {
    HistoryBook(userId: user, source: Source(rows), cache: cache, store: store, clock: clock, makeId: { UUID().uuidString })
  }

  @Test func loadingThenReadyThenGoneAfterDelete() async throws {
    let b = book([row("S1", "2026-10-04T07:00:00Z", sets: #"[{"exerciseName":"Bench","weight":60,"reps":8}]"#)])
    #expect(b.detail("s1") == .loading)
    await b.load()
    guard case .ready(let d) = b.detail("S1") else { Issue.record("phải có chi tiết"); return }
    #expect(d.exercises.map(\.name) == ["Bench"])
    #expect(b.detail("nope") == .notFound)
    try await b.delete("s1")
    #expect(b.detail("s1") == .notFound, "đã xoá thì không còn chi tiết")
  }

  /// Buổi vừa chốt (hàng outbox) có chi tiết ngay, không chờ sync.
  @Test func finishedSessionHasDetailImmediately() async throws {
    let b = book([])
    await b.load()
    let record = try #require(WorkoutSessionRecord(
      id: "new", userId: "u1", dateTime: EpochMillis(1_791_180_000_000), templateId: nil, templateName: "Legs",
      sets: [
        SessionSet(exerciseId: "e-sq", exerciseName: "Squat", weightKg: 60, reps: 5, rpe: 6, warmup: true),
        SessionSet(exerciseId: "e-sq", exerciseName: "Squat", weightKg: 100, reps: 5, rpe: 8),
      ]))
    await b.absorb(OutboxEntry(id: "new", userId: "u1", kind: WorkoutSessionRecord.outboxKind, payload: record.row, createdAt: EpochMillis(0)))
    guard case .ready(let d) = b.detail("new") else { Issue.record("phải có chi tiết"); return }
    #expect(d.title == "Legs" && d.volumeKg == 500 && d.sessionRpe == 8)
    #expect(d.exercises.first?.sets.count == 2 && d.exercises.first?.workingSets == 1)
    #expect(d.exercises.first?.sets.map(\.rpe) == [6, 8])
  }

  /// Theo người dùng: chi tiết của người khác không có trên máy của mình.
  @Test func detailIsPerUser() async {
    let cache = Cache()
    let r = row("s1", "2026-10-04T07:00:00Z", sets: "[]")
    await book([r], cache: cache, user: "alice").load()
    let bob = book([], cache: cache, user: "bob")
    await bob.load()
    #expect(bob.detail("s1") == .notFound)
  }
}
