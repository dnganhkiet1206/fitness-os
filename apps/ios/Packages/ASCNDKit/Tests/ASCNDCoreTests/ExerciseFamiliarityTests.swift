@testable import ASCNDCore
import Foundation
import Testing

/// Bài quen thuộc + yêu thích (Kiệt 15/11).
struct ExerciseFamiliarityTests {
  static func perf(_ name: String, session: String, at: Int64) -> ExercisePerformance {
    ExercisePerformance(
      exerciseKey: PersonalRecords.exerciseKey(name), exerciseName: name, sessionId: session, at: EpochMillis(at),
      date: LocalDate("2026-11-10")!, kind: .compound, setCount: 3, totalReps: 24, totalVolumeKg: 0,
      bestWeightKg: nil, bestReps: nil, bestE1rmKg: nil, bestDurationSec: nil, records: [], bodyweightKg: nil,
      topSetReps: nil)
  }

  static func ex(_ id: String, _ name: String) -> LibraryExercise {
    LibraryExercise(id: id, userId: nil, name: name, muscleGroup: "chest", equipment: nil, kind: nil)
  }

  /// Đếm BUỔI khác nhau (hai bài cùng tên trong một buổi vẫn là một buổi).
  @Test func usageCountsSessions() {
    let u = ExerciseFamiliarity.usage([
      Self.perf("Bench Press", session: "a", at: 1), Self.perf("Bench Press", session: "a", at: 1),
      Self.perf("Bench Press", session: "b", at: 5), Self.perf("Leg Press", session: "b", at: 5),
    ])
    #expect(u["bench press"] == ExerciseUsage(sessions: 2, lastAt: EpochMillis(5)))
    #expect(u["leg press"]?.sessions == 1)
    #expect(ExerciseFamiliarity.counts(u) == ["bench press": 2, "leg press": 1])
  }

  /// Bộ lọc Quen thuộc: chỉ bài đã tập, nhiều buổi trước, bằng nhau thì gần đây trước.
  @Test func familiarOrder() {
    let list = [Self.ex("1", "Bench Press"), Self.ex("2", "Leg Press"), Self.ex("3", "Plank"), Self.ex("4", "Deadlift")]
    let u = ExerciseFamiliarity.usage([
      Self.perf("Leg Press", session: "a", at: 1), Self.perf("Leg Press", session: "b", at: 2),
      Self.perf("Bench Press", session: "c", at: 3), Self.perf("Deadlift", session: "d", at: 9),
    ])
    #expect(ExerciseFamiliarity.familiar(list, usage: u).map(\.name) == ["Leg Press", "Deadlift", "Bench Press"])
  }

  /// Chưa gõ: yêu thích → hay tập (từ 2 buổi) → phổ biến → còn lại.
  @Test func personalFirstOrder() {
    let all = RealLibrary.all
    let plank = all.first { $0.name == "Plank" }!
    let rocky = all.first { $0.name == "Rocky Pull-Ups/Pulldowns" }!
    let out = ExerciseSearch.personalFirst(all, usage: ["rocky pull-ups/pulldowns": 2], favorites: [plank.id])
    #expect(out[0].id == plank.id)
    #expect(out[1].id == rocky.id)
    #expect(out[2].name == "Bench Press")
    // Chỉ một buổi thì chưa vượt bài phổ biến nhất.
    let once = ExerciseSearch.personalFirst(all, usage: ["rocky pull-ups/pulldowns": 1])
    #expect(once.first?.name == "Bench Press")
    #expect(ExerciseSearch.personalFirst(all).prefix(3).map(\.name) == ["Bench Press", "Barbell Squat", "Deadlift"])
  }

  /// Có chữ gõ: bài yêu thích / hay tập lên trên bài phổ biến cùng chữ gõ.
  @Test func rankUsesFavoritesAndUsage() {
    let all = RealLibrary.all
    let decline = all.first { $0.name == "Decline Dumbbell Bench Press" }!
    let ranked = ExerciseSearch.rank(all, query: "dumbbell bench", favorites: [decline.id])
    #expect(ranked.first?.id == decline.id)
    // Sao của chính người dùng thắng độ phổ biến chung…
    let chains = all.first { $0.name == "Bench Press with Chains" }!
    #expect(ExerciseSearch.rank(all, query: "bench", favorites: [chains.id]).first?.id == chains.id)
    // …nhưng không làm một bài không khớp hiện ra.
    #expect(!ExerciseSearch.rank(all, query: "squat", favorites: [chains.id]).contains { $0.id == chains.id })
    let used = ExerciseSearch.rank(all, query: "curl", usage: ["hammer curls": 6])
    #expect(used.first?.name == "Hammer Curls")
  }

  @MainActor @Test func favoritesAreAbsoluteAndPersisted() {
    let store = MemoryFavorites()
    let f = ExerciseFavorites(userId: "u1", store: store)
    f.set("ABC", true)
    f.set("abc", true)  // đặt lại cùng giá trị: không đổi
    #expect(f.contains("abc") && store.saves == 1)
    f.set("abc", false)
    #expect(!f.contains("abc") && store.saves == 2)
    f.set("x", true)
    // Mở lại: đọc từ nơi lưu, theo đúng tài khoản.
    #expect(ExerciseFavorites(userId: "u1", store: store).contains("x"))
    #expect(!ExerciseFavorites(userId: "u2", store: store).contains("x"))
    let list = [Self.ex("x", "Plank"), Self.ex("y", "Row")]
    #expect(f.filter(list).map(\.id) == ["x"])
  }

  @MainActor @Test func manualLogUsesPersonalOrder() {
    let all = RealLibrary.all
    let plank = all.first { $0.name == "Plank" }!
    #expect(ManualLogController.suggestions(for: "", in: all, favorites: [plank.id]).first?.id == plank.id)
  }
}

final class MemoryFavorites: ExerciseFavoriteStore, @unchecked Sendable {
  private var data: [String: Set<String>] = [:]
  private(set) var saves = 0
  func load(userId: String, slot: ExerciseFavoriteSlot) -> Set<String> { data["\(slot):\(userId)"] ?? [] }
  func save(userId: String, slot: ExerciseFavoriteSlot, _ ids: Set<String>) {
    data["\(slot):\(userId)"] = ids
    if slot == .local { saves += 1 }
  }
}

/// Bảng `exercise_favorites` giả: nhớ cờ theo (người, bài); có thể từ chối một bài (khoá
/// ngoại hỏng) hay cả bảng (chưa deploy / mất mạng).
final class FakeFavoriteRows: RowStore, @unchecked Sendable {
  var flags: [String: Bool] = [:]
  var missingTable = false
  var unknownExercises: Set<String> = []
  private(set) var upserts = 0

  func select(_ q: RowQuery) async throws(RowStoreError) -> [JSONValue] {
    if missingTable { throw RowStoreError(code: "42P01", message: "relation does not exist") }
    return flags.filter(\.value).keys.sorted().map {
      .object(["exercise_id": .string($0), "is_favorite": .bool(true)])
    }
  }
  func insert(_ table: String, _ row: [String: JSONValue]) async throws(RowStoreError) {}
  func update(_ table: String, _ row: [String: JSONValue], where filters: [RowQuery.Filter]) async throws(RowStoreError) -> Int { 0 }
  func upsert(_ table: String, _ rows: [[String: JSONValue]], onConflict: String) async throws(RowStoreError) {
    if missingTable { throw RowStoreError(code: "42P01", message: "relation does not exist") }
    for r in rows {
      let id = r["exercise_id"]?.stringValue ?? ""
      if unknownExercises.contains(id) { throw RowStoreError(code: "23503", message: "fk") }
      flags[id] = r["is_favorite"] == .bool(true)
      upserts += 1
    }
  }
}

/// Đồng bộ sao với `exercise_favorites` (16/11).
struct ExerciseFavoritesSyncTests {
  @Test func rowsAreAbsoluteFlags() {
    let rows = ExerciseFavoritesSync.rows(from: ["a", "b"], to: ["b", "c"], userId: "u")
    #expect(rows.map { $0["exercise_id"]?.stringValue } == ["c", "a"])
    #expect(rows.map { $0["is_favorite"] } == [.bool(true), .bool(false)])
    #expect(ExerciseFavoritesSync.rows(from: ["a"], to: ["a"], userId: "u").isEmpty)
    #expect(ExerciseFavoritesSync.decode([
      .object(["exercise_id": .string("ABC"), "is_favorite": .bool(true)]),
      .object(["exercise_id": .string("x"), "is_favorite": .bool(false)]),
    ]) == ["abc"])
  }

  /// Bảng chưa deploy: sao vẫn ở trên máy, không mất; deploy xong thì lần sau gửi bù.
  @MainActor @Test func keepsLocalUntilTableExists() async {
    let store = MemoryFavorites()
    let rows = FakeFavoriteRows()
    rows.missingTable = true
    let f = ExerciseFavorites(userId: "u", store: store)
    f.set("a", true)
    #expect(await f.sync(rows: rows) == false)
    #expect(f.contains("a"))
    rows.missingTable = false
    _ = await f.sync(rows: rows)
    #expect(rows.flags == ["a": true])
    f.set("a", false)
    _ = await f.sync(rows: rows)
    #expect(rows.flags == ["a": false])
  }

  /// Sao đánh ở máy khác về tới đây khi máy này không còn gì chờ gửi.
  @MainActor @Test func adoptsServerWhenNothingPending() async {
    let store = MemoryFavorites()
    let rows = FakeFavoriteRows()
    rows.flags = ["z": true]
    let f = ExerciseFavorites(userId: "u", store: store)
    #expect(await f.sync(rows: rows) == true)
    #expect(f.contains("z"))
    // Mở lại: bản đã nhận được lưu trên máy.
    #expect(ExerciseFavorites(userId: "u", store: store).contains("z"))
  }

  /// Một bài server chưa có (vừa tạo, còn trong hàng chờ) không chặn các sao khác, và không
  /// bị server ghi đè mất trong lúc chờ.
  @MainActor @Test func oneBadRowDoesNotBlockOthers() async {
    let store = MemoryFavorites()
    let rows = FakeFavoriteRows()
    rows.unknownExercises = ["new"]
    let f = ExerciseFavorites(userId: "u", store: store)
    f.set("new", true)
    f.set("old", true)
    _ = await f.sync(rows: rows)
    #expect(rows.flags == ["old": true])
    #expect(f.contains("new") && f.contains("old"))
    rows.unknownExercises = []
    _ = await f.sync(rows: rows)
    #expect(rows.flags == ["new": true, "old": true])
  }
}

/// Độ phổ biến từ số liệu thật (16/11).
struct ExercisePopularityTests {
  static func rows(_ n: Int) -> [ExercisePopularity.Row] {
    (0..<n).map { ExercisePopularity.Row(key: "lift \($0)", sessions: 10 + $0, users: 5) }
  }

  @Test func tooLittleDataKeepsCurated() {
    let curated = ExerciseSearch.popularity
    #expect(ExercisePopularity.blend(curated: curated, server: Self.rows(19)) == curated)
    #expect(ExercisePopularity.blend(curated: curated, server: []) == curated)
  }

  @Test func realDataTakesOver() {
    var server = Self.rows(25)
    server.append(.init(key: "hip thrust machine", sessions: 400, users: 60))
    server.append(.init(key: "bench press", sessions: 10, users: 6))
    let t = ExercisePopularity.blend(curated: ExerciseSearch.popularity, server: server)
    // Bài được tập nhiều nhất = 1, kể cả khi không có trong danh sách soạn tay.
    #expect(t["hip thrust machine"] == 1)
    // Bài cơ bản ít người tập vẫn giữ 0,6 × soạn tay, không tụt về 0.
    #expect(abs((t["bench press"] ?? 0) - 0.6) < 0.001)
    // Bài soạn tay không ai tập: 0,6 × điểm cũ.
    #expect(abs((t["deadlift"] ?? 0) - 0.6 * (ExerciseSearch.popularity["deadlift"] ?? 0)) < 0.001)
  }

  @Test func decodesRpcRows() {
    let rows = ExercisePopularity.decode([
      .object(["exercise_key": .string("bench press"), "sessions": .number(8), "users": .number(6)]),
      .object(["exercise_key": .string(""), "sessions": .number(1), "users": .number(5)]),
      .object(["exercise_key": .string("squat"), "sessions": .string("3"), "users": .string("5")]),
    ])
    #expect(rows == [.init(key: "bench press", sessions: 8, users: 6), .init(key: "squat", sessions: 3, users: 5)])
  }

  @Test func defaultIsCurated() {
    #expect(ExercisePopularity.current == ExerciseSearch.popularity)
  }
}
