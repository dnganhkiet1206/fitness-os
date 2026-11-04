@testable import ASCNDCore
import Foundation
import Testing

/// Nhắc bữa nhiều lần trong ngày (Kiệt 01/11).
struct MealTimesTests {
  static let hcm = KoaReminderTests.hcm
  static let morning = KoaReminderTests.morning

  static func prefs(_ extra: [ReminderClock]) -> ReminderPrefs {
    var p = ReminderPrefs.defaults
    p.meal.enabled = true
    p.meal.hour = 7
    p.meal.minute = 30
    p.streak = false
    p.koaTraining = false
    p.mealExtra = extra
    return p
  }

  /// Mỗi giờ thêm bắn mỗi ngày; đã ghi bữa hôm nay chỉ câm giờ chính.
  @Test func everyMealTimeFiresAndLoggingOneMealKeepsTheOthers() {
    let p = Self.prefs([ReminderClock(hour: 12, minute: 0), ReminderClock(hour: 19, minute: 0)])
    var ctx = ReminderContext()
    ctx.mealLoggedToday = true
    let today = ReminderPlan.plan(p, ctx, now: Self.morning, calendar: Self.hcm)
      .filter { $0.key == .meal && Self.hcm.isDate($0.at, inSameDayAs: Self.morning) }
      .map { KoaReminderTests.hm($0.at) }
    #expect(today == ["12:00", "19:00"])
    let tomorrow = ReminderPlan.plan(p, ReminderContext(), now: Self.morning, calendar: Self.hcm)
      .filter { $0.key == .meal && !Self.hcm.isDate($0.at, inSameDayAs: Self.morning) }
      .prefix(3).map { KoaReminderTests.hm($0.at) }
    #expect(tomorrow == ["07:30", "12:00", "19:00"])
  }

  /// Tắt nhắc bữa thì tắt mọi giờ.
  @Test func offMeansNoMealTimes() {
    var p = Self.prefs([ReminderClock(hour: 12, minute: 0)])
    p.meal.enabled = false
    #expect(ReminderPlan.plan(p, ReminderContext(), now: Self.morning, calendar: Self.hcm).allSatisfy { $0.key != .meal })
  }

  /// Lưu rồi đọc lại; giờ hỏng bị bỏ; tối đa `maxMealTimes` giờ. RN không có khoá thì rỗng.
  @Test func roundTripsAndClamps() {
    let p = Self.prefs([ReminderClock(hour: 12, minute: 0), ReminderClock(hour: 19, minute: 15)])
    #expect(ReminderPrefs.decode(p.encoded()).mealExtra == p.mealExtra)
    let raw = #"{"meal":{"enabled":true,"hour":7,"minute":30},"mealExtra":[{"hour":25,"minute":0},{"hour":12,"minute":0},{"hour":13,"minute":0},{"hour":14,"minute":0},{"hour":15,"minute":0},{"hour":16,"minute":0}]}"#
    #expect(ReminderPrefs.decode(raw).mealExtra.count == ReminderPrefs.maxMealTimes - 1)
    #expect(ReminderPrefs.decode(raw).mealExtra.first == ReminderClock(hour: 12, minute: 0))
    #expect(ReminderPrefs.decode(#"{"meal":{"enabled":true,"hour":20,"minute":0}}"#).mealExtra.isEmpty)
  }

  /// Giờ gợi ý cho bữa mới: bữa thường gặp còn trống, sau giờ muộn nhất.
  @Test func nextSlotSuggestsAUsualMeal() {
    #expect(ReminderPrefs.nextMealSlot(after: [ReminderClock(hour: 7, minute: 30)]) == ReminderClock(hour: 12, minute: 0))
    #expect(ReminderPrefs.nextMealSlot(after: [ReminderClock(hour: 20, minute: 0)]) == ReminderClock(hour: 7, minute: 30))
    let all = [(7, 30), (12, 0), (15, 30), (19, 0)].map { ReminderClock(hour: $0.0, minute: $0.1) }
    #expect(ReminderPrefs.nextMealSlot(after: all) == ReminderClock(hour: 21, minute: 0))
  }
}
