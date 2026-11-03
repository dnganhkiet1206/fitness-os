import Testing

@testable import ASCNDCore

@Suite struct SessionCompareTests {
  private func d(_ t: String) -> LocalDate { LocalDate(t)! }
  private let lb = 0.45359237

  private func perf(_ name: String, _ date: String, kg: Double, reps: Int, at: Int64, kind: ExerciseKind = .compound)
    -> ExercisePerformance
  {
    ExercisePerformance(
      exerciseKey: PersonalRecords.exerciseKey(name), exerciseName: name, sessionId: date, at: EpochMillis(at),
      date: d(date), kind: kind, setCount: 3, totalReps: reps * 3, totalVolumeKg: kg * Double(reps * 3),
      bestWeightKg: kg, bestReps: reps, bestE1rmKg: nil, bestDurationSec: nil, records: [], bodyweightKg: nil,
      topSetReps: reps)
  }

  /// Ví dụ của Kiệt (03/11): hôm qua 50 lb, hôm nay 55 lb → "+5 lb", không phải tổng khối lượng.
  @Test func benchUpFivePoundsReadsAsFivePounds() {
    let before = [perf("Bench Press", "2026-11-02", kg: 50 * lb, reps: 8, at: 1000)]
    let now = [ExerciseCompare.DoneSet(kg: 55 * lb, reps: 8), .init(kg: 55 * lb, reps: 6)]
    let item = ExerciseCompare.session(
      name: "Bench Press", sets: now, date: d("2026-11-03"), previous: before, since: EpochMillis(5000))
    guard case .weight(let kg) = item?.delta else { Issue.record("phải so theo tạ"); return }
    #expect(abs(WeightUnit.lbs.display(kg) - 5) < 0.05)
    #expect(item?.last.reps == 8, "set đỉnh: tạ nặng nhất, nhiều reps nhất")
  }

  @Test func thisSessionInHistoryIsNotComparedWithItself() {
    let history = [
      perf("Squat", "2026-10-30", kg: 60, reps: 5, at: 1000), perf("Squat", "2026-11-03", kg: 62.5, reps: 5, at: 9000),
    ]
    let item = ExerciseCompare.session(
      name: "Squat", sets: [.init(kg: 62.5, reps: 5)], date: d("2026-11-03"), previous: history, since: EpochMillis(9000))
    #expect(item?.delta == .weight(2.5))
  }

  @Test func firstTimeAndSameWeightMoreReps() {
    let first = ExerciseCompare.session(
      name: "Row", sets: [.init(kg: 40, reps: 10)], date: d("2026-11-03"), previous: [], since: EpochMillis(1))
    #expect(first?.delta == .first)
    let more = ExerciseCompare.session(
      name: "Row", sets: [.init(kg: 40, reps: 10)], date: d("2026-11-03"),
      previous: [perf("Row", "2026-10-30", kg: 40, reps: 8, at: 1)], since: EpochMillis(5))
    #expect(more?.delta == .reps(2))
  }

  @Test func bodyweightComparesReps() {
    let item = ExerciseCompare.session(
      name: "Push-up", sets: [.init(kg: 0, reps: 15)], date: d("2026-11-03"),
      previous: [perf("Push-up", "2026-10-30", kg: 0, reps: 12, at: 1, kind: .bodyweight)], since: EpochMillis(5))
    #expect(item?.metric == .reps && item?.delta == .reps(3))
  }

  @Test func headlinePicksTheBiggestRelativeWeightGain() {
    func item(_ name: String, _ from: Double, _ to: Double) -> ExerciseCompare.Item {
      ExerciseCompare.session(
        name: name, sets: [.init(kg: to, reps: 5)], date: d("2026-11-03"),
        previous: [perf(name, "2026-10-30", kg: from, reps: 5, at: 1)], since: EpochMillis(5))!
    }
    let items = [item("Deadlift", 140, 142.5), item("Curl", 10, 12), item("Press", 40, 40)]
    #expect(ExerciseCompare.headline(items)?.name == "Curl", "+20 % hơn +1,8 %")
    #expect(ExerciseCompare.headline([item("Press", 40, 40)]) == nil)
  }
}
