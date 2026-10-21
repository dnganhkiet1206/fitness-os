@testable import ASCNDCore
import Foundation
import Testing

/// Koa sống theo lịch tập (#527 đợt 2, `koa-wave2-schedule.html`).
struct KoaScheduleTests {
  static let hourMs: Int64 = 3_600_000
  static func state(points: Int = 150, peak: Int = 150, missed: Int = 0) -> KoaGains.State {
    KoaGains.State(points: points, peak: peak, missedDays: missed, lastSession: LocalDate("2026-10-19"))
  }
  static let now = EpochMillis(1_800_000_000_000)

  static func phase(
    _ s: KoaGains.State, last: EpochMillis? = nil, trained: Bool = false, planned: Bool = true, hour: Int = 19,
    habit: Int? = nil
  ) -> KoaSchedule.Phase? {
    KoaSchedule.phase(
      gains: s, lastSessionAt: last, now: now, trainedToday: trained, plannedToday: planned, hour: hour, habitHour: habit)
  }

  @Test func pumpForTwoHoursAfterASession() {
    #expect(Self.phase(Self.state(), last: EpochMillis(Self.now.millis - Self.hourMs), trained: true) == .pump)
    #expect(Self.phase(Self.state(), last: EpochMillis(Self.now.millis - 3 * Self.hourMs), trained: true) == nil)
  }

  @Test func waitingOnlyAfterTheHabitHourOnAPlannedDay() {
    #expect(Self.phase(Self.state(), hour: 17) == nil, "trước 18h mặc định")
    #expect(Self.phase(Self.state(), hour: 18) == .waiting)
    #expect(Self.phase(Self.state(), hour: 7, habit: 7) == .waiting, "giờ quen của người này")
    #expect(Self.phase(Self.state(), planned: false, hour: 20) == nil, "không có buổi trong lịch")
  }

  /// 20/10 (chủ dự án: 23:27 Koa vẫn "đợi bạn buổi Tập Tay trước"): đêm Koa ngủ.
  @Test func nightNeverAsksForAWorkout() {
    #expect(Self.phase(Self.state(), hour: 21) == .waiting)
    #expect(Self.phase(Self.state(), hour: 22) == nil)
    #expect(Self.phase(Self.state(), hour: 23) == nil)
    #expect(Self.phase(Self.state(), hour: 2) == nil)
    #expect(Self.phase(Self.state(), hour: 5, habit: 5) == nil, "giờ quen 5h vẫn là đêm")
    #expect(Self.phase(Self.state(missed: 4), hour: 23) == nil, "không nhắc lỡ lịch lúc nửa đêm")
    #expect(Self.phase(Self.state(points: 252, peak: 270, missed: 7), hour: 0) == nil)
    // Vừa tập 21:30, 23:00 vẫn còn pump.
    #expect(Self.phase(Self.state(), last: EpochMillis(Self.now.millis - Self.hourMs), trained: true, hour: 23) == .pump)
  }

  /// Kiệt 21/10 (duyệt GĐ1): không còn "mất pump" / "tụt hạng" — nghỉ bao lâu
  /// thì ngày có buổi vẫn chỉ là "đợi ở phòng tập".
  @Test func timeOffIsNeverAPunishment() {
    #expect(Self.phase(Self.state(missed: 3)) == .waiting)
    #expect(Self.phase(Self.state(missed: 9)) == .waiting)
    #expect(Self.phase(Self.state(points: 252, peak: 270, missed: 7)) == .waiting)
    #expect(Self.phase(Self.state(missed: 9), planned: false) == nil)
  }

  @Test func comebackOncePerLayoff() {
    #expect(KoaSchedule.comebackKey(Self.state(missed: 2)) == nil)
    #expect(KoaSchedule.comebackKey(Self.state(missed: 3)) == "2026-10-19")
  }

  @Test func missedDaysAheadSkipRestDays() {
    // hôm nay thứ Hai (0), đã lỡ 1; T7 (5), CN (6) nghỉ
    #expect(KoaSchedule.missedOn(dayOffset: 0, missedToday: 1, todayWeekday: 0, rest: [5, 6]) == 1)
    #expect(KoaSchedule.missedOn(dayOffset: 2, missedToday: 1, todayWeekday: 0, rest: [5, 6]) == 3)
    #expect(KoaSchedule.missedOn(dayOffset: 6, missedToday: 1, todayWeekday: 0, rest: [5, 6]) == 5)
  }

  /// Lời nhắc buổi tập: từ ngày nghỉ thứ 3 là câu chào quay lại (không đếm lỗi,
  /// không nói mất mát); không trùng lời nhắc chuỗi.
  @Test func workoutReminderTextFollowsMissedDays() {
    var cal = Calendar(identifier: .gregorian)
    cal.timeZone = TimeZone(identifier: "UTC")!
    // thứ Hai 2026-10-19 08:00 UTC
    let now = ISO8601DateFormatter().date(from: "2026-10-19T08:00:00Z")!
    var ctx = ReminderContext()
    ctx.trainingDays = [0, 1, 2, 3, 4, 5, 6]
    ctx.missedDays = 1
    ctx.koaWorkoutCopy = ReminderCopyTable.koaWorkout(.vi)
    ctx.streak = 5
    ctx.loggedToday = false
    ctx.streakRiskTime = ReminderClock(hour: 21, minute: 0)
    let plan = ReminderPlan.plan(ReminderPrefs.defaults, ctx, now: now, calendar: cal)
    let workout = plan.filter { $0.key == .koaTraining }
    #expect(workout.count == 7, "bật sẵn, mỗi ngày có buổi một lời nhắc")
    #expect(workout[0].at == ISO8601DateFormatter().date(from: "2026-10-19T18:00:00Z")!, "chưa có giờ quen → 18:00")
    #expect(workout[0].title == nil, "ngày lỡ thứ 1: câu thường")
    #expect(workout[1].title == nil)
    #expect(workout[2].title == "Koa vẫn ở đây 💪")
    #expect(workout[5].title == "Koa vẫn ở đây 💪")
    #expect(!workout.contains { ($0.title ?? "").contains("tụt") || ($0.body ?? "").contains("xẹp") })
    #expect(!plan.contains { $0.key == .streak }, "đã có lời nhắc buổi tập hôm nay → không nhắc chuỗi")
    // Gains chưa đọc → không có lời nhắc của Koa (kế hoạch như trước)
    var unread = ctx
    unread.missedDays = nil
    #expect(!ReminderPlan.plan(ReminderPrefs.defaults, unread, now: now, calendar: cal).contains { $0.key == .koaTraining })
    // ngày nghỉ không có buổi → không nhắc
    var rest = ctx
    rest.trainingDays = [1, 2, 3, 4, 5, 6]
    #expect(ReminderPlan.plan(ReminderPrefs.defaults, rest, now: now, calendar: cal).filter { $0.key == .koaTraining }.count == 6)
    // Đổi lịch theo ngày (GĐ1) thắng lịch mẫu: hôm nay đổi thành nghỉ, mai nhận buổi dời tới.
    var moved = ctx
    moved.plannedByOffset = [0: false]
    let m = ReminderPlan.plan(ReminderPrefs.defaults, moved, now: now, calendar: cal).filter { $0.key == .koaTraining }
    #expect(m.count == 6 && m[0].at > now.addingTimeInterval(20 * 3600), "hôm nay đổi thành nghỉ → không nhắc hôm nay")
  }
}
