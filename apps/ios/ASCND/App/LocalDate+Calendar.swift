import ASCNDCore
import Foundation

/// Ngày lịch ↔ `Date` cho `DatePicker` (onboarding, sửa hồ sơ): theo lịch của
/// máy, không giờ, không múi — một ngày sinh không có múi giờ.
extension LocalDate {
  var calendarDate: Date {
    Calendar.current.date(from: DateComponents(year: year, month: month, day: day)) ?? Date()
  }

  /// `nil` chỉ khi lịch của máy trả về một ngày không đọc được.
  init?(calendarDate date: Date) {
    let c = Calendar.current.dateComponents([.year, .month, .day], from: date)
    self.init(String(format: "%04d-%02d-%02d", c.year ?? 2000, c.month ?? 1, c.day ?? 1))
  }
}
