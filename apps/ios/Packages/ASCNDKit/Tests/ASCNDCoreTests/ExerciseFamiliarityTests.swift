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
  func load(userId: String) -> Set<String> { data[userId] ?? [] }
  func save(userId: String, _ ids: Set<String>) {
    data[userId] = ids
    saves += 1
  }
}
