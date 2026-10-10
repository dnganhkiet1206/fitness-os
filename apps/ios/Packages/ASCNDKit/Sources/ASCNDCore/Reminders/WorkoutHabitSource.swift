public import Foundation

/// "Koa để ý: bạn thường ghi buổi tập quanh 18:00" (#527 A-NEXT-7 · S3, E) —
/// `SOURCE.workout` của `app/reminders.tsx:76-77` @ fac9ac2:
/// `formatClock({ hour: Math.round(workout.hour), minute: 0 })`.
///
/// Tệp riêng của E: lõi Nhắc nhở (`ReminderTiming`, `UserRhythm`, `HabitHours`)
/// là của A và không bị sửa — đây chỉ là chữ của dòng giải thích.
extension ReminderTiming {
  /// Giờ tròn của thói quen tập; `nil` khi chưa có thói quen. Như RN, 23:30
  /// trở đi làm tròn thành "24:00" (`Math.round` không quấn quanh ngày).
  public static func workoutHabitClock(_ hour: Double?) -> ReminderClock? {
    guard let hour, hour.isFinite, abs(hour) < 1e9 else { return nil }
    // `Math.round`: nửa làm tròn LÊN (về +∞), kể cả số âm.
    return ReminderClock(hour: Int((hour + 0.5).rounded(.down)), minute: 0)
  }
}
