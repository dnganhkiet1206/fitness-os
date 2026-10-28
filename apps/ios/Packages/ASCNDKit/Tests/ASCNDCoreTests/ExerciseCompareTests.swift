@testable import ASCNDCore
import Foundation
import Testing

/// Tiến bộ từng bài theo mức tạ: buổi gần nhất so với buổi trước (Kiệt 28/10).
struct ExerciseCompareTests {
  private static func perf(
    _ date: String, kind: ExerciseKind = .compound, kg: Double?, top: Int?, best: Int? = nil, secs: Int? = nil,
    sets: Int = 3
  ) -> ExercisePerformance {
    var p = ExercisePerformance(
      exerciseKey: "db press", exerciseName: "DB Press", sessionId: date, at: EpochMillis(0),
      date: LocalDate(date)!, kind: kind, setCount: sets, totalReps: 0, totalVolumeKg: 0, bestWeightKg: kg,
      bestReps: best ?? top, bestE1rmKg: nil, bestDurationSec: secs, records: [], bodyweightKg: nil)
    p.topSetReps = top
    return p
  }

  /// Set đỉnh lấy reps của CHÍNH set nặng nhất, không phải số reps nhiều nhất của buổi.
  @Test func topSetUsesRepsOfHeaviestSet() {
    let rows = [SessionHistoryRow(
      id: "s1", at: EpochMillis(iso8601: "2026-10-26T10:00:00Z")!,
      sets: .array([
        .object(["exerciseName": .string("Bench"), "weight": .number(40), "reps": .number(15)]),
        .object(["exerciseName": .string("Bench"), "weight": .number(60), "reps": .number(6)]),
        .object(["exerciseName": .string("Bench"), "weight": .number(60), "reps": .number(8)]),
      ]))]
    let perf = PerformanceHistory.performances(rows, timeZone: TimeZone(identifier: "Asia/Ho_Chi_Minh")!).first
    #expect(perf?.bestWeightKg == 60)
    #expect(perf?.bestReps == 15)
    #expect(perf?.topSetReps == 8)
  }

  @Test func weightUpBeatsRepsAndRoundsLbNoise() throws {
    let item = try #require(ExerciseCompare.item([
      Self.perf("2026-10-21", kg: 15.88, top: 9), Self.perf("2026-10-26", kg: 18.37, top: 10),
    ]))
    #expect(item.metric == .weight)
    #expect(item.delta == .weight(2.49))
    #expect(item.delta.isUp)
    #expect(item.previous?.kg == 15.88)
  }

  @Test func sameWeightComparesReps() throws {
    let more = try #require(ExerciseCompare.item([Self.perf("2026-10-21", kg: 27.2, top: 5), Self.perf("2026-10-26", kg: 27.22, top: 10)]))
    #expect(more.delta == .reps(5))
    let same = try #require(ExerciseCompare.item([Self.perf("2026-10-21", kg: 59, top: 10), Self.perf("2026-10-26", kg: 59, top: 10)]))
    #expect(same.delta == .same)
    let down = try #require(ExerciseCompare.item([Self.perf("2026-10-21", kg: 60, top: 8), Self.perf("2026-10-26", kg: 57.5, top: 8)]))
    #expect(down.delta == .weight(-2.5))
    #expect(down.delta.isDown)
  }

  @Test func bodyweightAndTimedAndFirst() throws {
    let bw = try #require(ExerciseCompare.item([
      Self.perf("2026-10-21", kind: .bodyweight, kg: 0, top: 15), Self.perf("2026-10-26", kind: .bodyweight, kg: 0, top: 18),
    ]))
    #expect(bw.metric == .reps)
    #expect(bw.delta == .reps(3))
    let hold = try #require(ExerciseCompare.item([
      Self.perf("2026-10-21", kind: .timed, kg: 0, top: nil, secs: 45), Self.perf("2026-10-26", kind: .timed, kg: 0, top: nil, secs: 60),
    ]))
    #expect(hold.metric == .time)
    #expect(hold.delta == .seconds(15))
    let first = try #require(ExerciseCompare.item([Self.perf("2026-10-26", kg: 27.2, top: 10)]))
    #expect(first.delta == .first)
    #expect(ExerciseCompare.item([]) == nil)
  }

  /// Buổi 0 kg của bài có tạ (quên nhập tạ): "Chưa ghi tạ", không phải "−25 kg".
  @Test func zeroKgSessionOfWeightedExerciseIsNotADrop() throws {
    let item = try #require(ExerciseCompare.item([Self.perf("2026-10-14", kg: 25, top: 5), Self.perf("2026-10-21", kg: 0, top: 10)]))
    #expect(item.metric == .weight)
    #expect(item.delta == .noWeight)
    #expect(!item.delta.isDown)
    #expect(ExerciseCompare.next(item) == nil)
    #expect(ExerciseCompare.summary([item]) == ExerciseCompare.Summary())
  }

  @Test func summaryCountsAndNextTarget() throws {
    let up = try #require(ExerciseCompare.item([Self.perf("2026-10-21", kg: 15.9, top: 9), Self.perf("2026-10-26", kg: 18.4, top: 10)]))
    let reps = try #require(ExerciseCompare.item([Self.perf("2026-10-21", kg: 27.2, top: 5), Self.perf("2026-10-26", kg: 27.2, top: 10)]))
    let first = try #require(ExerciseCompare.item([Self.perf("2026-10-26", kg: 27.2, top: 10)]))
    let s = ExerciseCompare.summary([up, reps, first])
    #expect(s == ExerciseCompare.Summary(weightUp: 1, repsUp: 1, same: 0, down: 0))
    #expect(ExerciseCompare.next(up) == .holdWeight(kg: 18.4, low: 11, high: 12))
    let full = try #require(ExerciseCompare.item([Self.perf("2026-10-26", kg: 20, top: 12)]))
    #expect(ExerciseCompare.next(full) == .addWeight(kg: 20))
  }
}
