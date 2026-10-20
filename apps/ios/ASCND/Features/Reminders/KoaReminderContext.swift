import ASCNDCore
import Foundation

/// Giờ quen Koa dùng cho lời nhắc (đợt 2B) — MỘT chỗ, để kế hoạch và màn Nhắc nhở
/// nói cùng một giờ.
///
/// - Bữa ăn: mép muộn của thói quen ăn (`HabitHours`) — "giờ này mọi hôm bạn đã ăn".
/// - Ghi giấc ngủ: như vậy, nhưng CHỈ khi hồ sơ chưa có giờ dậy (có giờ dậy thì
///   màn Nhắc nhở đã có gợi ý theo giờ dậy — hai cơ chế cho một lời nhắc là rối).
/// - Buổi tập: không — đã có gợi ý "Nhắc lúc…" theo giờ tập quen (`ReminderTiming`).
/// Chỉ áp cho lời nhắc còn để giờ mặc định (`ReminderPlan`); giờ người dùng tự chọn giữ nguyên.
enum KoaReminderHabit {
  static func times(_ habits: HabitHours, userId: String, profile: Profile?) -> [ReminderKey: ReminderClock] {
    var out: [ReminderKey: ReminderClock] = [:]
    if let meal = UserRhythm.lateClock(habits.habit(.meal, userId: userId)) { out[.meal] = meal }
    let known = profile.map { ReminderTiming.Known(profile: $0) } ?? ReminderTiming.Known()
    if ReminderTiming.suggested(.sleepLog, known) == nil,
      let sleep = UserRhythm.lateClock(habits.habit(.sleep, userId: userId))
    {
      out[.sleepLog] = sleep
    }
    return out
  }
}

extension ReminderContext {
  /// Phần Koa của ngữ cảnh nhắc nhở (đợt 2B): giờ quen, và chuỗi hiện tại với giờ
  /// muộn của người này cho lời nhắc chuỗi. Chưa có thói quen / chưa đọc chuỗi thì
  /// để trống — kế hoạch y như trước.
  func koa(
    habits: HabitHours, userId: String, profile: Profile?, streak: (userId: String, value: Streak.Value)?
  ) -> ReminderContext {
    var ctx = self
    ctx.habitTimes = KoaReminderHabit.times(habits, userId: userId, profile: profile)
    if let streak, streak.userId == userId {
      ctx.streak = streak.value.count
      ctx.loggedToday = streak.value.loggedToday
      ctx.streakRiskTime = ReminderTiming.toClock(KoaToday.riskHour(habits, userId: userId) * 60)
    }
    return ctx
  }
}
