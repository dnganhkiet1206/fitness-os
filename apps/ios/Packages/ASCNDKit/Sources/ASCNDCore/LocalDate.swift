/// Một ngày theo lịch địa phương: `YYYY-MM-DD`, không giờ, không múi giờ.
///
/// "Hôm nay", "14 ngày gần nhất", "ngày của buổi tập" là chuyện LỊCH, không
/// phải chuyện thời điểm. Cộng 86 400 giây vào một `Date` lệch một giờ ở ngày
/// đổi giờ (DST) và có thể nhảy sai ngày — đúng loại lỗi bước cổng "neo cửa sổ
/// điểm sẵn sàng" bắt được ở Lord Howe ngày 04/10 (#233). Ở đây số học là số
/// học ngày thuần (days-from-civil), không đi qua `TimeZone` nào.
public struct LocalDate: Sendable, Hashable, Comparable, Codable, CustomStringConvertible {
  public let year: Int
  public let month: Int
  public let day: Int

  /// `nil` nếu không phải đúng dạng `YYYY-MM-DD` của một ngày có thật.
  public init?(_ text: String) {
    let parts = text.split(separator: "-", omittingEmptySubsequences: false)
    guard parts.count == 3, parts[0].count == 4, parts[1].count == 2, parts[2].count == 2,
      parts.allSatisfy({ $0.unicodeScalars.allSatisfy { $0.value >= 48 && $0.value <= 57 } }),
      let y = Int(parts[0]), let m = Int(parts[1]), let d = Int(parts[2]),
      (1...12).contains(m), (1...Self.daysIn(month: m, year: y)).contains(d)
    else { return nil }
    year = y
    month = m
    day = d
  }

  public init(daysSinceEpoch z: Int) {
    // Howard Hinnant, civil_from_days.
    let z = z + 719_468
    let era = (z >= 0 ? z : z - 146_096) / 146_097
    let doe = z - era * 146_097
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100)
    let mp = (5 * doy + 2) / 153
    let d = doy - (153 * mp + 2) / 5 + 1
    let m = mp < 10 ? mp + 3 : mp - 9
    year = yoe + era * 400 + (m <= 2 ? 1 : 0)
    month = m
    day = d
  }

  /// Số ngày kể từ 1970-01-01 (days_from_civil).
  public var daysSinceEpoch: Int {
    let y = month <= 2 ? year - 1 : year
    let era = (y >= 0 ? y : y - 399) / 400
    let yoe = y - era * 400
    let mp = month > 2 ? month - 3 : month + 9
    let doy = (153 * mp + 2) / 5 + day - 1
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy
    return era * 146_097 + doe - 719_468
  }

  public func adding(days: Int) -> LocalDate { LocalDate(daysSinceEpoch: daysSinceEpoch + days) }

  public var description: String {
    func pad(_ n: Int, _ w: Int) -> String {
      let s = String(n)
      return String(repeating: "0", count: max(0, w - s.count)) + s
    }
    return "\(pad(year, 4))-\(pad(month, 2))-\(pad(day, 2))"
  }

  public static func < (a: LocalDate, b: LocalDate) -> Bool { a.daysSinceEpoch < b.daysSinceEpoch }

  static func daysIn(month: Int, year: Int) -> Int {
    switch month {
    case 2: return (year % 4 == 0 && year % 100 != 0) || year % 400 == 0 ? 29 : 28
    case 4, 6, 9, 11: return 30
    default: return 31
    }
  }

  public init(from decoder: any Decoder) throws {
    let s = try decoder.singleValueContainer().decode(String.self)
    guard let d = LocalDate(s) else {
      throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "không phải YYYY-MM-DD: \(s)"))
    }
    self = d
  }

  public func encode(to encoder: any Encoder) throws {
    var c = encoder.singleValueContainer()
    try c.encode(description)
  }
}
