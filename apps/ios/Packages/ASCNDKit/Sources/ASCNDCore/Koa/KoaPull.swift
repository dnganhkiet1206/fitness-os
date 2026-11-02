public import Foundation

/// Cảnh Koa chạy tới kéo thẻ nhiệm vụ (01/11, Kiệt). Thuần theo thời gian như `KoaBedtime`: app đưa
/// giây đã trôi, nhận về khung diễn. Dùng đủ bộ của phim hoạt hình: lấy đà, co giãn khi chạy, chạy
/// theo đường cong về phía máy, thụp xuống, thò đầu lên TRƯỚC khi thẻ nhúc nhích, kéo hai nhịp
/// (nhịp sau mạnh hơn) và nảy qua đích một chút rồi lắng.
public enum KoaPull {
  public static let anticipate = 0.22
  public static let run = 0.6
  public static let duck = 0.14
  public static let peek = 0.24
  public static let tugOne = 0.3
  public static let breath = 0.1
  public static let tugTwo = 0.32
  public static let settle = 0.3

  public static var runEnd: Double { anticipate + run }
  public static var duckEnd: Double { runEnd + duck }
  public static var peekEnd: Double { duckEnd + peek }
  public static var tugOneEnd: Double { peekEnd + tugOne }
  public static var tugTwoStart: Double { tugOneEnd + breath }
  public static var tugTwoEnd: Double { tugTwoStart + tugTwo }
  public static var end: Double { tugTwoEnd + settle }

  /// Một khung, đơn vị điểm trên màn.
  public struct Shot: Sendable, Hashable {
    /// Tâm đầu Koa.
    public var x: Double
    public var y: Double
    /// Cỡ hình (1 = rộng 240 điểm).
    public var scale: Double
    public var angle: Double
    public var stretchX: Double
    public var stretchY: Double
    /// Đang chạy (dùng dáng chạy), còn lại là dáng đứng.
    public var running: Bool
    /// Phần bảng đã lên, 1 = hết; nảy quá 1 một chút.
    public var panel: Double
    /// Tay đã bám mép bảng.
    public var hands: Bool
  }

  static func ease(_ t: Double) -> Double {
    let u = min(1, max(0, t))
    return u * u * (3 - 2 * u)
  }

  /// Phần bảng đã lên ở giây `t`.
  public static func panel(at t: Double) -> Double {
    if t < peekEnd { return 0 }
    if t < tugOneEnd { return 0.5 * ease((t - peekEnd) / tugOne) }
    if t < tugTwoStart { return 0.5 - 0.025 * sin((t - tugOneEnd) / breath * .pi) }
    if t < tugTwoEnd { return 0.5 + 0.55 * ease((t - tugTwoStart) / tugTwo) }
    return 1 + 0.05 * (1 - ease((t - tugTwoEnd) / settle))
  }

  /// - Parameters:
  ///   - start: tâm đầu Koa trên sân khấu, cỡ hình lúc ấy.
  ///   - width, height: cỡ màn.
  ///   - panelHeight: chiều cao bảng khi mở hết.
  public static func shot(
    at t: Double, start: (x: Double, y: Double, scale: Double), width: Double, height: Double, panelHeight: Double
  ) -> Shot {
    let edge = height - panelHeight * panel(at: t)
    if t < anticipate {
      // nhún xuống lấy đà, hơi ngả ngược hướng sắp chạy
      let c = sin(min(1, t / anticipate) * .pi)
      return Shot(
        x: start.x, y: start.y + 8 * c, scale: start.scale, angle: -4 * c, stretchX: 1 + 0.12 * c, stretchY: 1 - 0.14 * c,
        running: false, panel: 0, hands: false)
    }
    if t < duckEnd {
      let p = min(1, (t - anticipate) / run)
      // nhanh dần về phía máy quay: to lên, đi theo đường cong qua giữa màn
      let e = p * p
      let c = sin(p * .pi)
      let y = start.y + (height + 170 - start.y) * e - 70 * c
      return Shot(
        x: start.x + (width / 2 - start.x) * ease(p), y: y, scale: start.scale * (1 + 1.6 * e), angle: 6 * c,
        stretchX: 1 - 0.1 * c, stretchY: 1 + 0.16 * c, running: true, panel: 0, hands: false)
    }
    // thò đầu lên mép bảng, chưa kéo; kéo thì đầu nhúi theo từng nhịp
    let up = ease((t - duckEnd) / peek)
    let scale = 0.8
    let rest = edge - 44
    var y = rest + (1 - up) * 150
    var angle = -5 * up
    var hop = 0.0
    if t >= peekEnd, t < tugOneEnd { hop = sin((t - peekEnd) / tugOne * .pi) }
    if t >= tugTwoStart, t < tugTwoEnd { hop = sin((t - tugTwoStart) / tugTwo * .pi) }
    y += 10 * hop
    angle += 7 * hop
    return Shot(
      x: width / 2, y: y, scale: scale, angle: angle, stretchX: 1 + 0.05 * hop, stretchY: 1 - 0.06 * hop, running: false,
      panel: panel(at: t), hands: t >= duckEnd + peek * 0.5)
  }
}
