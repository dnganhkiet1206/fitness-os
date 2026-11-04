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

  /// Tạm nghỉ (#796): việc chính nói rõ là đang tạm nghỉ và ngày tập lại, không gợi buổi trong lịch.
  @Test func pauseSaysPausedAndWhenYouAreBack() {
    let pause = KoaPause(from: Self.wed, days: 3)
    let i = DailyPlan.input(
      date: Self.wed, library: Self.library(Self.wedChest), active: nil, doneToday: [], daysOff: 9, recovery: nil,
      proteinLeftG: nil, pause: pause)
    #expect(i.today == .rest && i.daysOff == 0 && i.pausedUntil == Self.wed.adding(days: 3))
    let r = DailyPlan.decide(i)
    #expect(r.action == .recovery && r.reason == .paused(until: Self.wed.adding(days: 3)) && r.alternatives == [.logFree])
  }

  @Test func aPauseThatHasNotStartedOrIsOverDoesNothing() {
    let later = KoaPause(from: Self.wed.adding(days: 1), days: 2)
    let i = DailyPlan.input(
      date: Self.wed, library: Self.library(Self.wedChest), active: nil, doneToday: [], daysOff: 0, recovery: nil,
      proteinLeftG: nil, pause: later)
    #expect(i.pausedUntil == nil && i.today == .planned([DailyPlan.session(Self.chest)]))
    let over = KoaPause(from: Self.wed.adding(days: -3), days: 2)
    let j = DailyPlan.input(
      date: Self.wed, library: Self.library(Self.wedChest), active: nil, doneToday: [], daysOff: 0, recovery: nil,
      proteinLeftG: nil, pause: over)
    #expect(j.pausedUntil == nil)
  }

  @Test func activeSessionIsResumed() {
    let i = DailyPlan.input(
      date: Self.wed, library: Self.library(Self.wedChest), active: Self.chest, doneToday: [], daysOff: 0,
      recovery: nil, proteinLeftG: nil)
    #expect(DailyPlan.decide(i).action == .resume(DailyPlan.session(Self.chest)))
  }

  /// Lời nhắc đọc CÙNG lịch đã áp (đổi thành nghỉ → không nhắc hôm ấy).
  @Test func remindersReadTheAppliedPlan() {
    let lib = TemplateSnapshot(
      routine: Self.wedChest, templates: [Self.chest],
      overrides: [DayOverride(date: Self.wed, templateId: nil, isRest: true)], overridesSupported: true,
      fetchedAt: EpochMillis(1))
    let ctx = ReminderContext.today(
      Self.wed, trained: [], routine: lib.routine, waterTotalMl: nil, waterTargetMl: nil, supplements: nil, library: lib)
    #expect(ctx.trainingDays == [2], "lịch mẫu vẫn có thứ Tư")
    #expect(ctx.plannedByOffset?[0] == false, "thứ Tư này đổi thành nghỉ")
    #expect(ctx.plannedByOffset?[6] == false && ctx.plannedByOffset?.count == 7)
  }

  /// Widget nói câu của Daily Plan khi có, câu mặc định khi không.
  @Test func widgetUsesTheDailyPlanStatus() {
    let copy = HomeWidgets.Copy(done: "done", restDay: "rest", noWorkout: "none", untitled: "w", notStarted: "not started")
    let plan = TodayPlan(date: Self.wed, status: .todo, template: Self.chest, isDeload: false)
    #expect(HomeWidgets.todayWorkout(sessions: [], copy: copy, plan: plan).statusText == "not started")
    #expect(HomeWidgets.todayWorkout(sessions: [], copy: copy, plan: plan, planStatus: "Welcome back").statusText == "Welcome back")
  }
}
