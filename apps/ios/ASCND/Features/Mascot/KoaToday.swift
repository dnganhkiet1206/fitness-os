import ASCNDCore
import Foundation

/// Koa ở Hôm nay và trong phòng đọc CÙNG một ngày (Koa đợt 1, 19/10): nét mặt từ
/// `KoaMood`, câu nói đọc số thật của người dùng. Một chỗ để Koa ở hai màn không
/// bao giờ nói khác nhau về cùng một ngày.
enum KoaToday {
  /// Giờ muộn của người này: giờ ăn quen (`HabitHours`), sàn 18 giờ — như
  /// `lateHour(habitFor('meal'), RISK_HOUR)` của RN.
  static func riskHour(_ habits: HabitHours, userId: String) -> Double {
    UserRhythm.lateHour(habits.habit(.meal, userId: userId), floor: KoaMood.riskHour)
  }

  static func isBirthday(_ dob: LocalDate?, today: LocalDate) -> Bool {
    guard let dob else { return false }
    return dob.month == today.month && dob.day == today.day
  }

  /// Nét mặt của Koa lúc này.
  @MainActor
  static func read(
    room: MascotRoomController, localWaterMl: Int?, pending: TodayDay.Pending? = nil, profile: Profile?, riskHour: Double,
    hour: Int, minute: Int = 0
  ) -> KoaMood.Read {
    KoaMood.read(
      .init(
        signals: TodayDay.merging(room.signals, localWaterMl: localWaterMl, pending: pending), stepsGoal: room.stepsGoal, hour: hour,
        streak: room.streak.count, loggedToday: room.streak.loggedToday, riskHour: riskHour,
        kcalTarget: profile.map { NutritionToday.calorieTarget($0) },
        isBirthday: isBirthday(profile?.dob, today: room.today), minute: minute,
        sleep: KoaMood.SleepWindow(profile: profile)))
  }

  /// Câu riêng của Koa cho nét mặt này, có số thật; `nil` → câu "việc kế tiếp"
  /// của `MascotLine` (đã ăn, đã tập, ngày còn trống… Koa hỏi việc tới giờ).
  static func line(_ read: KoaMood.Read, signals: DailySignals?, profile: Profile?, streak: Int) -> String? {
    switch read.reason {
    case .night: return String(localized: "koa.say.night")
    case .birthday: return String(localized: "koa.say.birthday")
    case .worry: return String(localized: "koa.say.worry \(streak)")
    case .allDone: return String(localized: "koa.say.allDone")
    case .rested, .shortSleep:
      guard let slept = KoaLineNumbers.slept(signals) else { return nil }
      return read.reason == .rested
        ? String(localized: "koa.say.rested \(slept)") : String(localized: "koa.say.shortSleep \(slept)")
    case .overate:
      guard let pct = KoaLineNumbers.overatePercent(signals, profile) else { return nil }
      return String(localized: "koa.say.overate \(pct)")
    case .unread, .trained, .fed, .emptyLate, .calm:
      return nil
    }
  }
}

/// Con số trong câu của Koa — MỘT chỗ dựng cho Koa ở Hôm nay (`KoaToday.line`) và Koa nói trong phòng
/// (`KoaTalkLine`) (KOA-T40: trước hai bản chép tay; bản Hôm nay còn nói "ngủ 0 giờ 0 phút" khi chưa có giấc ngủ).
enum KoaLineNumbers {
  /// "7 giờ 30 phút" từ giấc ngủ đêm qua; `nil` khi chưa có.
  static func slept(_ signals: DailySignals?) -> String? {
    guard let minutes = signals?.sleepMinutes, minutes > 0 else { return nil }
    let m = Int(minutes.rounded())
    return String(localized: "today.d.sleep \(m / 60) \(m % 60)")
  }

  /// Phần trăm calo đã ăn so với mục tiêu; `nil` khi chưa có calo hay hồ sơ.
  static func overatePercent(_ signals: DailySignals?, _ profile: Profile?) -> Int? {
    guard let kcal = signals?.kcal, let profile else { return nil }
    return KoaMood.kcalPercent(kcal: kcal, target: NutritionToday.calorieTarget(profile))
  }
}
