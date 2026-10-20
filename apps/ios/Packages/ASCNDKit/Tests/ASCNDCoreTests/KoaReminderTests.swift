@testable import ASCNDCore
import Foundation
import Testing

/// Koa đợt 2B (19/10): nhắc nhở bằng giọng Koa, đúng giờ quen, nhắc chuỗi.
struct KoaReminderTests {
  static let hcm: Calendar = {
    var c = Calendar(identifier: .gregorian)
    c.timeZone = TimeZone(identifier: "Asia/Ho_Chi_Minh")!
    return c
  }()
  /// Thứ Hai 19/10/2026 06:00 giờ HCM.
  static let morning = ISO8601DateFormatter().date(from: "2026-10-18T23:00:00Z")!

  static func hm(_ d: Date) -> String {
    let c = hcm.dateComponents([.hour, .minute], from: d)
    return String(format: "%02d:%02d", c.hour!, c.minute!)
  }

  static var mealOn: ReminderPrefs {
    var p = ReminderPrefs.defaults
    p.meal.enabled = true
    p.streak = false
    return p
  }

  @Test func habitHourReplacesTheUntouchedDefault() {
    var ctx = ReminderContext()
    ctx.habitTimes = [.meal: ReminderClock(hour: 13, minute: 30)]
    let plan = ReminderPlan.plan(Self.mealOn, ctx, now: Self.morning, calendar: Self.hcm)
    let meals = plan.filter { $0.key == .meal }
    #expect(meals.count == 7)
    #expect(meals.allSatisfy { Self.hm($0.at) == "13:30" && $0.habit })
  }

  @Test func aTimeTheUserChoseIsKept() {
    var p = Self.mealOn
    p.meal.hour = 19
    var ctx = ReminderContext()
    ctx.habitTimes = [.meal: ReminderClock(hour: 13, minute: 30)]
    let meals = ReminderPlan.plan(p, ctx, now: Self.morning, calendar: Self.hcm).filter { $0.key == .meal }
    #expect(meals.allSatisfy { Self.hm($0.at) == "19:00" && !$0.habit })
  }

  @Test func streakNudgeOnlyForARealStreakOnAnEmptyKnownDay() {
    var p = ReminderPrefs.defaults
    p.challengeClaim = false
    var ctx = ReminderContext()
    ctx.streak = 5
    ctx.loggedToday = false
    ctx.streakRiskTime = ReminderClock(hour: 19, minute: 0)
    let plan = ReminderPlan.plan(p, ctx, now: Self.morning, calendar: Self.hcm)
    #expect(plan.map(\.key) == [.streak])
    #expect(plan.first.map { Self.hm($0.at) } == "19:00")
    var short = ctx
    short.streak = 2
    #expect(ReminderPlan.plan(p, short, now: Self.morning, calendar: Self.hcm).isEmpty, "chuỗi < 3")
    var logged = ctx
    logged.loggedToday = true
    #expect(ReminderPlan.plan(p, logged, now: Self.morning, calendar: Self.hcm).isEmpty, "đã ghi")
    var unread = ctx
    unread.loggedToday = nil
    #expect(ReminderPlan.plan(p, unread, now: Self.morning, calendar: Self.hcm).isEmpty, "chưa đọc ≠ trống")
    p.streak = false
    #expect(ReminderPlan.plan(p, ctx, now: Self.morning, calendar: Self.hcm).isEmpty, "đã tắt")
  }

  @Test func emptyKoaContextKeepsTheRNPlan() {
    var p = ReminderPrefs.defaults
    p.meal.enabled = true
    let plan = ReminderPlan.plan(p, ReminderContext(), now: Self.morning, calendar: Self.hcm)
    #expect(plan.filter { $0.key == .meal }.allSatisfy { Self.hm($0.at) == "20:00" })
    #expect(!plan.contains { $0.key == .streak })
  }

  @Test func lateClockIsTheHabitsLateEdge() {
    #expect(UserRhythm.lateClock(nil) == nil)
    let h = UserRhythm.Habit(hour: 12, strength: 0.9, spread: 0.75)
    #expect(UserRhythm.lateClock(h) == ReminderClock(hour: 13, minute: 30))
    let late = UserRhythm.Habit(hour: 23.5, strength: 0.9, spread: 0.5)
    #expect(UserRhythm.lateClock(late) == ReminderClock(hour: 0, minute: 30), "quấn qua nửa đêm")
  }

  @Test func prefsRoundTripTheStreakSwitch() {
    var p = ReminderPrefs.defaults
    p.streak = false
    #expect(ReminderPrefs.decode(p.encoded()).streak == false)
    #expect(ReminderPrefs.decode(#"{"meal":{"enabled":true,"hour":20,"minute":0}}"#).streak, "bộ cũ → mặc định bật")
  }
}

/// Chữ đặt vào OS: câu "mọi hôm" khi bắn theo giờ quen, `{n}` = số ngày chuỗi.
@MainActor
struct KoaReminderTextTests {
  actor Capture: ReminderScheduler {
    nonisolated var isAvailable: Bool { true }
    var items: [ScheduledReminder] = []
    func hasPermission() async -> Bool { true }
    func requestPermission() async -> Bool { true }
    func replaceAll(_ items: [ScheduledReminder]) async -> ScheduleOutcome {
      self.items = items
      return ScheduleOutcome(requested: items.count, scheduled: items.count, supported: true)
    }
    func cancelAll() async { items = [] }
  }
  final class Store: KeyValueStore, @unchecked Sendable {
    var v: [String: String] = [:]
    func string(forKey key: String) -> String? { v[key] }
    func set(_ value: String, forKey key: String) { v[key] = value }
    func remove(_ key: String) { v[key] = nil }
  }
  struct Clock: WallClock { func now() -> Date { KoaReminderTests.morning } }

  @Test func scheduledTextUsesHabitLineAndStreakCount() async {
    let os = Capture()
    let store = Store()
    store.set(KoaReminderTests.mealOn.encoded(), forKey: ReminderCenter.prefsKey)
    let c = ReminderCenter(
      store: store, scheduler: os, copy: ReminderCopyTable.copy(.vi), clock: Clock(), calendar: KoaReminderTests.hcm)
    await c.refreshPermission()
    var ctx = ReminderContext()
    ctx.habitTimes = [.meal: ReminderClock(hour: 13, minute: 30)]
    ctx.streak = 12
    ctx.loggedToday = false
    ctx.streakRiskTime = ReminderClock(hour: 19, minute: 0)
    await c.setEnabled(.streak, true)
    await c.sync(ctx)
    let items = await os.items
    let meal = items.first { $0.key == .meal }
    #expect(meal?.text.body.hasPrefix("Giờ này mọi hôm") == true)
    let streak = items.first { $0.key == .streak }
    #expect(streak?.text.title == "Chuỗi 12 ngày đang chờ")
    #expect(streak?.text.body.contains("12 ngày") == true)
  }
}
