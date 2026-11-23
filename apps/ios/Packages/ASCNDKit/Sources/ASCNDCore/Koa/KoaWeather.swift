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

  public static func of(_ date: Date, calendar: Calendar = .current, window: String? = nil) -> KoaWeather {
    let c = calendar.dateComponents([.year, .month, .day], from: date)
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
}
