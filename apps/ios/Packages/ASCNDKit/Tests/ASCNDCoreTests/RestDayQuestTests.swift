import Testing

@testable import ASCNDCore

@Suite struct RestDayQuestTests {
  private func d(_ t: String) -> LocalDate { LocalDate(t)! }

  private func active(_ day: QuestDay) -> [MascotRules.Quest] {
    MascotRules.dailyQuests.map(\.key).filter { MascotRules.counts($0, day: day, stepsEverRecorded: true) }
  }

  /// Lỗi 03/11: đổi hôm nay thành ngày nghỉ thì có thêm "hồi phục" nhưng "tập luyện" vẫn còn (5 → 6).
  @Test func recoveryReplacesTheWorkoutOnARestDay() {
    #expect(active(.training).contains(.workout) && !active(.training).contains(.recovery))
    #expect(active(.rest).contains(.recovery) && !active(.rest).contains(.workout))
    #expect(active(.rest).count == active(.training).count, "đổi một lấy một")
  }

  /// Kiệt 03/11: tập tự do, chưa lên lịch, thì không có ngày nghỉ: giữ nhiệm vụ tập mỗi ngày.
  @Test func unscheduledKeepsTheWorkoutQuest() {
    #expect(active(.unscheduled).contains(.workout) && !active(.unscheduled).contains(.recovery))
  }

  @Test func aSecondSwapHasNeitherWorkoutNorRecovery() {
    #expect(!active(.extraSwap).contains(.workout) && !active(.extraSwap).contains(.recovery))
    #expect(active(.extraSwap).contains(.meal))
  }

  private func library(overrides: [DayOverride]) -> TemplateSnapshot {
    let t = WorkoutTemplate(id: "t", name: "Full Body", exercises: [])
    let routine = (0..<7).map { RoutineDay(dayOfWeek: $0, isRest: ![0, 2, 4].contains($0), isDeload: false, templateId: [0, 2, 4].contains($0) ? "t" : nil) }
    return TemplateSnapshot(routine: routine, templates: [t], overrides: overrides, overridesSupported: true, fetchedAt: EpochMillis(0))
  }

  @Test func firstSwapIsARestDaySecondIsNot() {
    let mon = d("2026-11-02"), wed = d("2026-11-04")
    let lib = library(overrides: [
      DayOverride(date: mon, templateId: nil, isRest: true), DayOverride(date: wed, templateId: nil, isRest: true),
    ])
    #expect(QuestDay.of(library: lib, date: mon, trainedToday: false) == .rest)
    #expect(QuestDay.of(library: lib, date: wed, trainedToday: false) == .extraSwap)
    #expect(QuestDay.of(library: lib, date: wed, trainedToday: true) == .training, "vẫn tập thì tính là đã tập")
    #expect(QuestDay.of(library: lib, date: d("2026-11-05"), trainedToday: false) == .rest, "ngày nghỉ theo lịch")
    #expect(QuestDay.of(library: lib, date: d("2026-11-06"), trainedToday: false) == .training)
  }

  @Test func movingASessionIsNotASwap() {
    let mon = d("2026-11-02")
    let lib = library(overrides: [
      DayOverride(date: d("2026-10-30"), templateId: nil, isRest: true),
      DayOverride(date: mon, templateId: nil, isRest: true, movedTo: d("2026-11-03")),
      DayOverride(date: d("2026-11-04"), templateId: nil, isRest: true),
    ])
    #expect(QuestDay.swaps(in: lib, weekOf: mon) == [d("2026-11-04")], "dời không tính; tuần trước không tính")
    #expect(QuestDay.of(library: lib, date: d("2026-11-04"), trainedToday: false) == .rest)
  }

  @Test func noScheduleIsUnscheduled() {
    #expect(QuestDay.of(library: nil, date: d("2026-11-02"), trainedToday: false) == .unscheduled)
    let empty = TemplateSnapshot(routine: [], templates: [], overrides: [], overridesSupported: true, fetchedAt: EpochMillis(0))
    #expect(QuestDay.of(library: empty, date: d("2026-11-02"), trainedToday: false) == .unscheduled)
  }
}
