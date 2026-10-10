public import Foundation

/// Điều màn Nhắc nhở biết từ hồ sơ (`app/reminders.tsx`, `use-reminders.ts:278`
/// @ fac9ac2): giờ ngủ / dậy chỉ tính khi người dùng TỰ lưu (`sleep_target_*_set`).
/// Cột giờ có mặc định '23:00' / '07:00' trong DB, và onboarding không hỏi —
/// nên giờ không có cờ không phải bằng chứng, và Koa không được "để ý" nó.
extension ReminderCenter.SleepSchedule {
  public init(profile: Profile) {
    self.init(
      bedtime: profile.sleepTargetBedtimeSet == true ? profile.sleepTargetBedtime : nil,
      waketime: profile.sleepTargetWaketimeSet == true ? profile.sleepTargetWaketime : nil)
  }
}

extension ReminderTiming.Known {
  /// `known` của `app/reminders.tsx`. `workoutHour` là giờ người này thật sự
  /// hay hoàn thành nhiệm vụ tập (`habitFor('workout')?.hour`, `:60` / `:71`) —
  /// `HabitHours.habit(.workout, userId:)?.hour`. Chưa có thói quen → `nil`:
  /// app im lặng về giờ tập thay vì đoán.
  public init(profile: Profile?, workoutHour: Double? = nil) {
    self.init(
      bedtime: profile?.sleepTargetBedtimeSet == true ? profile?.sleepTargetBedtime : nil,
      waketime: profile?.sleepTargetWaketimeSet == true ? profile?.sleepTargetWaketime : nil,
      workoutHour: workoutHour)
  }

  /// `String(known.bedtime).slice(0, 5)`: '23:00:00' → '23:00'.
  public static func clockText(_ value: String?) -> String? {
    value.map { String($0.prefix(5)) }
  }
}
