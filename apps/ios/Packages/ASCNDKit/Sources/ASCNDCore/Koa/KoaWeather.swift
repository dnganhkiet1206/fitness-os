public import Foundation

/// Thời tiết ngoài ô cửa vòm phòng Koa (Kiệt duyệt mock 23/11, phương án A): mỗi ngày một kiểu trời cố định cho
/// mọi lần mở phòng trong ngày, chọn theo mùa (bắc bán cầu) và một hạt giống lấy từ ngày. Không cần quyền vị trí,
/// không gọi mạng. Tuyết chỉ có ở cảnh núi mùa đông.
public enum KoaWeather: String, CaseIterable, Sendable {
  case clear, cloudy, rain, fog, snow

  public enum Season: Sendable { case winter, spring, summer, autumn }

  public static func season(month: Int) -> Season {
    switch month {
    case 12, 1, 2: .winter
    case 3, 4, 5: .spring
    case 6, 7, 8: .summer
    default: .autumn
    }
  }

  /// Tỉ lệ từng kiểu trời theo mùa (cộng lại = 1). Đông hay sương / mưa phùn, hè hay mưa rào, hè không sương.
  public static func odds(_ s: Season) -> [(KoaWeather, Double)] {
    switch s {
    case .winter: [(.clear, 0.40), (.cloudy, 0.25), (.fog, 0.20), (.rain, 0.15)]
    case .spring: [(.clear, 0.45), (.cloudy, 0.25), (.rain, 0.20), (.fog, 0.10)]
    case .summer: [(.clear, 0.50), (.cloudy, 0.15), (.rain, 0.35)]
    case .autumn: [(.clear, 0.45), (.cloudy, 0.30), (.rain, 0.15), (.fog, 0.10)]
    }
  }

  /// Số 0..<1 cố định cho một ngày (splitmix64, không dùng `Hasher` vì nó đổi hạt mỗi lần chạy app).
  static func roll(year: Int, month: Int, day: Int) -> Double {
    var z = UInt64(truncatingIfNeeded: year * 10_000 + month * 100 + day) &+ 0x9E37_79B9_7F4A_7C15
    z = (z ^ (z >> 30)) &* 0xBF58_476D_1CE4_E5B9
    z = (z ^ (z >> 27)) &* 0x94D0_49BB_1331_11EB
    z ^= z >> 31
    return Double(z >> 11) / Double(1 << 53)
  }

  /// Kiểu trời của một ngày. `window` là cửa sổ đã mua (`mountain`, `ocean`) hoặc `nil` (thành phố).
  public static func of(year: Int, month: Int, day: Int, window: String? = nil) -> KoaWeather {
    let s = season(month: month)
    var u = roll(year: year, month: month, day: day)
    var pick = KoaWeather.clear
    for (w, p) in odds(s) {
      if u < p { pick = w; break }
      u -= p
    }
    if pick == .rain, s == .winter, window == "mountain" { return .snow }
    return pick
  }

  /// Ngày theo lịch Gregory ở múi giờ của `calendar` (đổi trời lúc nửa đêm địa phương). Máy dùng lịch khác
  /// (Hồi giáo, Phật lịch…) vẫn ra đúng mùa (Devin #1005).
  public static func of(_ date: Date, calendar: Calendar = .current, window: String? = nil) -> KoaWeather {
    var g = Calendar(identifier: .gregorian)
    g.timeZone = calendar.timeZone
    let c = g.dateComponents([.year, .month, .day], from: date)
    return of(year: c.year ?? 2026, month: c.month ?? 1, day: c.day ?? 1, window: window)
  }

  /// Số lớp mây (0…3). Sương thì không vẽ mây riêng, chỉ dải sương.
  public var cloudLayers: Int {
    switch self {
    case .clear: 1
    case .cloudy, .rain: 3
    case .snow: 2
    case .fog: 0
    }
  }

  /// Mây dày (đặc, không trong) khi trời xấu.
  public var denseClouds: Bool { self == .cloudy || self == .rain }

  /// Độ phủ màu xám lên trời (0 = giữ nguyên trời gốc): che bớt trăng / nắng khi mưa, sương.
  public var overcast: Double {
    switch self {
    case .clear: 0
    case .cloudy: 0.28
    case .rain: 0.42
    case .fog: 0.38
    case .snow: 0.22
    }
  }

  /// Gió của mưa / tuyết. Quãng trôi ngang là TÍCH PHÂN của vận tốc gió theo thời gian, không phải vận tốc × t:
  /// `t` là giây kể từ 2001 (~8·10⁸), nhân vận tốc biến thiên thì hạt nhảy ngang mỗi khung (Devin #1005).
  public enum Wind {
    /// Hệ số gió của mưa: vận tốc ngang = `rainGust` × tốc độ rơi.
    public static func rainGust(_ t: Double) -> Double { 0.16 + 0.05 * sin(t * 0.23) + 0.02 * sin(t * 0.9) }
    /// ∫ `rainGust` dt.
    public static func rainDrift(_ t: Double) -> Double {
      0.16 * t - 0.05 / 0.23 * cos(t * 0.23) - 0.02 / 0.9 * cos(t * 0.9)
    }
    /// Gió đẩy tuyết (điểm / giây).
    public static func snowWind(_ t: Double) -> Double { 5 + 2 * sin(t * 0.11) }
    /// ∫ `snowWind` dt.
    public static func snowDrift(_ t: Double) -> Double { 5 * t - 2 / 0.11 * cos(t * 0.11) }
  }
}
