@testable import ASCNDCore
import ASCNDTestSupport
import Foundation
import Testing

/// Thư viện bài tập (#420) — đường đọc. Bảng nhóm cơ so với CHÍNH
/// `muscle-group.ts` @ fac9ac2 (`Fixtures/muscle-golden.json`).

private func ex(
  _ id: String, _ name: String, _ group: String?, user: String? = nil, kind: String? = nil, equipment: String? = nil
) -> LibraryExercise {
  LibraryExercise(id: id, userId: user, name: name, muscleGroup: group, equipment: equipment, kind: kind)
}

/// Như server trả: `muscle_group` rồi `name`; nhãn cũ "Ngực" lẫn khoá mới "chest".
private let catalog = [
  ex("1", "Bench Press", "chest", equipment: "barbell"),
  ex("2", "Incline Dumbbell Press", "Chest/Shoulders"),
  ex("3", "Push-up", "Ngực"),
  ex("4", "Curl", "biceps", kind: "compound"),
  ex("5", "Hammer Curl", "Tay trước"),
  ex("6", "Plank", "core", kind: "timed"),
  ex("7", "Mystery Move", nil),
  ex("8", "Curl", "biceps", user: "u1", kind: "isolation"),
]

struct MuscleGroupGoldenTests {
  @Test func matchesRN() throws {
    let url = try #require(Bundle.module.url(forResource: "muscle-golden", withExtension: "json", subdirectory: "Fixtures"))
    let root = try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: url))
    guard case .array(let cases)? = root["cases"] else { throw CocoaError(.fileReadCorruptFile) }
    #expect(cases.count > 40)
    for c in cases {
      let input = c["input"]?.stringValue
      var keys: [String] = []
      if case .array(let k)? = c["keys"] { keys = k.compactMap(\.stringValue) }
      #expect(MuscleGroup.keys(for: input).map(\.rawValue) == keys, "\(input ?? "null")")
      #expect(MuscleGroup.canonical(input) == c["canonical"]?.stringValue, "\(input ?? "null")")
      #expect(MuscleGroup.label(input, .vi) == c["vi"]?.stringValue, "\(input ?? "null")")
      #expect(MuscleGroup.label(input, .en) == c["en"]?.stringValue, "\(input ?? "null")")
      #expect(MuscleGroup.label(input, .es) == c["es"]?.stringValue, "\(input ?? "null")")
    }
  }
}

struct ExerciseCatalogTests {
  /// Màn thư viện: gộp theo NHÃN — "Ngực" cũ và "chest" mới một mục; bài
  /// không nhóm vào "—"; mục theo thứ tự xuất hiện.
  @Test func sectionsGroupByLabel() {
    let s = ExerciseCatalog.sections(catalog, query: "", lang: .vi)
    #expect(s.map(\.title) == ["Ngực", "Ngực / Vai", "Tay trước", "Bụng", "—"])
    #expect(s[0].exercises.map(\.id) == ["1", "3"])
    #expect(ExerciseCatalog.sections(catalog, query: "", lang: .en).first?.title == "Chest")
  }

  /// Lọc theo nhóm cơ đọc khoá hình cơ: bài "Chest/Shoulders" có ở cả Ngực lẫn Vai.
  @Test func filterByMuscleAndName() {
    #expect(ExerciseCatalog.filter(catalog, query: "", muscle: .shoulders).map(\.id) == ["2"])
    #expect(ExerciseCatalog.filter(catalog, query: "", muscle: .chest).map(\.id) == ["1", "2", "3"])
    #expect(ExerciseCatalog.filter(catalog, query: "  CURL ").map(\.id) == ["4", "5", "8"])
    #expect(ExerciseCatalog.filter(catalog, query: "press", muscle: .chest).map(\.id) == ["1", "2"])
  }

  /// Ô gợi ý tên bài của màn ghi tay: tối đa 5; trống thì cả thư viện; trùng
  /// đúng chữ đã gõ thì thôi gợi ý.
  @Test func suggestions() {
    #expect(ExerciseCatalog.suggestions(catalog, for: "").count == 5)
    #expect(ExerciseCatalog.suggestions(catalog, for: "curl").map(\.id) == ["5"])
    #expect(ExerciseCatalog.suggestions(catalog, for: "cu").map(\.id) == ["4", "5", "8"])
    #expect(ExerciseCatalog.suggestions(catalog, for: "zzz").isEmpty)
  }

  /// Loại bài khai báo: bài của mình thắng bài mẫu cùng tên, bỏ bài không khai.
  @Test func declaredKindsPreferOwnRows() {
    #expect(ExerciseCatalog.declaredKinds(catalog) == ["curl": "isolation", "plank": "timed"])
    #expect(ExerciseCatalog.declaredKinds(Array(catalog.prefix(7))) == ["curl": "compound", "plank": "timed"])
    // Bài mẫu đứng SAU bài của mình vẫn không giành lại.
    #expect(ExerciseCatalog.declaredKinds([catalog[7], catalog[3]]) == ["curl": "isolation"])
  }

  @Test func builtInVersusOwn() {
    #expect(catalog[0].isBuiltIn && !catalog[7].isBuiltIn)
    #expect(catalog[1].muscles == [.chest, .shoulders])
  }
}

private actor Source: ExerciseSource {
  var list: [LibraryExercise]
  var down = false
  init(_ list: [LibraryExercise]) { self.list = list }
  func setDown(_ d: Bool) { down = d }
  func exercises(userId: String) async throws -> [LibraryExercise] {
    if down { throw URLError(.notConnectedToInternet) }
    return list
  }
}
private actor Cache: ExerciseCache {
  var byUser: [String: [LibraryExercise]] = [:]
  func load(userId: String) async throws -> [LibraryExercise]? { byUser[userId] }
  func save(userId: String, _ list: [LibraryExercise]) async throws { byUser[userId] = list }
}

@MainActor
struct ExerciseLibraryTests {
  @Test func loadsAndKeepsServerOrder() async {
    let lib = ExerciseLibrary(userId: "u1", source: Source(catalog), cache: Cache())
    await lib.load()
    #expect(lib.loaded && lib.failure == nil)
    #expect(lib.exercises.map(\.id) == catalog.map(\.id))
    #expect(lib.exercise(id: "6")?.name == "Plank")
  }

  /// Offline: bản trên máy hiện, lỗi gọi đúng tên; người khác không thấy nó.
  @Test func offlineReadsTheCachePerUser() async {
    let source = Source(catalog)
    let cache = Cache()
    await ExerciseLibrary(userId: "u1", source: source, cache: cache).load()
    await source.setDown(true)
    let again = ExerciseLibrary(userId: "u1", source: source, cache: cache)
    await again.load()
    #expect(again.failure == .offline && again.exercises.count == catalog.count)
    let other = ExerciseLibrary(userId: "u2", source: source, cache: cache)
    await other.load()
    #expect(other.exercises.isEmpty && !other.loaded)
  }

  /// Bài riêng của người khác (RLS hỏng, bản cũ) không bao giờ vào cache; id
  /// trùng chỉ giữ một.
  @Test func neverKeepsAnotherUsersRows() async {
    let lib = ExerciseLibrary(
      userId: "u1", source: Source(catalog + [ex("9", "Secret", "back", user: "u2"), catalog[0]]), cache: Cache())
    await lib.load()
    #expect(lib.exercises.map(\.id) == catalog.map(\.id))
  }

  /// Khai báo "curl là isolation" tới được phân tích qua `WorkoutFlow`.
  @Test func flowFeedsDeclaredKindsToInsights() async throws {
    struct NoPlan: TemplateSource, TemplateCache, TrainingHistory, RecordHistory, PerformanceSource {
      func fetch(userId: String) async throws -> TemplateSnapshot { TemplateSnapshot(routine: [], templates: [], fetchedAt: EpochMillis(0)) }
      func load(userId: String) async throws -> TemplateSnapshot? { nil }
      func save(userId: String, _ snapshot: TemplateSnapshot) async throws {}
      func sessionTimes(userId: String, since: EpochMillis) async throws -> [EpochMillis] { [] }
      func recentSessionSets(userId: String, limit: Int) async throws -> [JSONValue] { [] }
      func sessions(userId: String, since: EpochMillis) async throws -> [SessionHistoryRow] {
        [SessionHistoryRow(id: "s", at: EpochMillis(1_791_183_600_000 - 86_400_000), sets: .array([
          .object(["exerciseName": .string("Curl"), "weight": .number(15), "reps": .number(8)]),
        ]))]
      }
    }
    actor Caches: RecordBookCache, PerformanceCache, InsightCache {
      func load(userId: String) async throws -> PersonalRecords.Bests? { nil }
      func save(userId: String, _ bests: PersonalRecords.Bests) async throws {}
      func load(userId: String) async throws -> [String: LastPerformance]? { nil }
      func save(userId: String, _ table: [String: LastPerformance]) async throws {}
      func load(userId: String) async throws -> InsightSnapshot? { nil }
      func save(userId: String, _ snapshot: InsightSnapshot) async throws {}
    }
    let clock = ManualClock(EpochMillis(1_791_183_600_000))
    let tz = TimeZone(identifier: "Asia/Ho_Chi_Minh")!
    let store = InMemoryWorkoutStore()
    let insights = InsightBook(userId: "u1", source: NoPlan(), cache: Caches(), clock: clock, timeZone: tz)
    let performance = PerformanceBook(userId: "u1", source: NoPlan(), cache: Caches(), clock: clock, timeZone: tz)
    let flow = WorkoutFlow(
      today: TodayController(
        userId: "u1", repository: TodayRepository(source: NoPlan(), cache: NoPlan()), history: NoPlan(),
        workouts: store, clock: clock, timeZone: tz),
      records: RecordBook(userId: "u1", history: NoPlan(), cache: Caches()), performance: performance,
      insights: insights, library: ExerciseLibrary(userId: "u1", source: Source(catalog), cache: Cache()),
      store: store, clock: clock, timeZone: tz)
    await flow.start()
    #expect(insights.declaredKinds["curl"] == "isolation", "bài của mình thắng")
    // Không khai báo thì 15 kg × 8 suy ra compound (e1RM); khai báo đổi thang.
    #expect(try #require(insights.insight(for: "Curl")).kind == .isolation)
    #expect(insights.insight(for: "Curl")?.unit == .kgRep)
    #expect(performance.declaredKinds["plank"] == "timed")
  }
}
