public import Foundation

/// Giờ một người hay làm một việc — `lib/user-rhythm.ts` @ fac9ac2, port
/// nguyên văn (#527 A-NEXT-7 · S1). Golden THẬT: `UserRhythmGoldenTests`.
///
/// Giờ là một vòng tròn: mỗi lần quan sát cộng sin / cos của góc giờ; thói quen
/// là hướng trung bình, độ tin là độ dài vector trung bình `r`. Chưa đủ
/// `minObs` lần, hay `r < minR` (giờ quá tản mát), là "chưa có thói quen".
public enum UserRhythm {
  /// `HourStat`: tổng chạy — không bao giờ cho một giá trị không hữu hạn vào.
  public struct HourStat: Sendable, Hashable, Codable {
    public var n: Double
    public var sin: Double
    public var cos: Double

    public init(n: Double = 0, sin: Double = 0, cos: Double = 0) {
      self.n = n
      self.sin = sin
      self.cos = cos
    }

    /// `emptyHours()`.
    public static let empty = HourStat()
  }

  /// `Habit`: giờ (0…24), độ tin `r`, độ tản (giờ).
  public struct Habit: Sendable, Hashable {
    public let hour: Double
    public let strength: Double
    public let spread: Double
  }

  /// `MIN_OBS` (`:76`), `MIN_R` (`:85`), `SLACK` (`:149`), `FLOOR_REACH` (`:162`).
  public static let minObs = 6.0
  public static let minR = 0.6
  public static let slack = 2.0
  public static let floorReach = 6.0

  private static let tau = Double.pi * 2

  static func wrap24(_ h: Double) -> Double { ((h.truncatingRemainder(dividingBy: 24)) + 24).truncatingRemainder(dividingBy: 24) }

  private static func toAngle(_ hour: Double) -> Double { tau * wrap24(hour) / 24 }

  /// `observeHour` (`:51`): giờ không hữu hạn thì bỏ qua (một `NaN` trong tổng
  /// chạy là hỏng vĩnh viễn); giờ âm / ≥ 24 quấn quanh ngày.
  public static func observeHour(_ s: HourStat, _ hour: Double) -> HourStat {
    guard hour.isFinite else { return s }
    let a = toAngle(hour)
    return HourStat(n: s.n + 1, sin: s.sin + Foundation.sin(a), cos: s.cos + Foundation.cos(a))
  }

  /// `habit` (`:97`): `nil` khi tổng không hữu hạn, chưa đủ `minObs`, hay `r`
  /// không hữu hạn / dưới `minR`.
  public static func habit(_ s: HourStat) -> Habit? {
    guard s.n.isFinite, s.sin.isFinite, s.cos.isFinite else { return nil }
    guard s.n >= minObs else { return nil }
    let r = (s.sin * s.sin + s.cos * s.cos).squareRoot() / s.n
    guard r.isFinite, r >= minR else { return nil }
    var angle = atan2(s.sin, s.cos)
    if angle < 0 { angle += tau }
    let spreadRad = (-2 * Foundation.log(r)).squareRoot()
    return Habit(hour: angle / tau * 24, strength: r, spread: spreadRad / tau * 24)
  }

  /// `forward(a, b)` (`:194`): giờ từ `a` tới `b`, đi tới.
  public static func forward(_ a: Double, _ b: Double) -> Double { wrap24(b - a) }

  /// `lateHour` (`:187`): mép muộn của thói quen (`hour + slack × spread`), trừ
  /// khi nó nằm sát trước `floor` — khi ấy dùng `floor`. Không có thói quen → `floor`.
  public static func lateHour(_ h: Habit?, floor: Double) -> Double {
    guard let h else { return floor }
    let late = wrap24(h.hour + slack * h.spread)
    return forward(late, floor) <= floorReach ? wrap24(floor) : late
  }
}
