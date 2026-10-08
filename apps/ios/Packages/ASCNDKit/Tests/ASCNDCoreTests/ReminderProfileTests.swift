import ASCNDCore
import Foundation
import Testing

/// Màn Nhắc nhở đọc giờ ngủ / dậy từ hồ sơ (#527 1.10) — `app/reminders.tsx`,
/// `use-reminders.ts:278` @ fac9ac2.
@MainActor
struct ReminderProfileTests {
  static func profile(_ extra: [String: JSONValue]) -> Profile {
    var row: [String: JSONValue] = [
      "user_id": .string("u1"), "sleep_target_bedtime": .string("23:30:00"),
      "sleep_target_waketime": .string("06:15:00"),
    ]
    row.merge(extra) { $1 }
    return Profile(row: .object(row))!
  }

  /// Giờ mặc định của cột (không cờ) không phải điều người dùng đã nói (P0-3).
  @Test func onlyTimesTheUserSavedCount() {
    let none = Self.profile([:])
    #expect(none.sleepTargetBedtimeSet == nil && none.sleepTargetWaketimeSet == nil)
    #expect(ReminderCenter.SleepSchedule(profile: none) == .init(bedtime: nil, waketime: nil))
    #expect(ReminderTiming.Known(profile: none) == ReminderTiming.Known())

    let bed = Self.profile(["sleep_target_bedtime_set": .bool(true), "sleep_target_waketime_set": .bool(false)])
    #expect(ReminderCenter.SleepSchedule(profile: bed) == .init(bedtime: "23:30:00", waketime: nil))

    let both = Self.profile(["sleep_target_bedtime_set": .bool(true), "sleep_target_waketime_set": .bool(true)])
    let known = ReminderTiming.Known(profile: both)
    #expect(known.bedtime == "23:30:00" && known.waketime == "06:15:00" && known.workoutHour == nil)
    #expect(ReminderTiming.Known(profile: nil) == ReminderTiming.Known())
  }

  /// Lời mời đổi giờ trên màn: giờ ngủ 23:30 → nhắc 23:00; dậy 06:15 → cân
  /// 06:30, ghi đêm qua 07:15. Giờ tập: app chưa biết thói quen → không mời.
  @Test func offersFollowWhatTheUserSaved() {
    let known = ReminderTiming.Known(
      profile: Self.profile(["sleep_target_bedtime_set": .bool(true), "sleep_target_waketime_set": .bool(true)]))
    var prefs = ReminderPrefs.defaults
    for key in ReminderKey.timed { prefs.setEnabled(key, true) }
    #expect(ReminderTiming.offer(.bedtime, prefs: prefs, known: known) == ReminderClock(hour: 23, minute: 0))
    #expect(ReminderTiming.offer(.weighIn, prefs: prefs, known: known) == ReminderClock(hour: 6, minute: 30))
    #expect(ReminderTiming.offer(.sleepLog, prefs: prefs, known: known) == ReminderClock(hour: 7, minute: 15))
    #expect(ReminderTiming.offer(.workout, prefs: prefs, known: known) == nil)
    #expect(ReminderTiming.offer(.meal, prefs: prefs, known: known) == nil)
    prefs.setEnabled(.bedtime, false)
    #expect(ReminderTiming.offer(.bedtime, prefs: prefs, known: known) == nil, "lời nhắc đang tắt: không mời")
    #expect(ReminderTiming.Known.clockText("23:30:00") == "23:30")
    #expect(ReminderTiming.Known.clockText(nil) == nil)
  }
}
