public import Foundation

/// Giờ thật, tiêm vào được.
///
/// Mọi logic phụ thuộc thời điểm (rest timer, "hôm nay", chuỗi ngày, hết hạn
/// khoá đăng) nhận giờ qua đây thay vì gọi `Date()` trực tiếp — để golden
/// vectors chạy được với một thời điểm cố định, và để không có hai chỗ trong
/// cùng một lượt tính đọc ra hai "bây giờ" khác nhau.
///
/// Tên `WallClock` chứ không phải `Clock`: `Clock` của thư viện chuẩn là đồng hồ
/// đơn điệu để đo khoảng (`ContinuousClock`), không phải giờ lịch.
public protocol WallClock: Sendable {
  func now() -> Date
}

public struct SystemWallClock: WallClock {
  public init() {}
  public func now() -> Date { Date() }
}
