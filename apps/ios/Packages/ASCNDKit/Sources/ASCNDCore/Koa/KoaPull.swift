public import Foundation

/// Cảnh Koa chạy tới kéo thẻ nhiệm vụ (01/11, Kiệt). Thuần theo thời gian như `KoaBedtime`: app đưa
/// giây đã trôi, nhận về khung diễn. Dùng đủ bộ của phim hoạt hình: lấy đà, co giãn khi chạy, chạy
/// theo đường cong về phía máy, thụp xuống, thò đầu lên TRƯỚC khi thẻ nhúc nhích, kéo hai nhịp
/// (nhịp sau mạnh hơn) và nảy qua đích một chút rồi lắng.
public enum KoaPull {
  public static let anticipate = 0.34
  public static let hopOff = 0.3
  public static let strideOne = 0.2
  public static let strideTwo = 0.18
  public static let dive = 0.14
  public static var run: Double { hopOff + strideOne + strideTwo + dive }
  public static let duck = 0.1
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

  /// Giây các lần chân chạm sàn, để app tung bụi.
  public static var landings: [Double] { [anticipate + hopOff, anticipate + hopOff + strideOne, runEnd - dive] }

  /// - Parameters:
  ///   - start: tâm đầu Koa trên sân khấu, cỡ hình lúc ấy.
  ///   - width, height: cỡ màn.
  ///   - panelHeight: chiều cao bảng khi mở hết.
  public static func shot(
    at t: Double, start: (x: Double, y: Double, scale: Double), width: Double, height: Double, panelHeight: Double
  ) -> Shot {
    let edge = height - panelHeight * panel(at: t)
    if t < anticipate {
      // liếc người xem, ngả ra sau, nén người như lò xo; nén sâu rồi mới bung
      let c = ease(t / anticipate)
      return Shot(
        x: start.x - 7 * c, y: start.y + 14 * c, scale: start.scale, angle: -9 * c, stretchX: 1 + 0.16 * c,
        stretchY: 1 - 0.2 * c, running: false, panel: 0, hands: false)
    }
    if t < duckEnd {
      // từng cú phóng về phía máy: cỡ tăng theo cấp số, mỗi cú to hơn cú trước; phóng đều trông như
      // chậm lại nên khoảng cách cũng dài dần
      let s = start.scale, cx = width / 2
      let keys: [(x: Double, y: Double, scale: Double, arc: Double, length: Double)] = [
        (start.x, start.y, s, 0, 0),
        (start.x + (cx - start.x) * 0.5, height * 0.66, s * 1.3, 96, hopOff),
        (cx, height * 0.74, s * 1.8, 62, strideOne),
        (cx, height * 0.88, s * 2.6, 44, strideTwo),
        (cx, height + 260, s * 4.4, 0, dive),
      ]
      var at = anticipate
      for k in 1..<keys.count {
        let a = keys[k - 1], b = keys[k]
        if t < at + b.length || k == keys.count - 1 {
          let p = min(1, (t - at) / b.length)
          let grow = pow(p, 1.5)
          let c = sin(p * .pi)
          // chạm đất: bẹp xuống trong vài khung đầu của cú sau, rồi bung dài khi lên cao
          let contact = k > 1 ? max(0, 1 - (t - at) / 0.07) : 0
          let dive = k == keys.count - 1
          let stretch = dive ? 0.55 * p : 0.2 * c
          return Shot(
            x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * grow - b.arc * c, scale: a.scale + (b.scale - a.scale) * grow,
            angle: (k % 2 == 0 ? -1 : 1) * 7 * c, stretchX: 1 - stretch * 0.6 + 0.2 * contact,
            stretchY: 1 + stretch - 0.24 * contact, running: true, panel: 0, hands: false)
        }
        at += b.length
      }
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
