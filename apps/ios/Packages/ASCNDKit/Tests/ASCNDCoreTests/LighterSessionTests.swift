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

  // MARK: - Tuần nhẹ sau kỳ nghỉ dài giảm tạ thật (KOA-T04, Kiệt 21/11)

  /// Tạ giảm đúng hệ số, làm tròn XUỐNG theo bước tạ — không bao giờ nặng hơn lời hứa trên thẻ.
  @Test func lighterWeightRoundsDownToAPlateStep() {
    #expect(LighterSession.lighterWeight(60, factor: 0.9) == 52.5, "54 → 52,5")
    #expect(LighterSession.lighterWeight(60, factor: 0.8) == 47.5, "48 → 47,5")
    #expect(LighterSession.lighterWeight(100, factor: 0.9) == 90)
    #expect(LighterSession.lighterWeight(8, factor: 0.9) == 7, "tạ đơn: bước 1 (7,2 → 7)")
    #expect(LighterSession.lighterWeight(4, factor: 0.9) == 3.5, "tạ rất nhẹ: bước 0,5 (3,6 → 3,5)")
    #expect(LighterSession.lighterWeight(0, factor: 0.8) == 0, "bài tạ người")
    #expect(LighterSession.lighterWeight(60, factor: 1) == 60, "bản nhẹ thường: giữ tạ")
    for kg in stride(from: 0.5, through: 200, by: 0.5) {
      for f in [0.8, 0.9] { #expect(LighterSession.lighterWeight(kg, factor: f) <= kg * f + 1e-9, "\(kg) × \(f)") }
    }
  }

  /// Nghỉ 30 ngày → nhận tuần nhẹ → buổi đầu tạ 90 % (tiêu chí nghiệm thu của audit), bớt một hiệp.
  @Test func lightWeekAfterThirtyDaysOffLowersTheLoads() {
    let f = KoaWeekCoach.loadFactor(daysOff: 30)
    #expect(f == 0.9)
    let ex = LighterSession.exercises(Self.template.exercises, loadFactor: f)
    #expect(ex.map(\.weightKg) == [52.5, 9], "60 → 52,5; 10 → 9")
    #expect(ex.map(\.sets) == [2, 1])
    let plain = Self.plan.sessionPlan(variant: .lighter)!.rows
    let light = Self.plan.sessionPlan(variant: .lighter, loadFactor: f)!.rows
    #expect(plain.count == light.count, "cùng số hiệp với bản nhẹ thường")
    #expect(light != plain, "tạ trong buổi đã giảm")
    #expect(Self.plan.sessionPlan(variant: .full, loadFactor: f)!.rows == Self.plan.sessionPlan(variant: .full)!.rows, "buổi đầy đủ không giảm")
  }

  @Test func loadFactorIsStoredPerUserDayAndTemplate() throws {
    let d = try #require(UserDefaults(suiteName: "load-\(UUID())"))
    #expect(LighterSession.loadFactor(userId: "u", date: Self.day, templateId: "t", in: d) == 1)
    LighterSession.setLoadFactor(0.8, userId: "u", date: Self.day, templateId: "t", in: d)
    #expect(LighterSession.loadFactor(userId: "u", date: Self.day, templateId: "t", in: d) == 0.8)
    #expect(LighterSession.loadFactor(userId: "u", date: Self.day.adding(days: 1), templateId: "t", in: d) == 1)
    #expect(LighterSession.loadFactor(userId: "x", date: Self.day, templateId: "t", in: d) == 1)
    LighterSession.setLoadFactor(1, userId: "u", date: Self.day, templateId: "t", in: d)
    #expect(LighterSession.loadFactor(userId: "u", date: Self.day, templateId: "t", in: d) == 1)
  }
}
