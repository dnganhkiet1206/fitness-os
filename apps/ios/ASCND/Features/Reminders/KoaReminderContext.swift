import ASCNDCore
import Foundation

extension ReminderContext {
  /// Phần Koa của ngữ cảnh nhắc nhở (đợt 2B): giờ quen của bữa / ghi giấc ngủ /
  /// buổi tập (mép muộn của thói quen đã học ở `HabitHours`), và chuỗi hiện tại
  /// với giờ muộn của người này cho lời nhắc chuỗi. Chưa có thói quen / chưa đọc
  /// chuỗi thì để trống — kế hoạch y như trước.
  func koa(habits: HabitHours, userId: String, streak: (userId: String, value: Streak.Value)?) -> ReminderContext {
    var ctx = self
    let pairs: [(ReminderKey, MascotRules.Quest)] = [(.meal, .meal), (.sleepLog, .sleep), (.workout, .workout)]
    for (key, quest) in pairs {
      if let clock = UserRhythm.lateClock(habits.habit(quest, userId: userId)) { ctx.habitTimes[key] = clock }
    }
    if let streak, streak.userId == userId {
      ctx.streak = streak.value.count
      ctx.loggedToday = streak.value.loggedToday
      ctx.streakRiskTime = ReminderTiming.toClock(KoaToday.riskHour(habits, userId: userId) * 60)
    }
    return ctx
  }
}
