public import Foundation

/// Cân nặng và nước đọc từ Apple Health (17/10, chủ dự án: app bắt ghi quá
/// nhiều). RN không đọc hai loại này — khác RN, ghi ở NATIVE_IMPROVEMENTS.
///
/// Chỉ ĐỌC (không ghi ngược HealthKit). Hàng ghi đúng hình dạng hàng ghi tay
/// của app (`WeightLog.row`, `water_logs`), không đổi schema:
/// - cân: lần cân MỚI nhất mỗi ngày địa phương; ngày đã có hàng (ghi tay hay
///   lần trước) thì để yên — ghi tay luôn thắng;
/// - nước: mỗi mẫu một hàng, `id` = UUID của mẫu HealthKit, nên đồng bộ lại
///   không đếm đôi.
extension HealthData {
  /// Cân: 30 ngày (cân thông minh có thể lâu mới mở app).
  public static let weightDays = 30
  /// Nước: 7 ngày.
  public static let waterDays = 7
  /// Một lần uống lớn hơn thế này là nhập nhầm (5 L).
  public static let maxGlassMl = 5_000

  public struct WeightSample: Sendable, Hashable {
    public let at: EpochMillis
    public let kg: Double
    public init(at: EpochMillis, kg: Double) {
      self.at = at
      self.kg = kg
    }
  }

  public struct WaterSample: Sendable, Hashable {
    public let uuid: String
    public let at: EpochMillis
    public let ml: Double
    public init(uuid: String, at: EpochMillis, ml: Double) {
      self.uuid = uuid
      self.at = at
      self.ml = ml
    }
  }

  public struct WeighIn: Sendable, Hashable {
    public let date: LocalDate
    public let kg: Double
  }

  public struct WaterRow: Sendable, Hashable {
    /// UUID của mẫu HealthKit, chữ thường — khoá chính `water_logs.id`.
    public let id: String
    public let date: LocalDate
    public let ml: Int
    public let loggedAt: EpochMillis
  }

  /// Lần cân mới nhất của mỗi ngày địa phương, trong dải hợp lệ của app
  /// (`WeightLog.plausible`), cũ → mới.
  public static func weighIns(_ samples: [WeightSample], in tz: TimeZone) -> [WeighIn] {
    var newest: [LocalDate: WeightSample] = [:]
    for s in samples where WeightLog.plausible(s.kg) {
      let day = LocalDate(s.at, in: tz)
      if let cur = newest[day], cur.at >= s.at { continue }
      newest[day] = s
    }
    return newest.keys.sorted().map { WeighIn(date: $0, kg: (newest[$0]!.kg * 100).rounded() / 100) }
  }

  /// Mỗi mẫu nước một hàng; bỏ mẫu không có UUID, ≤ 0 hoặc quá `maxGlassMl`.
  public static func waterRows(_ samples: [WaterSample], in tz: TimeZone) -> [WaterRow] {
    samples.compactMap { s in
      let ml = Int(s.ml.rounded())
      guard UUID(uuidString: s.uuid) != nil, ml > 0, ml <= maxGlassMl else { return nil }
      return WaterRow(id: s.uuid.lowercased(), date: LocalDate(s.at, in: tz), ml: ml, loggedAt: s.at)
    }
    .sorted { $0.loggedAt < $1.loggedAt }
  }
}
