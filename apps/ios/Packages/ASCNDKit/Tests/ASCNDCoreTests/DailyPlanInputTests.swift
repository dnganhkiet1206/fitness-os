@testable import ASCNDCore
import Testing

/// Dựng đầu vào Daily Plan từ kế hoạch thật (#527 GĐ1).
struct DailyPlanInputTests {
  static let wed = LocalDate("2026-10-21")!
  static let chest = WorkoutTemplate(id: "t-chest", name: "Chest day", exercises: [
    TemplateExercise(exerciseName: "Bench Press", sets: 3, reps: 8, weightKg: 60)
  ])
  static func library(_ routine: [RoutineDay], supported: Bool = true) -> TemplateSnapshot {
    TemplateSnapshot(routine: routine, templates: [chest], overridesSupported: supported, fetchedAt: EpochMillis(1))
  }
  static let wedChest = [RoutineDay(dayOfWeek: 2, isRest: false, templateId: "t-chest"), RoutineDay(dayOfWeek: 3, isRest: true, templateId: nil)]

  @Test func notLoadedYet() {
    let i = DailyPlan.input(date: Self.wed, library: nil, active: nil, doneToday: [], daysOff: nil, recovery: nil, proteinLeftG: nil)
    #expect(!i.loaded && DailyPlan.decide(i).action == .loading)
  }

  @Test func plannedDayWithRescheduleOnlyWhenTheServerHasTheTable() {
    let on = DailyPlan.input(
      date: Self.wed, library: Self.library(Self.wedChest), active: nil, doneToday: [], daysOff: 0, recovery: nil,
      proteinLeftG: nil)
    #expect(on.today == .planned([DailyPlan.session(Self.chest)]) && on.hasSchedule)
    #expect(on.canReschedule && on.postponeTo == Self.wed.adding(days: 2), "T5 nghỉ đặt → T6 trống")
    let off = DailyPlan.input(
      date: Self.wed, library: Self.library(Self.wedChest, supported: false), active: nil, doneToday: [], daysOff: 0,
      recovery: nil, proteinLeftG: nil)
    #expect(!off.canReschedule && off.postponeTo == nil)
    #expect(DailyPlan.decide(off).alternatives.isEmpty, "migration chưa deploy → không có nút dời / nghỉ")
  }

  @Test func restAndEmptyDaysFindTheNextSession() {
    let thu = Self.wed.adding(days: 1)
    let rest = DailyPlan.input(
      date: thu, library: Self.library(Self.wedChest), active: nil, doneToday: [], daysOff: nil, recovery: nil,
      proteinLeftG: nil)
    #expect(rest.today == .rest && rest.next?.date == Self.wed.adding(days: 7))
    let none = DailyPlan.input(
      date: Self.wed, library: Self.library([]), active: nil, doneToday: [], daysOff: nil, recovery: nil, proteinLeftG: nil)
    #expect(!none.hasSchedule && DailyPlan.decide(none).action == .setUpWeek)
  }

  @Test func activeSessionIsResumed() {
    let i = DailyPlan.input(
      date: Self.wed, library: Self.library(Self.wedChest), active: Self.chest, doneToday: [], daysOff: 0,
      recovery: nil, proteinLeftG: nil)
    #expect(DailyPlan.decide(i).action == .resume(DailyPlan.session(Self.chest)))
  }
}
