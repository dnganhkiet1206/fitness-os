import ASCNDCore
import Foundation
import Testing

/// `ReminderContext.today` — các vị từ của `useReminders` (`hooks/use-reminders.ts`)
/// mà `useReminderSync` (gắn ở Today của RN) đưa vào `planReminders`.
struct ReminderContextTodayTests {
  static let today = LocalDate("2026-10-08")!

  private func ctx(
    trained: Set<LocalDate> = [], routine: [RoutineDay]? = nil, water: Int? = nil, target: Double? = nil,
    supplements: [Supplement]? = nil
  ) -> ReminderContext {
    .today(Self.today, trained: trained, routine: routine, waterTotalMl: water, waterTargetMl: target, supplements: supplements)
  }

  private func supp(_ id: String, taken: Bool) -> Supplement {
    Supplement(id: id, name: id, doseText: nil, timing: "morning", category: "other", taken: taken)
  }

  /// Chưa đọc gì: đúng giá trị của RN khi mọi truy vấn còn `undefined`.
  @Test func nothingKnownIsTheRNDefaults() {
    let c = ctx()
    #expect(!c.workedOutToday && !c.weighedToday && !c.mealLoggedToday && !c.bioLoggedToday && !c.sleepLoggedToday)
    #expect(c.trainingDays == nil)  // lịch CHƯA ĐỌC — không phải tuần toàn ngày nghỉ
    #expect(c.supplementsDone)  // `[].every(...)` là true
    #expect(!c.waterDone)  // `(undefined ?? 0) >= 2500` là false
    #expect(c.pendingClaims.isEmpty)
  }

  /// `sessions.some(s => localDateStr(s.date_time) === localDateStr())` — chỉ hôm nay.
  @Test func workedOutTodayIsOnlyToday() {
    #expect(ctx(trained: [Self.today]).workedOutToday)
    #expect(!ctx(trained: [Self.today.adding(days: -1)]).workedOutToday)
  }

  /// `routineDays.filter(d => d.template_id && !d.is_rest).map(d => d.day_of_week)`.
  @Test func trainingDaysNeedATemplateAndNotRest() {
    let routine = [
      RoutineDay(dayOfWeek: 0, isRest: false, templateId: "t1"),
      RoutineDay(dayOfWeek: 1, isRest: true, templateId: "t1"),
      RoutineDay(dayOfWeek: 2, isRest: false, templateId: nil),
      RoutineDay(dayOfWeek: 3, isRest: false, templateId: ""),
      RoutineDay(dayOfWeek: 4, isRest: false, isDeload: true, templateId: "t2"),
    ]
    #expect(ctx(routine: routine).trainingDays == [0, 4])
    #expect(ctx(routine: []).trainingDays == [])
  }

  /// `(waterMl ?? 0) >= (Number(profile?.water_target_ml) || 2500)`.
  @Test func waterDoneAgainstTargetOr2500() {
    #expect(!ctx(water: 2499).waterDone)
    #expect(ctx(water: 2500).waterDone)
    #expect(ctx(water: 1800, target: 1800).waterDone)
    #expect(!ctx(water: 1800, target: 2000).waterDone)
    #expect(ctx(water: 2500, target: 0).waterDone)  // 0 → 2500
  }

  /// `(supplements ?? []).every(s => s.taken)`.
  @Test func supplementsDoneWhenEveryTaken() {
    #expect(ctx(supplements: []).supplementsDone)
    #expect(ctx(supplements: [supp("a", taken: true), supp("b", taken: true)]).supplementsDone)
    #expect(!ctx(supplements: [supp("a", taken: true), supp("b", taken: false)]).supplementsDone)
  }
}
