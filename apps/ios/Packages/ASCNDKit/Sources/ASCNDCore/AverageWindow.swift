/// Khung của MỌI trung bình 7 ngày (Kiệt 27/10): bảy ngày TRƯỚC hôm nay. Hôm nay chưa
/// xong (bước buổi sáng, nước mới uống nửa ngày) nên không kéo trung bình xuống; số hôm
/// nay hiện riêng là "Hôm nay".
///
/// Một khung cho Insight, màn Nước, Vận động, Giấc ngủ, Tiến bộ (bước, đạm, ngủ, hồi
/// phục, nước) — trước 27/10 màn Nước / Tiến bộ tính tới HẾT hôm nay còn Insight thì
/// trước hôm nay, nên cùng lúc thấy 64 oz và 70 oz.
///
/// Trung bình chia cho ngày CÓ số (> 0): ngày trống không biết là không làm hay quên ghi
/// (như `Water.loggedAverage`).
public enum AverageWindow {
  public static let length = 7

  /// Ngày đầu: hôm nay − 7.
  public static func first(before today: LocalDate) -> LocalDate { today.adding(days: -length) }

  /// Ngày cuối: hôm qua.
  public static func last(before today: LocalDate) -> LocalDate { today.adding(days: -1) }

  /// Bảy ngày của khung, cũ → mới.
  public static func days(before today: LocalDate) -> [LocalDate] {
    (0..<length).map { first(before: today).adding(days: $0) }
  }

  public static func contains(_ day: LocalDate, before today: LocalDate) -> Bool {
    day >= first(before: today) && day < today
  }

  /// Lọc cột ngày (`daily_logs.date`) đúng khung: `first ≤ date < hôm nay`.
  public static func dateFilters(_ column: String = "date", before today: LocalDate) -> [RowQuery.Filter] {
    [.gte(column, .string(first(before: today).description)), .lt(column, .string(today.description))]
  }

  public struct Average: Sendable, Hashable {
    public let value: Double
    /// Ngày có số trong khung (≤ 7).
    public let days: Int

    public init(value: Double, days: Int) {
      self.value = value
      self.days = days
    }
  }

  /// Trung bình trên ngày có số (> 0, hữu hạn) TRONG khung; ngày ngoài khung (kể cả
  /// hôm nay) bị bỏ. Hai ngày trùng nhau thì cộng (vd. hai hàng nước cùng ngày).
  public static func average(_ values: [(day: LocalDate, value: Double)], before today: LocalDate) -> Average? {
    var byDay: [LocalDate: Double] = [:]
    for v in values where contains(v.day, before: today) && v.value.isFinite {
      byDay[v.day, default: 0] += v.value
    }
    let have = byDay.values.filter { $0 > 0 }
    guard !have.isEmpty else { return nil }
    return Average(value: have.reduce(0, +) / Double(have.count), days: have.count)
  }
}
