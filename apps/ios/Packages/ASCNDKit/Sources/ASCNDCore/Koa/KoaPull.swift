import Foundation

/// Cảnh Koa chạy tới kéo thẻ nhiệm vụ (01/11, Kiệt). Thuần theo thời gian như `KoaBedtime`: app đưa
/// giây đã trôi, nhận về khung diễn. Dùng đủ bộ của phim hoạt hình: lấy đà, co giãn khi chạy, chạy
/// theo đường cong về phía máy, thụp xuống, thò đầu lên TRƯỚC khi thẻ nhúc nhích, kéo hai nhịp
/// (nhịp sau mạnh hơn) và nảy qua đích một chút rồi lắng.
public enum KoaPull {
  // Koa tung tăng tới mép dưới, không lao vào máy (Kiệt 02/11): vật to dần về phía mắt làm người
  // ta giật mình, nên cỡ gần như giữ nguyên, nhịp chậm, mặt vui; mặt thách đểu để dành lúc thò đầu.
  public static let anticipate = 0.5
  public static let hopOff = 0.46
  public static let strideOne = 0.34
  public static let strideTwo = 0.34
  public static let dive = 0.2
  public static var run: Double { hopOff + strideOne + strideTwo + dive }
  public static let duck = 0.04
  public static let peek = 0.22
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
    public var expression: KoaFlags.Expression
    /// Dáng của rig khi đang chạy (`KoaRun`); `nil` = dáng đứng.
    public var walk: KoaWalk.Pose?
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
  public static var landings: [Double] {
    let start = anticipate + hopOff
    return [start, start + 2 * KoaRun.step, start + 4 * KoaRun.step]
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
      // tai vểnh, nhìn xuống thẻ, khuỵu xuống lấy đà, tay vung ra sau
      let c = ease(t / anticipate)
      return Shot(
        x: start.x - 4 * c, y: start.y + 7 * c, scale: start.scale, angle: -4 * c, stretchX: 1 + 0.08 * c,
        stretchY: 1 - 0.1 * c, running: false, panel: 0, hands: false, expression: .happy, walk: KoaRun.crouch(c))
    }
    let cx = width / 2, s = start.scale
    let landing = (x: cx + width * 0.17, y: height * 0.66)
    let hopEnd = anticipate + hopOff
    if t < hopEnd {
      // bung người rời bục theo đường cung, rướn dài rồi co chân lại trên đỉnh
      let p = (t - anticipate) / hopOff, c = sin(p * .pi)
      let stretch = 0.1 * sin(min(1, p * 1.6) * .pi)
      return Shot(
        x: start.x + (landing.x - start.x) * ease(p), y: start.y + (landing.y - start.y) * p * p - 58 * c,
        scale: s * (1 + 0.04 * p), angle: 5 * c, stretchX: 1 - stretch * 0.6, stretchY: 1 + stretch, running: true,
        panel: 0, hands: false, expression: .happy, walk: KoaRun.leap(p, turn: 0.6))
    }
    if t < duckEnd {
      // chạy theo đường cong xuống mép dưới, không đi thẳng; quay dần về phía thẻ
      let q = min(1, (t - hopEnd) / (strideOne + strideTwo + dive))
      let u = pow(q, 1.35), v = 1 - u
      let bend = (x: cx + width * 0.2, y: height * 0.84), exit = (x: cx, y: height + 200)
      let phase = (t - hopEnd) / KoaRun.step
      let contact = max(0, 1 - (t - hopEnd) / 0.09)
      let beat = KoaRun.squash(phase)
      return Shot(
        x: v * v * landing.x + 2 * u * v * bend.x + u * u * exit.x,
        y: v * v * landing.y + 2 * u * v * bend.y + u * u * exit.y - KoaRun.flight(phase) * s,
        scale: s * (1.04 + 0.18 * u), angle: 2 * sin(phase * .pi), stretchX: 1 - beat * 0.6 + 0.1 * contact,
        stretchY: 1 + beat - 0.12 * contact, running: true, panel: 0, hands: false, expression: .happy,
        walk: KoaRun.pose(phase: phase, turn: 0.55 * (1 - q)))
    }
    // thò đầu lên mép bảng, chưa kéo; kéo thì đầu nhúi theo từng nhịp
    let up = ease((t - duckEnd) / peek)
    let scale = 0.8
    let rest = edge - 44
    var y = rest + (1 - up) * 90
    var angle = -5 * up
    var hop = 0.0
    if t >= peekEnd, t < tugOneEnd { hop = sin((t - peekEnd) / tugOne * .pi) }
    if t >= tugTwoStart, t < tugTwoEnd { hop = sin((t - tugTwoStart) / tugTwo * .pi) }
    y += 10 * hop
    angle += 7 * hop
    return Shot(
      x: width / 2, y: y, scale: scale, angle: angle, stretchX: 1 + 0.05 * hop, stretchY: 1 - 0.06 * hop, running: false,
      panel: panel(at: t), hands: t >= duckEnd + peek * 0.5, expression: .tease)
  }
}

/// Chu kỳ chạy của Koa trên rig thật (`KoaWalk.Pose`), vẽ theo bốn dáng chìa khoá của phim hoạt
/// hình cho mỗi bước: chạm đất, khuỵu xuống, đạp, bay. Có quãng cả hai chân rời đất nên đọc ra là
/// chạy chứ không phải đi. Tay đánh ngược chân, tai và đầu trễ một nhịp theo thân.
public enum KoaRun {
  /// Giây mỗi bước.
  public static let step = 0.17
  static let stride = 13.0
  static let knee = 20.0

  /// Độ nhún theo phần `u` của bước: chạm đất, khuỵu, đạp, bay.
  static func bob(_ u: Double) -> Double {
    let keys: [(Double, Double)] = [(0, 2), (0.25, -7), (0.5, 1), (0.75, 10), (1, 2)]
    for (a, b) in zip(keys, keys.dropFirst()) where u <= b.0 {
      return a.1 + (b.1 - a.1) * KoaPull.ease((u - a.0) / (b.0 - a.0))
    }
    return 2
  }

  private static func unit(_ phase: Double) -> Double { phase - floor(phase) }

  /// Thân bay lên bao nhiêu (đơn vị hình) ở quãng hai chân rời đất.
  public static func flight(_ phase: Double) -> Double {
    let u = unit(phase)
    return u < 0.5 ? 0 : 16 * sin((u - 0.5) * 2 * .pi)
  }

  /// Co giãn theo bước: dài khi bay, lùn khi khuỵu.
  public static func squash(_ phase: Double) -> Double { bob(unit(phase)) * 0.006 }

  /// Một bàn chân theo phần `q` của cả hai bước: một phần tư đầu đứng đất, còn lại vung tới.
  static func foot(_ q: Double, turn: Double) -> KoaWalk.Foot {
    var f = KoaWalk.Foot()
    var along: Double
    if q < 0.25 {
      along = stride * (1 - 2 * q / 0.25)
    } else {
      let s = (q - 0.25) / 0.75
      along = -stride + 2 * stride * KoaPull.ease(s)
      f.lift = knee * sin(s * .pi)
      f.tilt = -18 * sin(s * .pi) * turn
    }
    f.x = along * turn
    along *= 1 - abs(turn)
    f.y = along * 0.35
    return f
  }

  public static func pose(phase: Double, turn: Double) -> KoaWalk.Pose {
    let u = unit(phase), cycle = phase / 2
    let left = cycle - floor(cycle), right = left + 0.5 - (left >= 0.5 ? 1 : 0)
    var p = KoaWalk.Pose()
    p.left = foot(left, turn: turn)
    p.right = foot(right, turn: turn)
    p.leftNear = left < 0.5
    p.bob = bob(u)
    p.lean = 8 * turn
    p.sway = 3 * sin(phase * .pi)
    p.armLeft = 34 * cos(left * 2 * .pi)
    p.armRight = -34 * cos(right * 2 * .pi)
    p.turn = turn
    p.weight = 1
    // đầu và tai đi sau thân: đỉnh của chúng rơi sau đỉnh nhún
    p.headLag = 3 * sin((u - 0.2) * 2 * .pi)
    p.earLag = 12 * sin((u - 0.35) * 2 * .pi)
    return p
  }

  /// Khuỵu lấy đà: tai vểnh, tay vung ra sau.
  public static func crouch(_ c: Double) -> KoaWalk.Pose {
    var p = KoaWalk.Pose()
    p.bob = -8 * c
    p.armLeft = 24 * c
    p.armRight = -24 * c
    p.earLeft = -7 * c
    p.earRight = -7 * c
    p.weight = c
    return p
  }

  /// Giữa cú nhảy khỏi bục: chân co, tay vung lên rồi hạ xuống đón đất.
  public static func leap(_ p: Double, turn: Double) -> KoaWalk.Pose {
    var o = KoaWalk.Pose()
    let c = sin(p * .pi)
    o.left.lift = 16 * c
    o.right.lift = 10 * c
    o.left.x = 8 * turn
    o.right.x = -8 * turn
    o.armLeft = -40 * c
    o.armRight = 40 * c
    o.lean = 6 * turn
    o.turn = turn * KoaPull.ease(p * 2)
    o.earLag = 10 * sin((p - 0.15) * 2 * .pi)
    o.weight = 1
    return o
  }
}
