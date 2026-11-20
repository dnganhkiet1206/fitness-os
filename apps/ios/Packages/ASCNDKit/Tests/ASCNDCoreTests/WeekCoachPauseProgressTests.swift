@testable import ASCNDCore
import Foundation
import Testing

/// KOA-T23 (Kiệt 19/11): thẻ đầu tuần khi Tạm nghỉ, và "Tăng tạ" áp thật vào buổi tuần này.
struct WeekCoachPauseProgressTests {
  static let up = OverloadPlan.Item(name: "Bench Press", advice: .addWeight(fromKg: 60, toKg: 62.5, reps: 8))
  static let rep = OverloadPlan.Item(name: "Fly", advice: .addRep(weightKg: 10, from: 12, to: 13))
  static let hold = OverloadPlan.Item(name: "Row", advice: .hold(weightKg: 50, reps: 10))

  @Test func pausedNowOverridesEverything() {
    let k = KoaWeekCoach.decide(lastWeek: .init(planned: 3, done: 0), daysOff: 20, targets: [Self.up], pausedNow: true)
    #expect(k == .paused)
    #expect(KoaWeekCoach.Kind.paused.emotion == .sleep)
  }

  /// Tuần trước có ngày Tạm nghỉ: trừ khỏi đích, nên không thành "lỡ một nửa" → không tuần nhẹ.
  @Test func pausedDaysAreNotMissed() {
    let withoutPause = KoaWeekCoach.LastWeek(planned: 4, done: 2)
    #expect(withoutPause.missedHalf)
    let pauseAdjusted = KoaWeekCoach.LastWeek(planned: 2, done: 2)
    #expect(KoaWeekCoach.decide(lastWeek: pauseAdjusted, daysOff: 1, targets: [Self.up]) == .progress)
  }

  @Test func targetsOnlyForUpAdvice() {
    let t = ProgressWeek.targets(from: [Self.up, Self.rep, Self.hold])
    #expect(t.count == 2)
    #expect(t[PersonalRecords.exerciseKey("Bench Press")] == .init(weightKg: 62.5, reps: 8))
    #expect(t[PersonalRecords.exerciseKey("Fly")] == .init(weightKg: 10, reps: 13))
  }

  @Test func acceptedProgressRaisesTheSessionNeverLowers() {
    let template = WorkoutTemplate(id: "t", name: "Chest", exercises: [
      TemplateExercise(exerciseName: "Bench Press", sets: 3, reps: 8, weightKg: 60),
      TemplateExercise(exerciseName: "Fly", sets: 2, reps: 15, weightKg: 12),
      TemplateExercise(exerciseName: "Row", sets: 3, reps: 10, weightKg: 50),
    ])
    let plan = TodayPlan(date: LocalDate("2026-11-18")!, status: .todo, template: template, isDeload: false)
    let t = ProgressWeek.targets(from: [Self.up, Self.rep])
    let rows = plan.sessionPlan(variant: .full, progress: t)!.rows
    #expect(rows.filter { $0.exerciseName == "Bench Press" }.allSatisfy { $0.weightKg == 62.5 && $0.reps == 8 })
    #expect(rows.filter { $0.exerciseName == "Fly" }.allSatisfy { $0.weightKg == 12 && $0.reps == 15 }, "không hạ")
    #expect(rows.filter { $0.exerciseName == "Row" }.allSatisfy { $0.weightKg == 50 })
    // Bản nhẹ không bị nâng; không nhận thì như mẫu.
    #expect(plan.sessionPlan(variant: .lighter, progress: t)!.rows.allSatisfy { $0.exerciseName != "Bench Press" || $0.weightKg == 60 })
    #expect(plan.sessionPlan(variant: .full)!.rows == plan.sessionPlan!.rows)
  }

  @Test func choiceIsPerUserAndWeek() throws {
    let d = try #require(UserDefaults(suiteName: "progressweek-\(UUID())"))
    let wed = LocalDate("2026-11-18")!
    ProgressWeek.set(ProgressWeek.targets(from: [Self.up]), userId: "u", week: wed, in: d)
    #expect(ProgressWeek.targets(userId: "u", date: LocalDate("2026-11-22")!, in: d).count == 1, "cả tuần")
    #expect(ProgressWeek.targets(userId: "u", date: LocalDate("2026-11-23")!, in: d).isEmpty, "tuần sau thì không")
    #expect(ProgressWeek.targets(userId: "other", date: wed, in: d).isEmpty)
  }
}
