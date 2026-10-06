public import Foundation

/// Một thời điểm, tính bằng mili giây số nguyên kể từ 1970 — đơn vị của
/// `Date.now()` bên RN và của golden vectors.
///
/// Logic có làm tròn theo giây (rest timer, hạn khoá, cửa sổ ngày) tính trên
/// kiểu này thay vì `Date`: `Double` giây làm `ceil` lệch một giây ở những hiệu
/// đáng lẽ tròn (xem `RestTimer`). `Date` chỉ xuất hiện ở rìa — đọc giờ hệ
/// thống, truyền cho ActivityKit.
public struct EpochMillis: Sendable, Hashable, Comparable, Codable {
  public let millis: Int64

  public init(_ millis: Int64) { self.millis = millis }

  /// Làm tròn về mili giây gần nhất.
  public init(_ date: Date) {
    self.millis = Int64((date.timeIntervalSince1970 * 1000).rounded())
  }

  public var date: Date { Date(timeIntervalSince1970: Double(millis) / 1000) }

  public static func < (a: EpochMillis, b: EpochMillis) -> Bool { a.millis < b.millis }
  public static func + (a: EpochMillis, ms: Int64) -> EpochMillis { EpochMillis(a.millis + ms) }
  public static func - (a: EpochMillis, ms: Int64) -> EpochMillis { EpochMillis(a.millis - ms) }

  public init(from decoder: any Decoder) throws {
    millis = try decoder.singleValueContainer().decode(Int64.self)
  }

  public func encode(to encoder: any Encoder) throws {
    var c = encoder.singleValueContainer()
    try c.encode(millis)
  }
}

extension WallClock {
  public func nowMillis() -> EpochMillis { EpochMillis(now()) }
}
