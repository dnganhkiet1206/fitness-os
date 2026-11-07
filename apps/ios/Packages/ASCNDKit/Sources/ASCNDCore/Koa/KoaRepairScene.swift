import Foundation

/// Đoạn diễn Koa sửa đồ (storyboard động Kiệt duyệt 06–07/11), chép từ kịch bản storyboard
/// (`scratchpad/anim/animc.py` …): mỗi thời điểm cho ra Koa (chỗ đứng, tư thế, nét mặt, ánh mắt,
/// khẩu hình), đồ cầm tay, trạng thái món đang sửa, góc máy, lời thoại và tiếng.
///
/// Toạ độ: storyboard đo trên ảnh chụp phòng 1260 × 2736 px (iPhone Air, @3x). Quy về toạ độ phòng
/// (`StudioScene`, ngang 390) lấy mốc là bục: ảnh (616, 2010) ↔ phòng (195, 412), 3,2308 px ↔ 1 đơn vị;
/// Koa rộng 614 px trên bục ↔ tỉ lệ 1.
public enum KoaRepairScene {
  // MARK: - Hàm chuyển động (giống hệt storyboard)

  public static func clamp(_ x: Double, _ a: Double = 0, _ b: Double = 1) -> Double { max(a, min(b, x)) }
  public static func lerp(_ a: Double, _ b: Double, _ u: Double) -> Double { a + (b - a) * u }
  public static func ease(_ u: Double) -> Double { let u = clamp(u); return u * u * (3 - 2 * u) }
  public static func eout(_ u: Double) -> Double { let u = clamp(u); return 1 - pow(1 - u, 3) }
  public static func backOut(_ u: Double, _ s: Double = 1.7) -> Double { let u = clamp(u) - 1; return u * u * ((s + 1) * u + s) + 1 }
  public static func seg(_ t: Double, _ a: Double, _ b: Double) -> Double { clamp((t - a) / (b - a)) }
  /// Dao động tắt dần sau mốc `t0` (vượt đà rồi lắng).
  public static func settle(_ t: Double, _ t0: Double, _ amp: Double, _ f: Double = 2.6, _ k: Double = 7) -> Double {
    let u = t - t0
    return u < 0 ? 0 : amp * exp(-k * u) * cos(2 * .pi * f * u)
  }
  public enum Phase: Sendable { case idle, crouch, air, land }
  /// Nhảy: (độ cao, nén dọc, pha) — khuỵu lấy đà, bay (giãn), tiếp đất (nén) rồi lắng.
  public static func hop(_ t: Double, _ t0: Double, _ crouch: Double = 0.12, _ air: Double = 0.42, _ h: Double = 120)
    -> (lift: Double, squash: Double, phase: Phase)
  {
    if t < t0 { return (0, 1, .idle) }
    var u = t - t0
    if u < crouch { return (0, 1 - 0.10 * sin(.pi / 2 * u / crouch), .crouch) }
    u -= crouch
    if u < air { let p = u / air; return (h * 4 * p * (1 - p), 1 + 0.08 * sin(.pi * p) * (1 - p), .air) }
    u -= air
    return (0, 1 - 0.12 * exp(-9 * u) * cos(2 * .pi * 2.4 * u), .land)
  }

  // MARK: - Toạ độ

  public static let pxPerUnit = 1260.0 / 390 * KoaParallax.overscan   // px ảnh ↔ 1 đơn vị phòng (đã gồm phép phóng)
  /// Ảnh chụp app (iPhone Air @3x, ngang 420 điểm): phòng hạ xuống `drop` = 912 × 0,75 − 436k.
  static let k = 420.0 / 390, drop = 912 * 0.75 - 436 * (420.0 / 390)
  /// Phòng đứng yên vẫn phóng sẵn `overscan` quanh (195, `anchorY`) — ảnh chụp đã gồm phép phóng ấy, nên quy
  /// đổi phải gỡ nó ra; lớp diễn vẽ lại với đúng phép phóng (`KoaRepairLayer`).
  public static let zoom = KoaParallax.overscan
  public static let anchor = (x: 195.0, y: KoaParallax.anchorY)
  /// Ảnh chụp lệch phòng thật ~2 đơn vị (đo tâm khung bảng trên máy ảo 07/11: ảnh → (323, 278), phòng (321, 277)).
  static let nudge = (x: -2.0, y: -1.2)
  public static func roomX(_ px: Double) -> Double { anchor.x + (px / 3 / k - anchor.x) / zoom + nudge.x }
  public static func roomY(_ py: Double) -> Double { anchor.y + ((py / 3 - drop) / k - anchor.y) / zoom + nudge.y }
  /// Phòng → màn đứng yên (đơn vị phòng chưa phóng): áp lại phép phóng sẵn.
  public static func shown(_ x: Double, _ y: Double) -> (x: Double, y: Double) { (anchor.x + zoom * (x - anchor.x), anchor.y + zoom * (y - anchor.y)) }
  /// Koa của storyboard lệch Koa của phòng một chút (vẽ tay cho khớp ảnh): bù khi Koa đứng trên bục
  /// (không có chỗ chạm nào ở đó) để vào / ra cảnh không giật; trên sàn dùng đúng toạ độ đo.
  static let koaShift = (x: 195 - roomX(616), y: 412 - (roomY(2010) - 6))
  /// Ảnh px → phòng (dùng cho đồ vật vẽ thêm).
  public static func room(_ px: Double, _ py: Double) -> (x: Double, y: Double) { (roomX(px), roomY(py)) }
  /// Koa trên bục rộng 614 px; trên sàn sát tường 426 px.
  public static let stagePx = (x: 616.0, feet: 2010.0, w: 614.0)
  public static let floorPx = (feet: 1868.0, w: 426.0)

  // MARK: - Lời nói

  public struct Line: Sendable, Hashable {
    public let text: String
    public let start: Double
    /// Lịch âm tiết (bắt đầu, kết thúc).
    public let syllables: [ClosedRange<Double>]
    public var duration: Double { (syllables.last?.upperBound ?? start) - start }

    public init(_ text: String, at start: Double, rate: Double = 0.15) {
      self.text = text
      self.start = start
      var s: [ClosedRange<Double>] = []
      var t = start
      for w in text.split(separator: " ") {
        s.append(t...(t + rate * 0.72))
        t += rate
        if let c = w.last, ",.!?…".contains(c) { t += 0.22 }
      }
      syllables = s
    }

    /// Khẩu hình: miệng mấp máy trong mỗi âm tiết.
    public func mouth(at t: Double) -> KoaFlags.Expression? {
      for (i, r) in syllables.enumerated() where r.contains(t) {
        return [.say2, .say1, .say3, .say1][(i + Int((t - r.lowerBound) / 0.05)) % 4]
      }
      return nil
    }

    /// Chữ hiện dần theo lời.
    public func typed(at t: Double) -> String {
      let n = Int(Double(text.count) * KoaRepairScene.clamp((t - start) / max(duration, 0.01)))
      return String(text.prefix(n))
    }
  }

  // MARK: - Khung

  public struct Bubble: Sendable, Hashable {
    public var text: String
    /// Góc trên-trái và bề ngang của bóng (toạ độ phòng).
    public var x: Double, y: Double, width: Double
    public var alpha: Double
  }

  public struct Camera: Sendable, Hashable {
    public var zoom = 1.0
    /// Tâm khung (toạ độ phòng).
    public var x = 195.0, y = 423.0
    public var roll = 0.0
    /// Rung (đơn vị phòng).
    public var shake = 0.0
  }

  /// Món đồ Koa đang cầm.
  public enum Prop: Sendable, Hashable {
    case plug
    case hammer(angle: Double)
    case glue(angle: Double, scale: Double)
  }

  public struct Shot: Sendable {
    /// Chân Koa (toạ độ phòng) và tỉ lệ so với Koa trên bục.
    public var x = 195.0, feet = 412.0, scale = 1.0
    public var stretchX = 1.0, stretchY = 1.0
    public var pose = KoaWalk.Pose()
    public var expression: KoaFlags.Expression = .happy
    public var from: KoaFlags.Expression?
    public var mix = 1.0
    public var mouth: KoaFlags.Expression?
    public var gaze: KoaMath.Gaze?
    public var gesture: KoaGesture?
    public var gestureAmount = 1.0
    public var blink: Double?
    public var prop: Prop?
    public var bubble: Bubble?
    public var camera = Camera()
    /// Trạng thái món đang sửa (mỗi món một kiểu).
    public var board = BoardState()
    /// Chữ hiệu ứng ("cộc!", "tách!"), toạ độ phòng.
    public var pops: [Pop] = []
    /// Đã xong phần sửa: món lành lại (app bỏ hình hỏng).
    public var repaired = false
  }

  public struct Pop: Sendable, Hashable {
    public var text: String
    public var x: Double, y: Double, u: Double, size: Double
  }

  public struct Cue: Sendable, Hashable {
    public let t: Double
    public let name: String
    public let volume: Double
  }

  /// Đổi nét mặt mượt trong 0,2 giây (`KoaRender.Options.faceFrom` / `faceMix`).
  static func face(_ s: inout Shot, _ t: Double, _ changes: [(Double, KoaFlags.Expression)]) {
    var prev = changes[0].1
    s.expression = prev
    s.from = nil
    s.mix = 1
    for (t0, e) in changes.dropFirst() where t >= t0 {
      let u = seg(t, t0, t0 + 0.2)
      s.expression = e
      if u < 1 { s.from = prev; s.mix = ease(u) } else { s.from = nil; s.mix = 1 }
      prev = e
    }
  }

  static func blink(_ t: Double, _ times: [Double]) -> Double? {
    for b in times where 0 <= t - b && t - b < 0.16 { return sin(.pi * (t - b) / 0.16) }
    return nil
  }

  /// Chuyển động phụ (tai, đầu có quán tính) — chạy một lượt trên cả cảnh, như storyboard.
  static func secondary(_ shots: inout [Shot], fps: Double) {
    var ear = 0.0, earv = 0.0, head = 0.0, headv = 0.0
    let dt = 1 / fps
    let ys = shots.map { $0.feet }, xs = shots.map { $0.x }
    for i in shots.indices {
      var ay = 0.0, ax = 0.0
      if i > 0, i < shots.count - 1 {
        ay = max(-6000, min(6000, (ys[i + 1] - 2 * ys[i] + ys[i - 1]) * pxPerUnit / dt / dt))
        ax = max(-6000, min(6000, (xs[i + 1] - 2 * xs[i] + xs[i - 1]) * pxPerUnit / dt / dt))
      }
      earv += (-90 * ear - 9 * earv + ay * 0.004) * dt; ear += earv * dt
      headv += (-120 * head - 12 * headv - ax * 0.0012) * dt; head += headv * dt
      shots[i].pose.earLag += max(-14, min(14, ear))
      shots[i].pose.headLag += max(-5, min(5, head))
      shots[i].pose.sway += 0.8 * sin(Double(i) * dt * 1.7)
    }
  }
}

// MARK: - Bảng kỷ lục tắt màn (storyboard C, Kiệt duyệt 07/11)

extension KoaRepairScene {
  public struct BoardState: Sendable, Hashable {
    /// Độ tối màn 0…1.
    public var dark = 0.0
    /// Sọc nhiễu (hạt giống thay theo khung).
    public var noise: Int?
    /// Vệt quét khởi động 0…1.
    public var scan: Double?
    /// Số đang đếm lên (che số gốc).
    public var count: Int?
    /// Viền bừng sáng 0…1.
    public var glow = 0.0
    /// Phích đang cắm trong ổ.
    public var plugged = true
    /// Tia lửa ở ổ cắm 0…1.
    public var spark = 0.0
  }

  /// Bảng: mốc thời gian của storyboard (giây). Đoạn trong app bắt đầu ở `start`.
  public enum Board {
    static let T: [String: Double] = [
      "tap": 5.6, "yay": 6.0, "down": 6.8, "k1": 7.6, "lit1": 8.0, "off1": 8.35, "k2": 9.0, "lit2": 9.55, "off2": 9.7,
      "mad": 9.8, "idea": 10.6, "go": 11.1, "pull": 11.7, "pop": 12.3, "wait": 12.7, "plug": 13.3, "click": 13.6,
      "boot": 13.8, "count": 14.3, "full": 15.0, "cheer": 15.1, "back": 15.9, "thanks": 16.7, "end": 19.8,
    ]
    static func T(_ k: String) -> Double { T[k]! }
    /// Đoạn trong app bắt đầu lúc Koa nhảy mừng (phần nhờ đã ở thẻ "Koa nhờ").
    public static let start = 172.0 / 30
    public static var duration: Double { T("end") - start }

    /// Màn bảng trong ảnh phòng (px) — app quy về toạ độ phòng.
    public static let screenPx = (x: 912.0, y: 1432.0, w: 338.0, h: 208.0)
    public static let numberPx = (x: 978.0, y: 1516.0, w: 92.0, h: 62.0)
    /// Koa đứng gõ (tay khi gõ cách tâm +132 px → chạm mép trái bảng, đo) / rút phích.
    static let kx = 786.0, px = 640.0
    public static let socketPx = (x: 714.0, y: 1766.0)
    public static let cableTopPx = (x: 936.0, y: 1644.0)

    static let yay = Line("Để tớ xem!", at: T("yay") + 0.3)
    static let wait = Line("Tắt đi… bật lại…", at: T("wait") + 0.1, rate: 0.16)
    static let thanks = Line("Sáng lại rồi! Cảm ơn cậu nha!", at: T("thanks"), rate: 0.14)

    public static let hits = [T("k1"), T("k1") + 0.25, T("k2"), T("k2") + 0.2, T("k2") + 0.4]

    /// Tiếng (giây tính từ đầu đoạn trong app).
    public static var cues: [Cue] {
      var c: [(Double, String, Double)] = []
      for l in [yay, wait, thanks] {
        for (i, r) in l.syllables.enumerated() { c.append((r.lowerBound, "koa-talk-\((i * 7 + l.text.count) % 10 + 1)", 0.55)) }
      }
      c += [(T("tap") + 0.45, "koa-coin", 0.6), (T("yay"), "koa-v-yay", 0.7),
            (T("down") + 0.1, "koa-hop", 0.6), (T("down") + 0.62, "koa-land", 0.6)]
      for h in hits.prefix(2) { c.append((h, "koa-tick", 0.8)) }
      c += [(T("lit1"), "koa-buzz", 0.5), (T("off1"), "koa-click", 0.5), (T("off1") + 0.15, "koa-v-hm", 0.6)]
      for h in hits.suffix(3) { c.append((h, "koa-tick", 1.0)) }
      c += [(T("lit2"), "koa-buzz", 0.4), (T("off2"), "koa-click", 0.5), (T("mad"), "koa-v-nonono", 0.7),
            (T("idea"), "koa-coin", 0.6), (T("idea") + 0.1, "koa-v-ui", 0.7),
            (T("go") + 0.1, "koa-step-wood-1", 0.5), (T("go") + 0.35, "koa-step-wood-1", 0.5),
            (T("pull"), "koa-v-mmm", 0.4), (T("pull") + 0.2, "koa-creak", 0.4), (T("pull") + 0.4, "koa-creak", 0.4),
            (T("pop"), "koa-click", 1.0), (T("pop") + 0.02, "koa-buzz", 0.6), (T("pop") + 0.05, "koa-v-oi", 0.8),
            (T("pop") + 0.35, "koa-land", 0.5), (T("plug"), "koa-step-wood-1", 0.5), (T("click"), "koa-click", 0.9),
            (T("boot"), "koa-buzz", 0.5)]
      for k in 0..<10 { c.append((T("count") + Double(k) * 0.07, "koa-tick", 0.35)) }
      c += [(T("full"), "koa-coin", 0.8), (T("cheer"), "koa-v-yay", 0.8), (T("cheer") + 0.05, "koa-cheer", 0.6),
            (T("back") + 0.1, "koa-hop", 0.6), (T("back") + 0.62, "koa-land", 0.6)]
      return c.filter { $0.0 >= start }.map { Cue(t: $0.0 - start, name: $0.1, volume: $0.2) }.sorted { $0.t < $1.t }
    }

    /// Cả đoạn, mỗi khung 1/30 giây (có chuyển động phụ).
    public static func shots(fps: Double = 30) -> [Shot] {
      var out = (0..<Int(duration * fps)).map { shot(at: Double($0) / fps) }
      secondary(&out, fps: fps)
      return out
    }

    /// Một khung, `t` tính từ đầu đoạn trong app.
    public static func shot(at time: Double) -> Shot {
      let t = time + start
      var s = Shot()
      var px = stagePx.x, feet = stagePx.feet, w = stagePx.w, lift = 0.0
      var exprs: [(Double, KoaFlags.Expression)] = [(0, .happy)]
      var p = KoaWalk.Pose()
      p.weight = 1
      s.blink = blink(t, [T("k1") - 0.3, T("wait") + 0.9, T("thanks") + 1.5])
      if t < T("down") {                                  // trên bục: mừng, "Để tớ xem!"
        exprs = [(0, .delighted), (T("yay") + 0.3, .happy)]
        s.gaze = .init(x: 0, y: 0.1, k: 1)
        let h = hop(t, T("tap") + 0.45, 0.07, 0.28, 50)
        lift = h.lift; s.stretchY = h.squash; s.stretchX = 2 - h.squash
        s.mouth = yay.mouth(at: t)
        let a = ease(seg(t, T("yay") + 0.25, T("yay") + 0.45)) * (1 - seg(t, T("down") - 0.1, T("down") + 0.1))
        if a > 0 { s.bubble = Bubble(text: yay.typed(at: t), x: roomX(330), y: roomY(1090), width: 380 / pxPerUnit, alpha: a) }
      } else if t < T("go") {                             // xuống sàn, gõ bảng
        if t < T("k1") - 0.2 {
          let h = hop(t, T("down"), 0.12, 0.5, 0)
          let u = seg(t, T("down") + 0.12, T("down") + 0.62)
          px = lerp(stagePx.x, kx, ease(u)); w = lerp(stagePx.w, floorPx.w, ease(u))
          feet = lerp(stagePx.feet, floorPx.feet, ease(u)) - (h.phase == .air ? 150 * 4 * u * (1 - u) : 0)
          s.stretchY = h.squash; s.stretchX = 2 - h.squash
          p.armRight = -60 * sin(.pi * u); p.armLeft = 60 * sin(.pi * u)
          exprs = [(0, .happy)]
        } else {
          px = kx; feet = floorPx.feet; w = floorPx.w
          s.gaze = .init(x: 0.5, y: -0.8, k: 1)
          exprs = [(0, .focus), (T("lit1"), .delighted), (T("off1") + 0.05, .sheepish), (T("k2") - 0.25, .focus),
                   (T("lit2"), .surprised), (T("off2") + 0.05, .oof), (T("mad") + 0.5, .oops)]
          let strong = t >= T("k2") - 0.3
          let set = strong ? Array(hits.suffix(3)) : Array(hits.prefix(2))
          var arm = -95.0, knock: Double?
          for h in set {
            if h - 0.09 <= t, t < h { arm = lerp(-95, strong ? -55 : -70, ease(seg(t, h - 0.09, h))) }
            if h <= t, t < h + 0.12 { arm = -118 - (strong ? 12 : 0) + 18 * seg(t, h, h + 0.12); knock = h }
          }
          p.armRight = arm; p.armLeft = -8; p.turn = 0.3; p.lean = (strong ? 6 : 2) * (knock == nil ? 0 : 1)
          if let k = knock {
            let pawPx = (x: kx + 132, y: 1593.0)
            s.pops.append(Pop(text: k >= T("k2") ? "CỘC!" : "cộc", x: roomX(pawPx.x + 30), y: roomY(pawPx.y - 40),
                              u: seg(t, k, k + 0.25), size: (k >= T("k2") ? 52 : 40) / pxPerUnit))
          }
          if t >= T("mad") {                              // cáu: dậm chân, lắc đầu
            let u = seg(t, T("mad"), T("idea")), w3 = sin(u * 2 * .pi * 3)
            p.armRight = 40; p.armLeft = -40; p.headLag = 4 * w3 * (1 - u)
            p.left.lift = 10 * max(0, w3); p.right.lift = 10 * max(0, -w3)
            s.stretchY = 1 - 0.04 * abs(w3)
            s.gaze = .init(x: 0, y: 0.2, k: 1)
          }
          if t >= T("idea") {                             // nảy ý: nhìn theo dây xuống ổ cắm
            exprs = [(0, .surprised), (T("idea") + 0.3, .grin)]
            s.gaze = .init(x: -0.4, y: 0.9 * ease(seg(t, T("idea"), T("idea") + 0.4)), k: 1)
            s.gesture = .curious; s.gestureAmount = ease(seg(t, T("idea"), T("idea") + 0.2))
            p.armRight = -30; p.armLeft = 0; p.turn = 0
          }
        }
      } else if t < T("boot") {                           // rút phích → tắt đi bật lại → cắm lại
        feet = floorPx.feet; w = floorPx.w
        if t < T("pull") {
          let u = seg(t, T("go"), T("go") + 0.5)
          px = lerp(kx, Self.px, ease(u)); lift = 10 * abs(sin(u * .pi * 2))
          exprs = [(0, .grin)]
          p.turn = -0.3; p.lean = 10 * seg(t, T("go") + 0.4, T("pull")); p.armRight = 20 * seg(t, T("go") + 0.4, T("pull"))
          s.gaze = .init(x: 0.2, y: 0.9, k: 1)
        } else if t < T("pop") {
          px = Self.px
          exprs = [(0, .focus)]
          let g = (t - T("pull")) / 0.2, w2 = pow(sin(g * .pi), 2)
          p.lean = 10 - 16 * w2; p.armRight = 25; p.armLeft = 20; p.earLag = 4 * w2
          s.stretchX = 1 + 0.03 * w2; s.stretchY = 1 - 0.03 * w2
          s.gaze = .init(x: 0.2, y: 0.9, k: 1)
        } else if t < T("wait") {
          let u = seg(t, T("pop"), T("pop") + 0.4)
          exprs = [(0, .yikes)]
          lift = hop(t, T("pop"), 0, 0.3, 40).lift
          px = Self.px - 70 * eout(u)
          p.lean = -14 * (1 - u); p.armRight = -60; p.armLeft = 70; p.earLag = settle(t, T("pop"), 14, 3, 5)
          s.prop = .plug
        } else if t < T("plug") {
          px = Self.px - 70
          exprs = [(0, .tease)]
          p.armRight = -40; p.bob = 1.5 * sin(t * 6)
          s.gaze = .init(x: 0.3, y: -0.2, k: 1)
          s.mouth = wait.mouth(at: t); s.prop = .plug
          let a = ease(seg(t, T("wait"), T("wait") + 0.2)) * (1 - seg(t, T("plug") - 0.1, T("plug")))
          s.bubble = Bubble(text: wait.typed(at: t), x: roomX(430), y: roomY(1330), width: 430 / pxPerUnit, alpha: a)
        } else {
          let u = seg(t, T("plug"), T("plug") + 0.3)
          px = lerp(Self.px - 70, Self.px, ease(u))
          exprs = [(0, .focus)]
          p.lean = 10 * ease(seg(t, T("click") - 0.15, T("click"))); p.armRight = lerp(-40, 30, ease(u))
          s.gaze = .init(x: 0.2, y: 0.9, k: 1)
          if t < T("click") { s.prop = .plug }
        }
      } else if t < T("back") {                           // bảng khởi động: ngó lên, mừng, nhảy cẫng
        px = Self.px; feet = floorPx.feet; w = floorPx.w
        exprs = [(0, .surprised), (T("count") + 0.2, .delighted)]
        s.gaze = .init(x: 0.6, y: -0.8, k: 1)
        p.turn = 0.3
        if t >= T("cheer") {
          let h = hop(t, T("cheer"), 0.06, 0.34, 70)
          lift = h.lift; s.stretchY = h.squash; s.stretchX = 2 - h.squash
          p.armRight = -150; p.armLeft = 150
        }
      } else {                                            // về bục, cảm ơn
        exprs = [(0, .happy), (T("thanks"), .delighted), (T("end") - 0.5, .happy)]   // trả lại mặt của phòng
        if t < T("thanks") {
          let h = hop(t, T("back"), 0.12, 0.5, 0)
          let u = seg(t, T("back") + 0.12, T("back") + 0.62)
          px = lerp(Self.px, stagePx.x, ease(u)); w = lerp(floorPx.w, stagePx.w, ease(u))
          feet = lerp(floorPx.feet, stagePx.feet, ease(u)) - (h.phase == .air ? 130 * 4 * u * (1 - u) : 0)
          s.stretchY = h.squash; s.stretchX = 2 - h.squash
          p.armRight = -150 * sin(.pi * u); p.armLeft = 150 * sin(.pi * u)
        } else {
          let out = 1 - ease(seg(t, T("end") - 0.6, T("end") - 0.1))   // hạ tay, tắt bóng thoại trước khi trả phòng
          s.gesture = .taDa; s.gestureAmount = backOut(seg(t, T("thanks") + 0.1, T("thanks") + 0.4)) * out
          s.gaze = .init(x: 0, y: 0.1, k: 1)
          s.mouth = thanks.mouth(at: t)
          s.bubble = Bubble(text: thanks.typed(at: t), x: roomX(330), y: roomY(1020), width: 700 / pxPerUnit,
                            alpha: ease(seg(t, T("thanks") - 0.05, T("thanks") + 0.2)) * out)
        }
      }
      face(&s, t, exprs)
      s.pose = p
      let onStage = clamp((w - floorPx.w) / (stagePx.w - floorPx.w))
      s.x = roomX(px) + koaShift.x * onStage
      s.feet = roomY(feet - lift) - 6 + koaShift.y * onStage   // hero vẽ chân thấp hơn `y` 6 đơn vị
      s.scale = w / stagePx.w
      s.board = boardState(t)
      s.camera = camera(t)
      s.repaired = t >= T("full")
      if T("click") <= t, t < T("click") + 0.3 {
        s.pops.append(Pop(text: "tách!", x: roomX(socketPx.x + 40), y: roomY(socketPx.y - 50), u: seg(t, T("click"), T("click") + 0.3), size: 40 / pxPerUnit))
      }
      return s
    }

    static func boardState(_ t: Double) -> BoardState {
      var b = BoardState()
      b.plugged = !(T("pop") <= t && t < T("click"))
      b.spark = T("pop") <= t && t < T("pop") + 0.35 ? 1 - seg(t, T("pop"), T("pop") + 0.35) : 0
      if T("lit1") <= t, t < T("off1") {
        b.dark = sin(t * 60) > -0.3 ? 0.2 : 0.7; b.noise = Int(t * 30)
      } else if T("lit2") <= t, t < T("off2") {
        b.dark = 0.45; b.noise = Int(t * 30)
      } else if t < T("boot") {
        b.dark = 1
      } else if t < T("count") {
        b.dark = 1; b.scan = seg(t, T("boot"), T("count"))
      } else if t < T("full") {
        b.count = Int(10 * ease(seg(t, T("count"), T("full") - 0.1)))
      }
      if T("full") <= t, t < T("full") + 1.2 { b.glow = 1 - seg(t, T("full"), T("full") + 1.2) }
      return b
    }

    /// Góc máy — mỗi góc một lý do (xem storyboard).
    static let cam: [(Double, Double, Double, Double)] = [
      (5.6, 1.0, 630, 1368),
      (6.8, 1.0, 630, 1368),
      (7.4, 1.5, 900, 1580),    // Koa + bảng trong một khung: thấy gõ và bảng phản ứng
      (9.0, 1.5, 900, 1580),
      (9.5, 1.62, 900, 1600),   // gõ mạnh: đẩy sát hơn
      (10.5, 1.62, 860, 1640),
      (11.0, 1.75, 700, 1680),  // lần theo dây xuống ổ cắm
      (13.65, 1.75, 680, 1680), // cận ổ cắm: rút / cắm phích
      (13.85, 1.8, 1080, 1540), // CẮT sang bảng: khởi động, số đếm lên
      (15.0, 1.8, 1080, 1540),
      (15.3, 1.35, 840, 1560),  // lùi ra: Koa nhảy mừng dưới bảng sáng
      (15.9, 1.35, 840, 1560),
      (16.5, 1.0, 630, 1368),   // toàn cảnh khi Koa về bục
      (17.0, 1.22, 616, 1600),  // đẩy nhẹ vào Koa cảm ơn
      (19.2, 1.22, 616, 1600),
      (19.8, 1.0, 630, 1368),   // lùi êm về toàn cảnh rồi trả phòng (không giật khi hết cảnh)
    ]

    static func camera(_ t: Double) -> Camera {
      var k = 0
      while k + 1 < cam.count, cam[k + 1].0 <= t { k += 1 }
      let a = cam[k], b = cam[min(k + 1, cam.count - 1)]
      let u = b.0 == a.0 ? 0 : (t - a.0) / (b.0 - a.0)
      let e = b.0 == 13.85 ? eout(u) : ease(u)
      var c = Camera()
      c.zoom = lerp(a.1, b.1, e)
      // tâm khung: ảnh (630, 1368) là giữa màn; quy về phòng
      c.x = roomX(lerp(a.2, b.2, e)); c.y = roomY(lerp(a.3, b.3, e))
      c.roll = -3.5 * sin(.pi * seg(t, T("mad"), T("idea")))
      var sh = hits.reduce(0.0) { $0 + settle(t, $1, 5 + ($1 >= T("k2") ? 4 : 0), 10, 14) }
      sh += settle(t, T("pop"), 10, 9, 9) + settle(t, T("full"), 6, 8, 9) + settle(t, T("down") + 0.62, 5, 9, 12)
        + settle(t, T("back") + 0.62, 5, 9, 12)
      c.shake = sh / pxPerUnit
      return c
    }
  }
}
