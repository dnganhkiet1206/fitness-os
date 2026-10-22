@testable import ASCNDCore
import Foundation
import Testing

/// "Tập nhẹ hơn" (#527 GĐ1): một hiệp ít hơn mỗi bài, chỉ buổi hôm nay, mẫu gốc
/// và tạ giữ nguyên.
struct LighterSessionTests {
  static let template = WorkoutTemplate(id: "t", name: "Chest day", exercises: [
    TemplateExercise(exerciseName: "Bench Press", sets: 3, reps: 8, weightKg: 60, warmupSets: 2),
    TemplateExercise(exerciseName: "Fly", sets: 1, reps: 12, weightKg: 10),
  ])
  static let day = LocalDate("2026-10-21")!
  static let plan = TodayPlan(date: day, status: .todo, template: template, isDeload: false)

  @Test func oneSetFewerPerExerciseNeverBelowOne() {
    let ex = LighterSession.exercises(Self.template.exercises)
    #expect(ex.map(\.sets) == [2, 1])
    #expect(ex.map(\.weightKg) == [60, 10] && ex.map(\.reps) == [8, 12] && ex[0].warmupSets == 2, "không đổi tạ / reps / khởi động")
    #expect(Self.template.exercises.map(\.sets) == [3, 1], "mẫu gốc nguyên vẹn")
  }

  @Test func lighterPlanDropsOnlyTheLastWorkingSet() {
    let full = Self.plan.sessionPlan(lighter: false)!.rows
    let light = Self.plan.sessionPlan(lighter: true)!.rows
    #expect(full.count - light.count == 1)
    // khoá theo vị trí giữ nguyên → tiến độ đã ghi không lệch
    #expect(light.map(\.key) == full.map(\.key).filter { $0 != "0-2" })
  }

  @Test func choiceIsPerUserDayAndTemplate() throws {
    let defaults = try #require(UserDefaults(suiteName: "lighter-\(UUID())"))
    LighterSession.set(true, userId: "u", date: Self.day, templateId: "t", in: defaults)
    #expect(LighterSession.isOn(userId: "u", date: Self.day, templateId: "t", in: defaults))
    #expect(!LighterSession.isOn(userId: "u", date: Self.day.adding(days: 1), templateId: "t", in: defaults))
    #expect(!LighterSession.isOn(userId: "other", date: Self.day, templateId: "t", in: defaults))
    LighterSession.set(false, userId: "u", date: Self.day, templateId: "t", in: defaults)
    #expect(!LighterSession.isOn(userId: "u", date: Self.day, templateId: "t", in: defaults))
  }

  /// Buổi ngắn: nửa số bài đầu (làm tròn lên), ít nhất hai; hiệp / tạ giữ nguyên.
  @Test func shortSessionKeepsTheFirstHalfOfTheExercises() {
    func names(_ n: Int) -> [TemplateExercise] { (0..<n).map { TemplateExercise(exerciseName: "E\($0)", sets: 3, reps: 8, weightKg: 20) } }
    #expect(ShortSession.exercises(names(1)).count == 1)
    #expect(ShortSession.exercises(names(2)).count == 2)
    #expect(ShortSession.exercises(names(3)).count == 2)
    #expect(ShortSession.exercises(names(5)).map(\.exerciseName) == ["E0", "E1", "E2"])
    #expect(ShortSession.exercises(names(6)).count == 3)
    #expect(ShortSession.exercises(names(5)).allSatisfy { $0.sets == 3 }, "không bớt hiệp")
  }

  @Test func variantsAreExclusive() throws {
    let defaults = try #require(UserDefaults(suiteName: "variant-\(UUID())"))
    ShortSession.set(true, userId: "u", date: Self.day, templateId: "t", in: defaults)
    #expect(ShortSession.isOn(userId: "u", date: Self.day, templateId: "t", in: defaults))
    #expect(!LighterSession.isOn(userId: "u", date: Self.day, templateId: "t", in: defaults))
    let short = Self.plan.sessionPlan(variant: .short)!.rows
    #expect(short == Self.plan.sessionPlan(variant: .full)!.rows, "hai bài → buổi ngắn giữ cả hai")
  }
}
