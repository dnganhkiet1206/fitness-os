@testable import ASCNDCore
import Foundation
import Testing

/// Nút của thẻ Hôm nay theo ngày (#527 Phase 2, `today-training.tsx:80–110`):
/// đầu vào của `todayCta` dựng từ lịch, template và ngày đã tập. Bảng 16 tổ hợp
/// của `todayCta` đã có ở `TodayVectorTests`; ở đây là phần dựng đầu vào.
struct TodayCtaTests {
  /// 2026-10-05 là Thứ Hai (routine 0); 2026-10-06 Thứ Ba (1); 2026-10-07 Thứ Tư (2).
  let monday = LocalDate("2026-10-05")!
  let tuesday = LocalDate("2026-10-06")!
  let wednesday = LocalDate("2026-10-07")!

  let push = WorkoutTemplate(
    id: "push", name: "Push", exercises: [TemplateExercise(exerciseName: "Bench", sets: 3, reps: 8, weightKg: 60)])

  func library(_ routine: [RoutineDay]) -> TemplateSnapshot {
    TemplateSnapshot(routine: routine, templates: [push], fetchedAt: EpochMillis(1))
  }

  /// Lịch chưa đọc xong: không đoán (`daysPending`).
  @Test func unknownScheduleShowsNothing() {
    #expect(TodayRules.cta(on: monday, library: nil, trained: []) == TodayCta.none)
    #expect(TodayRules.cta(on: monday, library: nil, trained: [monday]) == TodayCta.none)
  }

  @Test func plannedDayStarts() {
    let lib = library([RoutineDay(dayOfWeek: 0, isRest: false, templateId: "push")])
    #expect(TodayRules.cta(on: monday, library: lib, trained: []) == .start)
  }

  /// Đã tập xét trước cả kế hoạch lẫn ngày nghỉ.
  @Test func doneWinsOverPlanAndRest() {
    let planned = library([RoutineDay(dayOfWeek: 0, isRest: false, templateId: "push")])
    #expect(TodayRules.cta(on: monday, library: planned, trained: [monday]) == .extra)
    let rest = library([RoutineDay(dayOfWeek: 0, isRest: true, templateId: nil)])
    #expect(TodayRules.cta(on: monday, library: rest, trained: [monday]) == .extra)
    let empty = library([])
    #expect(TodayRules.cta(on: monday, library: empty, trained: [monday]) == .extra)
  }

  /// Ngày nghỉ mà vẫn tập: ghi tự do. Ngày nghỉ có template vẫn là nghỉ.
  @Test func restDayLogsFree() {
    #expect(TodayRules.cta(on: monday, library: library([RoutineDay(dayOfWeek: 0, isRest: true, templateId: nil)]), trained: []) == .logFree)
    #expect(TodayRules.cta(on: monday, library: library([RoutineDay(dayOfWeek: 0, isRest: true, templateId: "push")]), trained: []) == .logFree)
  }

  /// Ngày trống, hay template đã xoá (id không còn trong danh sách): chọn buổi.
  @Test func unscheduledOrMissingTemplatePicks() {
    #expect(TodayRules.cta(on: monday, library: library([]), trained: []) == .pick)
    #expect(TodayRules.cta(on: monday, library: library([RoutineDay(dayOfWeek: 0, isRest: false, templateId: "gone")]), trained: []) == .pick)
    #expect(TodayRules.cta(on: monday, library: library([RoutineDay(dayOfWeek: 0, isRest: false, templateId: nil)]), trained: []) == .pick)
  }

  /// Theo ngày, không cứng một ngày: cùng lịch, mỗi thứ một nút.
  @Test func followsTheDateNotAFixedDay() {
    let lib = library([
      RoutineDay(dayOfWeek: 0, isRest: false, templateId: "push"),
      RoutineDay(dayOfWeek: 1, isRest: true, templateId: nil),
    ])
    #expect(TodayRules.cta(on: monday, library: lib, trained: []) == .start)
    #expect(TodayRules.cta(on: tuesday, library: lib, trained: []) == .logFree)
    #expect(TodayRules.cta(on: wednesday, library: lib, trained: []) == .pick)
    // Đã tập Thứ Hai không đổi nút của Thứ Ba.
    #expect(TodayRules.cta(on: tuesday, library: lib, trained: [monday]) == .logFree)
  }

  /// Hai hàng cùng thứ: hàng sau thắng (`new Map(days.map(...))`).
  @Test func laterRowForTheSameDayWins() {
    let lib = library([
      RoutineDay(dayOfWeek: 0, isRest: true, templateId: nil),
      RoutineDay(dayOfWeek: 0, isRest: false, templateId: "push"),
    ])
    #expect(TodayRules.cta(on: monday, library: lib, trained: []) == .start)
  }
}
