@testable import ASCNDCore
import Foundation
import Testing

/// Thẻ "Tăng tải hôm nay" (Kiệt duyệt mock 28/10).
struct OverloadPlanTests {
  static func perf(_ name: String, _ kind: ExerciseKind, weight: Double?, reps: Int?) -> ExercisePerformance {
    ExercisePerformance(
      exerciseKey: PersonalRecords.exerciseKey(name), exerciseName: name, sessionId: "s", at: EpochMillis(0),
      date: LocalDate("2026-10-27")!, kind: kind, setCount: 3, totalReps: 24, totalVolumeKg: 0,
      bestWeightKg: weight, bestReps: reps, bestE1rmKg: nil, bestDurationSec: nil, records: [], bodyweightKg: nil,
      topSetReps: reps)
  }

  static func insight(
    _ name: String, _ kind: ExerciseKind, sessions: Int, readiness: ExerciseTrend.Readiness
  ) -> ExerciseInsight {
    ExerciseInsight(
      exerciseKey: PersonalRecords.exerciseKey(name), exerciseName: name, kind: kind, lastTrainedDays: 2,
      stale: false, trend: .improving, readiness: readiness, confidence: .high, sessions: sessions, current: nil,
      previous: nil, changePct: nil, unit: .kg, bestWeightKg: nil, bestReps: nil, bestE1rmKg: nil,
      bestDurationSec: nil, evidence: [], generatedAt: EpochMillis(0))
  }

  static func plan(
    _ rows: [(String, ExerciseKind, Double?, Int?, Int, ExerciseTrend.Readiness)], targetReps: Int = 8,
    lowRecovery: Bool = false, unit: WeightUnit = .kg
  ) -> [OverloadPlan.Item] {
    let template = WorkoutTemplate(
      id: "t", name: "Chest day",
      exercises: rows.map { TemplateExercise(exerciseName: $0.0, sets: 3, reps: targetReps, weightKg: 0) })
    let perfs = Dictionary(uniqueKeysWithValues: rows.map { ($0.0, perf($0.0, $0.1, weight: $0.2, reps: $0.3)) })
    let insights = Dictionary(
      uniqueKeysWithValues: rows.map { ($0.0, insight($0.0, $0.1, sessions: $0.4, readiness: $0.5)) })
    return OverloadPlan.items(
      template: template, insight: { insights[$0] }, last: { perfs[$0] }, stepKg: OverloadPlan.stepKg(unit),
      lowRecovery: lowRecovery)
  }

  @Test func compoundReadyAddsOneWeightStep() {
    let items = Self.plan([("Bench press", .compound, 60, 8, 6, .readyToProgress)])
    #expect(items.map(\.advice) == [.addWeight(fromKg: 60, toKg: 62.5, reps: 8)])
  }

  @Test func poundAccountsStepFivePounds() {
    let items = Self.plan([("Bench press", .compound, 135 / Units.lbPerKg, 8, 6, .readyToProgress)], unit: .lbs)
    guard case .addWeight(_, let to, _) = items.first?.advice else {
      Issue.record("không tăng tạ")
      return
    }
    #expect(WeightUnit.lbs.text(to) == "140")
  }

  @Test func isolationAddsRepsUntilHeadroomThenWeight() {
    #expect(
      Self.plan([("Cable fly", .isolation, 15, 9, 5, .readyToProgress)]).first?.advice
        == .addRep(weightKg: 15, from: 9, to: 10))
    #expect(
      Self.plan([("Cable fly", .isolation, 15, 11, 5, .readyToProgress)]).first?.advice
        == .addWeight(fromKg: 15, toKg: 17.5, reps: 8))
  }

  @Test func bodyweightAddsARep() {
    #expect(
      Self.plan([("Dips", .bodyweight, nil, 10, 4, .readyToProgress)]).first?.advice
        == .addRep(weightKg: nil, from: 10, to: 11))
  }

  @Test func notReadyOrMaintainHolds() {
    let items = Self.plan([
      ("Bench press", .compound, 60, 8, 6, .maintain), ("Squat", .compound, 100, 5, 6, .notReady),
    ])
    #expect(items.map(\.advice) == [.hold(weightKg: 60, reps: 8), .hold(weightKg: 100, reps: 5)])
  }

  @Test func fewSessionsOrNoHistoryIsNotEnough() {
    let items = Self.plan([("Dips", .bodyweight, nil, 10, 1, .notReady)])
    #expect(items.first?.advice == .notEnough(sessions: 1))
    let template = WorkoutTemplate(
      id: "t", name: "x", exercises: [TemplateExercise(exerciseName: "New lift", sets: 3, reps: 8, weightKg: 0)])
    let none = OverloadPlan.items(template: template, insight: { _ in nil }, last: { _ in nil }, stepKg: 2.5)
    #expect(none.first?.advice == .notEnough(sessions: 0))
  }

  @Test func lowRecoveryNeverSuggestsUp() {
    let items = Self.plan([("Bench press", .compound, 60, 8, 6, .readyToProgress)], lowRecovery: true)
    #expect(items.first?.advice == .hold(weightKg: 60, reps: 8))
  }

  @Test func timedHolds() {
    #expect(
      Self.plan([("Plank", .timed, nil, 1, 6, .readyToProgress)]).first?.advice == .hold(weightKg: nil, reps: 1))
  }

  @Test func keepsTemplateOrderAndDropsDuplicates() {
    let template = WorkoutTemplate(
      id: "t", name: "x",
      exercises: ["Bench press", "bench press", "Dips"].map {
        TemplateExercise(exerciseName: $0, sets: 3, reps: 8, weightKg: 0)
      })
    let items = OverloadPlan.items(template: template, insight: { _ in nil }, last: { _ in nil }, stepKg: 2.5)
    #expect(items.map(\.name) == ["Bench press", "Dips"])
  }
}
