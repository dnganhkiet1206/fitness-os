public import Foundation

/// Ánh nhìn của Koa trong phòng (29/10, phần 2): mắt tới đích trước, đầu theo sau (lò xo
/// chậm hơn); trong lúc nhìn có những cú liếc nhỏ (saccade), thỉnh thoảng liếc sang chỗ
/// khác rồi về, chớp mắt vào lúc không đều (và chớp khi đổi đích nhìn lớn — như người).
///
/// Đích nhìn ở toạ độ MÀN của phòng (390), trừ `.user` (nhìn thẳng ra người xem). Đầu ra
/// là hai `KoaMath.Gaze` (mắt, đầu) và độ khép mi 0…1 cho `KoaRender`.
public enum KoaGaze {
  public enum Target: Sendable, Hashable {
    case user
    case point(x: Double, y: Double)
    /// Không nhìn gì cụ thể — theo hướng mặt.
    case ahead
  }

  public struct Output: Sendable, Hashable {
    public var eyes: KoaMath.Gaze
    public var head: KoaMath.Gaze
    public var blink: Double
  }

  /// Bộ sinh số ngẫu nhiên có hạt — test lặp lại được.
  public struct Random: Sendable {
    var state: UInt64
    public init(seed: UInt64) { state = seed &+ 0x9E37_79B9_7F4A_7C15 }
    public mutating func next() -> Double {
      state = state &* 6_364_136_223_846_793_005 &+ 1_442_695_040_888_963_407
      return Double((state >> 11) & ((1 << 53) - 1)) / Double(1 << 53)
    }
    public mutating func range(_ a: Double, _ b: Double) -> Double { a + (b - a) * next() }
  }

  public struct State: Sendable {
    public var target: Target = .user
    var eyeX = 0.0, eyeY = 0.0
    var headX = 0.0, headY = 0.0, headVX = 0.0, headVY = 0.0
    var saccade = (x: 0.0, y: 0.0)
    var nextSaccade = 0.8
    var glance: (x: Double, y: Double, left: Double)?
    var nextGlance = 4.0
    var nextBlink = 2.5
    var blinkT: Double?
    var rng: Random
    /// Đầu theo chậm hơn mắt bao nhiêu (rad/giây của lò xo).
    public var headRate = 6.0

    public init(seed: UInt64 = 1) { rng = Random(seed: seed) }

    /// Đổi đích nhìn. Đổi xa thì chớp mắt (mắt người hay chớp khi quay nhìn chỗ khác).
    public mutating func look(_ t: Target, from koa: (x: Double, y: Double), turn: Double) {
      let before = aim(target, koa, turn: turn)
      target = t
      let after = aim(t, koa, turn: turn)
      if hypot(after.x - before.x, after.y - before.y) > 0.7, blinkT == nil { blinkT = 0 }
      nextSaccade = rng.range(0.4, 0.9)
    }

    /// Một lần liếc nhìn chỗ khác rồi về (liếc người xem, liếc lại phía sau…).
    public mutating func glance(at t: Target, koa: (x: Double, y: Double), turn: Double, for seconds: Double) {
      let a = aim(t, koa, turn: turn)
      glance = (a.x, a.y, seconds)
    }

    /// Đích nhìn → (x, y) trong −1…1 so với đầu Koa (đầu ở ~150 đơn vị trên chân).
    func aim(_ t: Target, _ koa: (x: Double, y: Double), turn: Double) -> (x: Double, y: Double) {
      switch t {
      case .user: return (0, 0.15)
      case .ahead: return (turn * 0.8, 0.1)
      case .point(let px, let py):
        let hx = koa.x, hy = koa.y - 140
        let dx = (px - hx) / 90, dy = (py - hy) / 110
        return (max(-1, min(1, dx)), max(-0.8, min(1, dy)))
      }
    }

    public mutating func step(_ dt: Double, koa: (x: Double, y: Double), turn: Double) -> Output {
      var want = aim(target, koa, turn: turn)
      if var g = glance {
        g.left -= dt
        want = (g.x, g.y)
        glance = g.left > 0 ? g : nil
      }
      // saccade: điểm nhìn nhảy nhẹ quanh đích, lúc không đều
      nextSaccade -= dt
      if nextSaccade <= 0 {
        saccade = (rng.range(-0.12, 0.12), rng.range(-0.08, 0.08))
        nextSaccade = rng.range(0.35, 1.6)
      }
      // tự liếc: thỉnh thoảng nhìn đi chỗ khác một chút
      nextGlance -= dt
      if nextGlance <= 0, glance == nil {
        glance = (rng.range(-0.8, 0.8), rng.range(-0.2, 0.5), rng.range(0.4, 0.9))
        nextGlance = rng.range(4, 11)
      }
      // mắt: gần như tức thì (nhanh, theo saccade); đầu: lò xo chậm, chỉ theo đích chính
      let ex = want.x + saccade.x, ey = want.y + saccade.y
      let k = min(1, 28 * dt)
      eyeX += (ex - eyeX) * k
      eyeY += (ey - eyeY) * k
      let w = headRate
      headVX += (w * w * (want.x - headX) - 2 * w * headVX) * dt
      headVY += (w * w * (want.y - headY) - 2 * w * headVY) * dt
      headX += headVX * dt
      headY += headVY * dt
      // chớp mắt: 2–7 giây, đôi khi chớp đôi
      var lid = 0.0
      if let b = blinkT {
        let t = b + dt
        // khép 0,07 s, mở 0,09 s
        lid = t < 0.07 ? t / 0.07 : max(0, 1 - (t - 0.07) / 0.09)
        blinkT = t > 0.16 ? nil : t
      } else {
        nextBlink -= dt
        if nextBlink <= 0 {
          blinkT = 0
          nextBlink = rng.next() < 0.18 ? 0.28 : rng.range(2, 7)
        }
      }
      // mắt chạy trước đầu: phần lệch giữa mắt và đầu là chỗ mắt nhìn trong hốc
      return Output(
        eyes: KoaMath.Gaze(x: max(-1, min(1, eyeX - headX * 0.4)), y: max(-1, min(1, eyeY - headY * 0.4)), k: 1),
        head: KoaMath.Gaze(x: max(-1, min(1, headX)), y: max(-1, min(1, headY)), k: 1),
        blink: lid)
    }
  }
}
