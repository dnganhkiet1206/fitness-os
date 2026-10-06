public import ASCNDCore
public import Foundation

/// Đồng hồ đứng yên cho test. Muốn "trôi" thì tạo cái mới với giờ mới —
/// giá trị bất biến thì không cần khoá giữa các luồng.
public struct FixedWallClock: WallClock {
  public let date: Date
  public init(_ date: Date) { self.date = date }
  /// ISO 8601 có múi giờ, ví dụ "2026-10-05T14:00:00+07:00".
  public init(iso8601: String) {
    guard let d = ISO8601DateFormatter().date(from: iso8601) else {
      preconditionFailure("FixedWallClock: '\(iso8601)' không phải ISO 8601")
    }
    self.date = d
  }
  public func now() -> Date { date }
}
