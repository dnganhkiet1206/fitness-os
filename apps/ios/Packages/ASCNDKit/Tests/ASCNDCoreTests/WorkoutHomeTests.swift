@testable import ASCNDCore
import Testing

/// Trang gốc tab Tập luyện (thiết kế lại 14/10): dải tuần + thẻ hôm nay.
struct WorkoutHomeTests {
  /// 2026-10-14 là Thứ Tư.
  let today = LocalDate("2026-10-14")!

  var snapshot: TemplateSnapshot {
    let push = WorkoutTemplate(id: "tpl", name: "Push", exercises: [TemplateExercise(exerciseName: "Bench", sets: 3, reps: 5, weightKg: 60)])
    return TemplateSnapshot(
      routine: [
        RoutineDay(dayOfWeek: 0, isRest: false, templateId: "tpl"),
        RoutineDay(dayOfWeek: 2, isRest: false, templateId: "tpl"),
        RoutineDay(dayOfWeek: 5, isRest: true, templateId: nil),
      ], templates: [push], fetchedAt: EpochMillis(1))
  }

  @Test func weekRunsMondayToSundayWithPlanStatuses() {
    let w = WorkoutHome.week(today: today, library: snapshot, trained: [LocalDate("2026-10-12")!])
    #expect(w.map(\.date.description).first == "2026-10-12")
    #expect(w.map(\.date.description).last == "2026-10-18")
    #expect(w[0].status == .done)
    #expect(w[2].status == .todo && w[2].isToday)
    #expect(w[5].status == .rest)
    #expect(w[3].status == .unplanned)
  }

  @Test func weekWithoutLibraryOnlyKnowsTrainedDays() {
    let w = WorkoutHome.week(today: today, library: nil, trained: [LocalDate("2026-10-13")!])
    #expect(w[1].status == .done)
    #expect(w.filter { $0.status == .unplanned }.count == 6)
  }

  @Test func heroFollowsCtaUnlessASessionIsOpen() {
    #expect(WorkoutHome.hero(cta: .start, phase: .idle, progress: (0, 9)) == .start)
    #expect(WorkoutHome.hero(cta: .start, phase: .active, progress: (2, 9)) == .inProgress(done: 2, total: 9))
    #expect(WorkoutHome.hero(cta: .start, phase: .finished(sessionId: "s"), progress: (9, 9)) == .done)
    #expect(WorkoutHome.hero(cta: .extra, phase: nil, progress: (0, 0)) == .done)
    #expect(WorkoutHome.hero(cta: .logFree, phase: nil, progress: (0, 0)) == .rest)
    #expect(WorkoutHome.hero(cta: .pick, phase: nil, progress: (0, 0)) == .pick)
    #expect(WorkoutHome.hero(cta: .none, phase: .loading, progress: (0, 0)) == .loading)
  }

  @Test func progressAndLinesSkipWarmups() {
    let rows = [
      PlannedSet(key: "w", exerciseName: "Bench", ordinal: 1, of: 1, weightKg: 20, reps: 10, plannedRest: 60, warmup: true),
      PlannedSet(key: "a", exerciseName: "Bench", ordinal: 1, of: 2, weightKg: 60, reps: 5, plannedRest: 90),
      PlannedSet(key: "b", exerciseName: "Bench", ordinal: 2, of: 2, weightKg: 60, reps: 5, plannedRest: 90),
      PlannedSet(key: "c", exerciseName: "Row", ordinal: 1, of: 1, weightKg: 40, reps: 8, plannedRest: 90),
    ]
    let p = WorkoutHome.setProgress(rows, done: ["w": true, "a": true])
    #expect(p.done == 1 && p.total == 3)
    #expect(WorkoutHome.lines(rows) == [.init(name: "Bench", sets: 2, reps: 5, rest: 90), .init(name: "Row", sets: 1, reps: 8, rest: 90)])
  }
}
