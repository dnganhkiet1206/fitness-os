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
    /// Lời tiếng Việt (nhịp âm tiết tính theo lời này) và khoá dịch app hiện trong bóng thoại.
    public let text: String
    public let key: String
    public let start: Double
    /// Lịch âm tiết (bắt đầu, kết thúc).
    public let syllables: [ClosedRange<Double>]
    public var duration: Double { (syllables.last?.upperBound ?? start) - start }

    public init(_ text: String, key: String, at start: Double, rate: Double = 0.15) {
      self.text = text
      self.key = key
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

    /// Phần lời đã nói 0…1 (chữ hiện dần theo lời, ở mọi ngôn ngữ).
    public func progress(at t: Double) -> Double { KoaRepairScene.clamp((t - start) / max(duration, 0.01)) }

    public func typed(at t: Double) -> String { String(text.prefix(Int(Double(text.count) * progress(at: t)))) }

    func bubble(at t: Double, x: Double, y: Double, width: Double, alpha: Double) -> Bubble {
      Bubble(text: typed(at: t), x: x, y: y, width: width, alpha: alpha, key: key, progress: progress(at: t))
    }
  }

  // MARK: - Khung

  public struct Bubble: Sendable, Hashable {
    public var text: String
    /// Góc trên-trái và bề ngang của bóng (toạ độ phòng).
    public var x: Double, y: Double, width: Double
    public var alpha: Double
    /// Khoá dịch của lời và phần đã hiện 0…1.
    public var key = ""
    public var progress = 1.0
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
    /// Búa: góc và cỡ trong hình 240 của Koa (đầu búa cách tay 128 × cỡ).
    case hammer(angle: Double, scale: Double)
    case glue(angle: Double, scale: Double)
  }

  public struct Shot: Sendable {
    /// Chân Koa (toạ độ phòng) và tỉ lệ so với Koa trên bục.
    public var x = 195.0, feet = 412.0, scale = 1.0
    public var stretchX = 1.0, stretchY = 1.0
    /// Koa đang nhảy cao bao nhiêu (đơn vị phòng) — bóng nằm lại trên sàn và nhỏ đi.
    public var lift = 0.0
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
    public var stage = StageState()
    public var floor = FloorState()
    public var neon = NeonState()
    /// Koa quay mặt sang trái (lật ngang quanh tâm), hay đang khuất khỏi phòng.
    public var flip = false, hidden = false
    public var puffs: [Puff] = []
    /// Chữ hiệu ứng ("cộc!", "tách!"), toạ độ phòng.
    public var pops: [Pop] = []
    /// Đã xong phần sửa: món lành lại (app bỏ hình hỏng).
    public var repaired = false
  }

  public struct Pop: Sendable, Hashable {
    /// Khoá dịch (`koa.repair.pop.*`).
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

    static let yay = Line("Để tớ xem!", key: "koa.repair.board.yay", at: T("yay") + 0.3)
    static let wait = Line("Tắt đi… bật lại…", key: "koa.repair.board.wait", at: T("wait") + 0.1, rate: 0.16)
    static let thanks = Line("Sáng lại rồi! Cảm ơn cậu nha!", key: "koa.repair.board.thanks", at: T("thanks"), rate: 0.14)

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
        if a > 0 { s.bubble = yay.bubble(at: t, x: roomX(330), y: roomY(1090), width: 380 / pxPerUnit, alpha: a) }
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
            s.pops.append(Pop(text: k >= T("k2") ? "koa.repair.pop.knockHard" : "koa.repair.pop.knock", x: roomX(pawPx.x + 30), y: roomY(pawPx.y - 40),
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
          s.bubble = wait.bubble(at: t, x: roomX(430), y: roomY(1330), width: 430 / pxPerUnit, alpha: a)
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
          s.bubble = thanks.bubble(at: t, x: roomX(330), y: roomY(1020), width: 700 / pxPerUnit,
                                   alpha: ease(seg(t, T("thanks") - 0.05, T("thanks") + 0.2)) * out)
        }
      }
      face(&s, t, exprs)
      s.pose = p
      let onStage = clamp((w - floorPx.w) / (stagePx.w - floorPx.w))
      s.x = roomX(px) + koaShift.x * onStage
      s.feet = roomY(feet - lift) - 6 + koaShift.y * onStage   // hero vẽ chân thấp hơn `y` 6 đơn vị
      s.lift = lift / pxPerUnit
      s.scale = w / stagePx.w
      s.board = boardState(t)
      s.camera = camera(t)
      s.repaired = t >= T("full")
      if T("click") <= t, t < T("click") + 0.3 {
        s.pops.append(Pop(text: "koa.repair.pop.click", x: roomX(socketPx.x + 40), y: roomY(socketPx.y - 50), u: seg(t, T("click"), T("click") + 0.3), size: 40 / pxPerUnit))
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

// MARK: - Sân khấu nứt (storyboard D, Kiệt duyệt 07/11)

extension KoaRepairScene {
  public struct Pt: Sendable, Hashable {
    public var x: Double, y: Double
    public init(_ x: Double, _ y: Double) { self.x = x; self.y = y }
  }

  /// Bụi nhỏ khi Koa đáp (toạ độ phòng).
  public struct Puff: Sendable, Hashable {
    public var x: Double, y: Double, u: Double, count: Int
  }

  public struct StageState: Sendable, Hashable {
    /// Phần vết nứt còn thấy 0…1 và độ đậm (mờ dần qua ba cú nén).
    public var crack = 1.0, crackAlpha = 1.0
    /// Dải keo đã bôi 0…1 và độ đậm.
    public var glue = 0.0, glueAlpha = 0.0
    /// Dòng keo từ miệng tuýp xuống vết nứt.
    public var stream: (from: Pt, to: Pt)? {
      get { streamFrom.map { ($0, streamTo ?? $0) } }
      set { streamFrom = newValue?.from; streamTo = newValue?.to }
    }
    var streamFrom: Pt?, streamTo: Pt?
    /// Đoạn vành đèn tắt (như lúc hỏng) — tắt dần khi đèn chạy.
    public var darkRim = 1.0
    /// Đèn chạy quanh vành: tiến độ 0…1 và độ đậm.
    public var lights: Double?
    public var lightsFade = 1.0
    /// Lấp lánh quanh vành (giây kể từ lúc bắt đầu).
    public var twinkle: Double?
    /// Tuýp keo bay khỏi khung (toạ độ phòng, góc độ).
    public var flyingTube: Pt?
    public var flyingAngle = 0.0
  }

  public enum Stage {
    static let T: [String: Double] = [
      "bounce": 0.5, "crack": 1.0, "freeze": 1.4, "ask": 2.4, "tap": 5.5, "yay": 5.9, "tube": 6.6, "walk": 7.3, "glue": 8.0,
      "glue_end": 9.7, "toss": 9.8, "h1": 10.5, "h2": 11.0, "h3": 11.5, "wind": 12.0, "jump": 12.35, "land": 13.05,
      "lights": 13.1, "lights_end": 14.6, "dance": 13.9, "dance_end": 15.3, "thanks": 15.5, "end": 19.0,
    ]
    static func T(_ k: String) -> Double { T[k]! }
    /// Như bảng: đoạn trong app bắt đầu ngay sau lúc người dùng ghi việc (phần nhờ đã ở thẻ "Koa nhờ").
    public static let start = 5.5 + 4.0 / 30
    public static var duration: Double { T("end") - start }

    /// Vết nứt trên mặt bục (px ảnh phòng, đo).
    public static let crackPx: [(Double, Double)] = [
      (640, 2002), (672, 2016), (700, 2008), (734, 2030), (770, 2022), (806, 2046), (842, 2038), (880, 2062), (918, 2056), (952, 2074),
    ]
    /// Vết nứt trong toạ độ phòng (app vẽ cả lúc hỏng bằng đúng vết này).
    public static var crack: [Pt] { crackPx.map { let q = room($0.0, $0.1); return Pt(q.x, q.y) } }
    /// Hai nhánh nứt nhỏ.
    public static var branches: [[Pt]] {
      [[(770, 2022), (782, 2002), (794, 1996)], [(880, 2062), (896, 2084)]].map { $0.map { let q = room($0.0, $0.1); return Pt(q.x, q.y) } }
    }

    static let yay = Line("Để tớ dán!", key: "koa.repair.stage.yay", at: T("yay") + 0.3)
    static let thanks = Line("Chắc chắn luôn! Cảm ơn cậu nha!", key: "koa.repair.stage.thanks", at: T("thanks"), rate: 0.14)
    static let hits = [T("h1"), T("h2"), T("h3")]

    static func ptOn(_ path: [(Double, Double)], _ u: Double) -> (Double, Double) {
      let n = Double(path.count - 1), x = clamp(u) * n
      let i = min(path.count - 2, Int(x)), f = x - Double(i)
      return (lerp(path[i].0, path[i + 1].0, f), lerp(path[i].1, path[i + 1].1, f))
    }
    static func glueLen(_ t: Double) -> Double { seg(t, T("glue"), T("glue_end")) }

    public static var cues: [Cue] {
      var c: [(Double, String, Double)] = []
      for l in [yay, thanks] {
        for (i, r) in l.syllables.enumerated() { c.append((r.lowerBound, "koa-talk-\((i * 7 + l.text.count) % 10 + 1)", 0.55)) }
      }
      c += [(T("tap") + 0.45, "koa-coin", 0.6), (T("yay"), "koa-v-yay", 0.7), (T("tube"), "koa-rustle", 0.6), (T("tube") + 0.2, "koa-v-hehe", 0.6)]
      for k in 0..<3 { c.append((T("walk") + Double(k) * 0.22, "koa-step-wood-1", 0.35)) }
      for k in 0..<8 { c.append((T("glue") + Double(k) * 0.21, "koa-boop-\(k % 3 + 1)", 0.3)) }
      c += [(T("toss"), "koa-sweep", 0.6), (T("toss") + 0.5, "koa-land", 0.4)]
      for h in hits { c += [(h - 0.3, "koa-hop", 0.4), (h, "koa-land", 0.6)] }
      c += [(T("wind"), "koa-v-mmm", 0.7), (T("jump"), "koa-hop", 0.8), (T("jump") + 0.1, "koa-sweep", 0.6),
            (T("land"), "koa-land", 1.0), (T("land") + 0.02, "koa-creak", 0.5)]
      for k in 0..<8 { c.append((T("lights") + Double(k) * 0.18, "koa-tick", 0.4)) }
      c += [(T("lights") + 0.1, "koa-v-oi", 0.6), (T("dance"), "koa-v-giggle", 0.7), (T("lights_end"), "koa-coin", 0.7),
            (T("dance") + 0.4, "koa-cheer", 0.5)]
      return c.filter { $0.0 >= start }.map { Cue(t: $0.0 - start, name: $0.1, volume: $0.2) }.sorted { $0.t < $1.t }
    }

    /// Cả đoạn: chuyển động phụ rồi dời Koa cho miệng tuýp nằm đúng trên điểm keo đang chạy tới (đo, không ước).
    public static func shots(fps: Double = 30) -> [Shot] {
      var out = (0..<Int(duration * fps)).map { shot(at: Double($0) / fps) }
      secondary(&out, fps: fps)
      for i in out.indices {
        let t = Double(i) / fps + start
        guard T("glue") <= t, t < T("toss"), case .glue = out[i].prop, let n = nozzle(out[i], t: t) else { continue }
        let g = ptOn(crackPx, glueLen(t)), gx = roomX(g.0), gy = roomY(g.1)
        out[i].x += gx - n.x
        out[i].stage.stream = (Pt(gx, n.y), Pt(gx, gy))
      }
      return out
    }

    /// Miệng tuýp keo (toạ độ phòng): tuýp vẽ ở tay phải, miệng ở (0, 36) của tuýp, tuýp phóng 0,5 (hình 240).
    public static func nozzle(_ s: Shot, t: Double) -> Pt? {
      guard case let .glue(angle, scale) = s.prop, let paw = paw(s, t: t) else { return nil }
      let r = angle * .pi / 180
      let lx = paw.x - 18 * scale * sin(r), ly = paw.y + 10 + 18 * scale * cos(r)
      return local(s, lx, ly)
    }

    public static func shot(at time: Double) -> Shot {
      let t = time + start
      var s = Shot()
      var px = stagePx.x, feet = stagePx.feet, lift = 0.0
      let w = stagePx.w
      var exprs: [(Double, KoaFlags.Expression)] = [(0, .happy)]
      var p = KoaWalk.Pose()
      p.weight = 1
      s.blink = blink(t, [4.4, T("walk") - 0.2, T("toss") + 0.3, T("thanks") + 1.4])
      let pressX = crackPx[6].0 - 40, pressFeet = stagePx.feet + 30
      if t < T("tube") {                                  // mừng, "Để tớ dán!"
        exprs = [(0, .delighted), (T("yay") + 0.3, .happy)]
        s.gaze = .init(x: 0, y: 0.1, k: 1)
        let h = hop(t, T("tap") + 0.45, 0.07, 0.28, 50)
        lift = h.lift; s.stretchY = h.squash; s.stretchX = 2 - h.squash
        s.mouth = yay.mouth(at: t)
        let a = ease(seg(t, T("yay") + 0.25, T("yay") + 0.45)) * (1 - seg(t, T("tube") - 0.1, T("tube") + 0.1))
        if a > 0 { s.bubble = yay.bubble(at: t, x: roomX(330), y: roomY(1100), width: 360 / pxPerUnit, alpha: a) }
      } else if t < T("toss") {                           // tuýp keo → bôi dọc vết nứt
        exprs = [(0, .focus)]
        if t < T("walk") {                                // với ra sau lưng, rút tuýp keo khổng lồ
          let u = seg(t, T("tube"), T("tube") + 0.4)
          exprs = [(0, .tease)]
          p.armRight = lerp(40, -60, ease(u)); p.turn = 0.2 * sin(.pi * u)
          s.prop = .glue(angle: -30, scale: backOut(seg(t, T("tube") + 0.2, T("tube") + 0.45)))
        } else if t < T("glue") {                         // nhón chân tới đầu vết nứt, ngồi xổm
          let u = seg(t, T("walk"), T("glue")), v = seg(t, T("glue") - 0.3, T("glue"))
          px = lerp(stagePx.x, 640, ease(u)); lift = 8 * abs(sin(u * .pi * 3))
          s.stretchY = 1 - 0.1 * seg(t, T("glue") - 0.25, T("glue"))
          p.armRight = lerp(-60, 30, v); p.lean = 12 * v
          s.gaze = .init(x: 0.4, y: 0.9, k: 1)
          s.prop = .glue(angle: lerp(-30, 15, v), scale: 1)
        } else {                                          // lạch bạch ngồi xổm dọc vết nứt, nặn keo
          let g = ptOn(crackPx, glueLen(t))
          px = g.0 - 70; feet = stagePx.feet + (g.1 - crackPx[0].1) * 0.6
          s.stretchY = 0.9 + 0.02 * sin(t * 16)
          p.armRight = 30 + 6 * sin(t * 16); p.lean = 12
          p.left.lift = 6 * max(0, sin(t * 10)); p.right.lift = 6 * max(0, -sin(t * 10))
          s.gaze = .init(x: 0.4, y: 0.95, k: 1)
          s.prop = .glue(angle: 15 + 6 * sin(t * 16), scale: 1)
        }
      } else if t < T("wind") {                           // quăng tuýp, phủi tay, nhảy nén ba cái
        px = pressX; feet = pressFeet
        exprs = [(0, .happy), (T("h1") - 0.3, .focus)]
        if t < T("h1") - 0.35 {
          let u = seg(t, T("toss"), T("toss") + 0.3)
          p.armRight = lerp(30, -150, ease(u)); p.lean = 12 * (1 - u)
          s.stretchY = lerp(0.9, 1, ease(u))
        } else {
          for h in hits where h - 0.35 <= t && t < h + 0.15 {
            let q = hop(t, h - 0.35, 0.08, 0.27, 55)
            lift = q.lift; s.stretchY = q.squash; s.stretchX = 2 - q.squash
          }
          p.armRight = -40; p.armLeft = 40
          s.gaze = .init(x: 0.3, y: 0.9, k: 1)
        }
      } else if t < T("lights") {                         // lấy đà, nhảy thật cao, đáp mạnh
        px = pressX; feet = pressFeet
        exprs = [(0, .focus), (T("jump"), .grin), (T("land") - 0.05, .oof)]
        if t < T("jump") {
          let u = ease(seg(t, T("wind"), T("jump")))
          s.stretchY = 1 - 0.16 * u; s.stretchX = 1 + 0.08 * u
          p.armRight = 60 * u; p.armLeft = -60 * u; p.lean = 6 * u
        } else {
          let u = seg(t, T("jump"), T("land"))
          lift = 300 * 4 * u * (1 - u)
          s.stretchY = u < 0.9 ? 1 + 0.12 * sin(.pi * u) : 1; s.stretchX = 2 - s.stretchY
          p.armRight = -160 * sin(.pi * u); p.armLeft = 160 * sin(.pi * u); p.left.lift = 12; p.right.lift = 12
        }
      } else if t < T("thanks") {                         // đèn chạy: giật mình → khoái → nhún nhảy
        let u0 = seg(t, T("lights"), T("lights") + 0.4), e = ease(seg(t, T("dance_end") - 0.3, T("dance_end")))
        px = lerp(pressX, stagePx.x, e); feet = lerp(pressFeet, stagePx.feet, e)
        let q = 1 - 0.14 * exp(-9 * u0) * cos(2 * .pi * 2.5 * u0)
        s.stretchY = q; s.stretchX = 2 - q
        exprs = [(0, .surprised), (T("dance"), .delighted)]
        if T("dance") <= t, t < T("dance_end") {
          let u = (t - T("dance")) * 2 * .pi * 1.6, w1 = sin(u)
          p.armRight = -120 + 30 * w1; p.armLeft = 120 + 30 * w1; p.sway = 7 * w1; p.shift = 6 * w1
          p.left.lift = 10 * max(0, w1); p.right.lift = 10 * max(0, -w1); p.turn = 0.25 * w1
        }
        s.gaze = t < T("dance") ? .init(x: 0.8 * sin((t - T("lights")) * 4.2), y: 0.6, k: 1) : .init(x: 0, y: 0.1, k: 1)
      } else {                                            // cảm ơn
        exprs = [(0, .delighted), (T("end") - 0.5, .happy)]
        let out = 1 - ease(seg(t, T("end") - 0.6, T("end") - 0.1))
        s.gesture = .taDa; s.gestureAmount = backOut(seg(t, T("thanks") + 0.1, T("thanks") + 0.4)) * out
        s.gaze = .init(x: 0, y: 0.1, k: 1)
        s.mouth = thanks.mouth(at: t)
        s.bubble = thanks.bubble(at: t, x: roomX(300), y: roomY(1030), width: 760 / pxPerUnit,
                                 alpha: ease(seg(t, T("thanks") - 0.05, T("thanks") + 0.2)) * out)
      }
      face(&s, t, exprs)
      s.pose = p
      s.x = roomX(px) + koaShift.x
      s.feet = roomY(feet - lift) - 6 + koaShift.y
      s.lift = lift / pxPerUnit
      s.scale = w / stagePx.w
      s.stage = stageState(t, s)
      s.camera = camera(t)
      s.repaired = t >= T("land")
      for h in hits + [T("land")] where h <= t && t < h + 0.4 {
        s.puffs.append(Puff(x: s.x, y: roomY(feet + 4) + koaShift.y, u: seg(t, h, h + 0.4), count: h == T("land") ? 5 : 3))
      }
      if T("land") <= t, t < T("land") + 0.4 {
        s.pops.append(Pop(text: "koa.repair.pop.thud", x: s.x + 160 / pxPerUnit, y: s.feet - 360 / pxPerUnit, u: seg(t, T("land"), T("land") + 0.4), size: 70 / pxPerUnit))
      }
      return s
    }

    static func stageState(_ t: Double, _ s: Shot) -> StageState {
      var st = StageState()
      var a = 1.0
      for (k, h) in hits.enumerated() where t >= h { a = 1 - 0.22 * Double(k + 1) }
      st.crackAlpha = t >= T("land") ? 0 : a
      st.glue = glueLen(t)
      st.glueAlpha = t >= T("land") + 0.2 ? 0 : 1 - seg(t, T("land"), T("land") + 0.2)
      st.darkRim = 1 - seg(t, T("land"), T("lights") + 0.2)
      if T("lights") <= t, t < T("lights_end") + 0.4 {
        st.lights = seg(t, T("lights"), T("lights_end"))
        st.lightsFade = 1 - seg(t, T("lights_end"), T("lights_end") + 0.4)
      }
      if t >= T("lights_end") - 0.1 { st.twinkle = t - (T("lights_end") - 0.1) }
      if T("toss") <= t, t < T("toss") + 0.6, let paw = paw(s, t: t) {
        let u = seg(t, T("toss"), T("toss") + 0.6), p0 = local(s, paw.x, paw.y)
        st.flyingTube = Pt(p0.x + 700 * u / pxPerUnit, p0.y + (-500 * u + 600 * u * u) / pxPerUnit)
        st.flyingAngle = 720 * u
      }
      return st
    }

    static let cam: [(Double, Double, Double, Double)] = [
      (5.5, 1.0, 630, 1368),    // kéo ra: thẻ việc
      (6.4, 1.0, 630, 1368),
      (6.8, 1.4, 640, 1640),    // tuýp keo khổng lồ: miếng hài
      (7.4, 1.4, 640, 1640),
      (8.0, 1.8, 700, 1900),    // thấp, cận mặt bục: dải keo chạy theo vết nứt (máy trôi theo Koa)
      (9.7, 1.8, 880, 1920),
      (10.1, 1.3, 800, 1720),   // vừa đủ thấy nhảy nén + vết nứt mờ dần
      (11.9, 1.3, 800, 1720),
      (12.35, 1.05, 760, 1500), // lùi + ngước theo cú nhảy cao
      (12.75, 1.05, 760, 1300),
      (13.05, 1.0, 630, 1368),  // đáp: toàn cảnh để thấy đèn chạy quanh bục
      (15.2, 1.0, 630, 1368),
      (15.7, 1.22, 616, 1600),  // đẩy nhẹ vào Koa cảm ơn
      (18.4, 1.22, 616, 1600),
      (19.0, 1.0, 630, 1368),   // lùi êm về toàn cảnh rồi trả phòng
    ]

    static func camera(_ t: Double) -> Camera {
      var k = 0
      while k + 1 < cam.count, cam[k + 1].0 <= t { k += 1 }
      let a = cam[k], b = cam[min(k + 1, cam.count - 1)]
      let u = b.0 == a.0 ? 0 : (t - a.0) / (b.0 - a.0)
      let e = ease(u)
      var c = Camera()
      c.zoom = lerp(a.1, b.1, e)
      c.x = roomX(lerp(a.2, b.2, e)); c.y = roomY(lerp(a.3, b.3, e))
      let sh = hits.reduce(0.0) { $0 + settle(t, $1, 4, 10, 14) } + settle(t, T("land"), 18, 8, 6)
      c.shake = sh / pxPerUnit
      return c
    }
  }

  /// Tay phải của Koa trong hình 240 (`KoaRender.paws`), theo đúng tư thế của khung.
  static func paw(_ s: Shot, t: Double) -> Pt? {
    var o = KoaRender.Options()
    o.size = 240
    o.live = true
    o.t = t * 1000
    o.expression = s.expression
    o.gaze = s.gaze
    o.gesture = s.gesture
    o.gestureAmount = s.gestureAmount
    o.walk = s.pose
    return KoaRender.paws(o).right.map { Pt($0.x, $0.y) }
  }

  /// Điểm trong hình Koa 240 → toạ độ phòng (chân ở (x, feet + 6), nén / giãn quanh chân, lật ngang khi `flip`
  /// — như `KoaRepairLayer`).
  static func local(_ s: Shot, _ x: Double, _ y: Double) -> Pt {
    let sc = KoaRoomMap.heroWidth * s.scale / 240
    return Pt(s.x + sc * s.stretchX * (s.flip ? -1 : 1) * (x - 120), s.feet + 6 + sc * s.stretchY * (y - 240 * KoaMath.aspect))
  }

  /// Đầu búa (toạ độ phòng): búa vẽ ở (tay.x, tay.y + 2), đầu búa ở (0, −128) của búa.
  public static func hammerHead(_ s: Shot, t: Double) -> Pt? {
    guard case let .hammer(angle, scale) = s.prop, let paw = paw(s, t: t) else { return nil }
    let r = angle * .pi / 180
    return local(s, paw.x + 128 * scale * sin(r), paw.y + 2 - 128 * scale * cos(r))
  }

  static func options(_ s: Shot, t: Double) -> KoaRender.Options {
    var o = KoaRender.Options()
    o.size = 240
    o.live = true
    o.t = t * 1000
    o.expression = s.expression
    o.gaze = s.gaze
    o.gesture = s.gesture
    o.gestureAmount = s.gestureAmount
    o.walk = s.pose
    return o
  }

  /// Hai tay và đỉnh đầu (toạ độ phòng) — để đặt đồ vác trên đầu.
  static func carryPoints(_ s: Shot, t: Double) -> (right: Pt, left: Pt, top: Pt)? {
    let o = options(s, t: t)
    let p = KoaRender.paws(o)
    guard let r = p.right, let l = p.left, let top = KoaRender.anchors(o)["head_top_fur"] else { return nil }
    return (local(s, r.x, r.y), local(s, l.x, l.y), local(s, top.x, top.y))
  }
}

// MARK: - Ván sàn bật (storyboard E, Kiệt duyệt 07/11)

extension KoaRepairScene {
  public struct FloorState: Sendable, Hashable {
    /// Góc bật của ván (độ; đầu trái nhấc lên, xoay quanh đầu phải).
    public var angle = 0.0
    /// Búa còn nằm trên sàn.
    public var hammerOnFloor = true
    /// Đinh: x (toạ độ phòng) và độ lún 0…1.
    public var nailX: Double?
    public var nailSink = 0.0
    /// Tia lửa ở đầu đinh 0…1.
    public var spark = 0.0
    /// Lấp lánh trên ván (giây kể từ lúc mừng).
    public var twinkle: Double?
  }

  public enum Floor {
    static let T: [String: Double] = [
      "pop": 0.6, "look": 1.0, "ask": 2.2, "tap": 5.3, "yay": 5.7, "down": 6.5, "walk1": 7.3, "on1": 7.65, "stand1": 7.85,
      "off": 8.4, "pop2": 8.6, "pick": 9.0, "got": 9.3, "back": 9.6, "on2": 9.85, "crouch": 10.3, "h1": 10.9, "h2": 11.3,
      "h3": 11.8, "rise": 12.2, "tiptoe": 12.4, "safe": 13.25, "test": 13.7, "hop2": 14.2, "cheer": 14.65, "home": 15.3,
      "thanks": 16.1, "end": 19.4,
    ]
    static func T(_ k: String) -> Double { T[k]! }
    public static let start = 5.3 + 4.0 / 30
    public static var duration: Double { T("end") - start }

    /// Đầu ván còn dính sàn (phải), dài ván, góc bật — px ảnh phòng (đo: dải sàn sau bục y 1828–1898).
    public static let pivotPx = (x: 980.0, y: 1876.0)
    public static let plankPx = (length: 240.0, raise: 17.0)
    /// Búa nằm trên sàn sau bục, bên trái tấm ván.
    public static let hammerFloorPx = (x: 700.0, y: 1866.0)
    static let onX = 860.0, offX = 640.0
    static let hits = [T("h1"), T("h2"), T("h3")]

    static let yay = Line("Để tớ đóng lại!", key: "koa.repair.floor.yay", at: T("yay") + 0.3)
    static let thanks = Line("Phẳng lì rồi! Cảm ơn cậu nha!", key: "koa.repair.floor.thanks", at: T("thanks"), rate: 0.14)

    /// Góc ván: bật lên, nằm xuống khi Koa giẫm, bật lại khi Koa bước ra, đóng đinh xong thì nằm im.
    public static func plankAngle(_ t: Double) -> Double {
      let raise = plankPx.raise
      func spring(_ t0: Double) -> Double { raise + settle(t, t0, 7, 5, 6) }
      if t < T("pop") { return 0 }
      if t < T("on1") { return spring(T("pop")) }
      if t < T("pop2") { return raise * (1 - ease(seg(t, T("on1"), T("on1") + 0.15))) }
      if t < T("on2") { return spring(T("pop2")) }
      return raise * (1 - ease(seg(t, T("on2"), T("on2") + 0.15)))
        + hits.filter { t >= $0 }.reduce(0) { $0 + 1.2 * sin(.pi * seg(t, $1, $1 + 0.12)) }
    }

    public static var cues: [Cue] {
      var c: [(Double, String, Double)] = []
      for l in [yay, thanks] {
        for (i, r) in l.syllables.enumerated() { c.append((r.lowerBound, "koa-talk-\((i * 7 + l.text.count) % 10 + 1)", 0.55)) }
      }
      for t0 in [T("pop"), T("pop2")] { c += [(t0, "koa-creak", 0.9), (t0 + 0.02, "koa-boop-3", 0.9), (t0 + 0.12, "koa-boop-2", 0.6)] }
      c += [(T("tap") + 0.45, "koa-coin", 0.6), (T("yay"), "koa-v-yay", 0.7), (T("down") + 0.1, "koa-hop", 0.6), (T("down") + 0.62, "koa-land", 0.6)]
      for k in 0..<2 { c.append((T("walk1") + Double(k) * 0.2, "koa-step-wood-1", 0.5)) }
      c += [(T("on1"), "koa-creak", 0.6), (T("stand1") + 0.1, "koa-v-hm", 0.5), (T("off") + 0.05, "koa-step-wood-1", 0.5),
            (T("pop2") + 0.05, "koa-v-ui", 0.9), (T("got"), "koa-rustle", 0.6)]
      for k in 0..<2 { c.append((T("back") + Double(k) * 0.18, "koa-step-wood-1", 0.5)) }
      c += [(T("on2"), "koa-creak", 0.6), (T("on2") + 0.2, "koa-v-hm", 0.6)]
      for h in hits { c += [(h, "koa-tick", 1.0), (h + 0.02, "koa-click", 0.5)] }
      for k in 0..<3 { c.append((T("tiptoe") + Double(k) * 0.28, "koa-step-wood-1", 0.3)) }
      c += [(T("safe"), "koa-v-mmm", 0.6), (T("test") + 0.1, "koa-hop", 0.5), (T("test") + 0.45, "koa-land", 0.5),
            (T("hop2") + 0.3, "koa-land", 0.6), (T("cheer"), "koa-v-yay", 0.8), (T("cheer") + 0.05, "koa-coin", 0.6),
            (T("home") + 0.1, "koa-hop", 0.6), (T("home") + 0.62, "koa-land", 0.6)]
      return c.filter { $0.0 >= start }.map { Cue(t: $0.0 - start, name: $0.1, volume: $0.2) }.sorted { $0.t < $1.t }
    }

    /// Cả đoạn: chuyển động phụ, rồi đặt đinh đúng chỗ đầu búa chạm ở cú gõ đầu (đo, không ước).
    public static func shots(fps: Double = 30) -> [Shot] {
      var out = (0..<Int(duration * fps)).map { shot(at: Double($0) / fps) }
      secondary(&out, fps: fps)
      let i = Int(((T("h1") - start) * fps).rounded())
      guard out.indices.contains(i), let head = hammerHead(out[i], t: T("h1")) else { return out }
      for j in out.indices where out[j].floor.nailX != nil { out[j].floor.nailX = head.x }
      for j in out.indices {
        out[j].pops = out[j].pops.map { p in
          guard p.text.hasPrefix("koa.repair.pop.knock") else { return p }
          var q = p; q.x = head.x + 40 / pxPerUnit; return q
        }
      }
      return out
    }

    /// Đầu búa (toạ độ phòng): búa vẽ ở tay phải, đầu ở (0, −128) của búa, búa phóng 0,4 (hình 240).
    public static func hammerHead(_ s: Shot, t: Double) -> Pt? {
      KoaRepairScene.hammerHead(s, t: t)
    }

    public static func shot(at time: Double) -> Shot {
      let t = time + start
      var s = Shot()
      var px = stagePx.x, feet = stagePx.feet, w = stagePx.w, lift = 0.0
      var exprs: [(Double, KoaFlags.Expression)] = [(0, .happy)]
      var p = KoaWalk.Pose()
      p.weight = 1
      var ham: Double?
      s.blink = blink(t, [T("stand1") + 0.3, T("got") + 0.2, T("safe") + 0.3, T("thanks") + 1.4])
      if t < T("down") {                                  // trên bục: mừng, "Để tớ đóng lại!"
        exprs = [(0, .delighted), (T("yay") + 0.3, .happy)]
        s.gaze = .init(x: 0, y: 0.1, k: 1)
        let h = hop(t, T("tap") + 0.45, 0.07, 0.28, 50)
        lift = h.lift; s.stretchY = h.squash; s.stretchX = 2 - h.squash
        s.mouth = yay.mouth(at: t)
        let a = ease(seg(t, T("yay") + 0.25, T("yay") + 0.45)) * (1 - seg(t, T("down") - 0.1, T("down") + 0.1))
        if a > 0 { s.bubble = yay.bubble(at: t, x: roomX(330), y: roomY(1100), width: 470 / pxPerUnit, alpha: a) }
      } else if t < T("home") {
        feet = floorPx.feet; w = floorPx.w
        if t < T("walk1") {                               // nhảy xuống sàn
          let h = hop(t, T("down"), 0.12, 0.5, 0)
          let u = seg(t, T("down") + 0.12, T("down") + 0.62)
          px = lerp(stagePx.x, offX + 40, ease(u)); w = lerp(stagePx.w, floorPx.w, ease(u))
          feet = lerp(stagePx.feet, floorPx.feet, ease(u)) - (h.phase == .air ? 150 * 4 * u * (1 - u) : 0)
          s.stretchY = h.squash; s.stretchX = 2 - h.squash
          p.armRight = -60 * sin(.pi * u); p.armLeft = 60 * sin(.pi * u)
        } else if t < T("stand1") {                       // bước lên đầu ván đang bật: ván nằm xuống
          let u = seg(t, T("walk1"), T("stand1"))
          px = lerp(offX + 40, onX, ease(u)); lift = 10 * abs(sin(u * .pi * 2))
          exprs = [(0, .focus)]
          s.gaze = .init(x: 0.3, y: 0.9, k: 1)
        } else if t < T("off") {                          // đứng trên ván: búa đâu nhỉ?
          px = onX
          s.gaze = .init(x: -0.9, y: 0.5, k: 1)
          s.gesture = .curious; s.gestureAmount = ease(seg(t, T("stand1"), T("stand1") + 0.2))
        } else if t < T("pick") {                         // bước ra lấy búa → BOING, giật bắn
          px = lerp(onX, offX + 60, ease(seg(t, T("off"), T("pick"))))
          exprs = [(0, .happy), (T("pop2") + 0.02, .yikes)]
          if t >= T("pop2") {
            lift = hop(t, T("pop2"), 0, 0.3, 60).lift
            p.armRight = -150; p.armLeft = 150; p.earLag = settle(t, T("pop2"), 14, 3, 5); p.turn = 0.4
            s.gaze = .init(x: 0.9, y: 0.4, k: 1)
          }
        } else if t < T("back") {                         // nhặt búa
          px = offX + 60
          exprs = [(0, .oops)]
          let u = ease(seg(t, T("pick"), T("got"))) * (1 - ease(seg(t, T("got"), T("back"))))
          s.stretchY = 1 - 0.12 * u
          p.lean = 14 * u; p.armRight = 30 * u
          s.gaze = .init(x: -0.4, y: 0.9, k: 1)
          if t >= T("got") { ham = lerp(150, 200, u) }
        } else if t < T("crouch") {                       // quay lại giẫm lên, lườm tấm ván
          let u = seg(t, T("back"), T("on2") + 0.1)
          px = lerp(offX + 60, onX, ease(u)); lift = 10 * abs(sin(clamp(u) * .pi * 2))
          exprs = [(0, .tease)]
          s.gaze = .init(x: 0.6, y: 0.8, k: 1)
          p.armRight = -40
          ham = 120
        } else if t < T("rise") {                         // đứng trên ván, cúi xuống đóng đinh
          px = onX
          exprs = [(0, .focus)]
          let c = ease(seg(t, T("crouch"), T("crouch") + 0.3))
          s.stretchY = 1 - 0.12 * c
          var arm = -100.0                                // búa giơ cao chờ
          for h in hits {                                 // giơ lên lấy đà → bổ xuống → nảy lên
            if h - 0.3 <= t, t < h - 0.12 { arm = lerp(-60, -120, ease(seg(t, h - 0.3, h - 0.12))) }
            if h - 0.12 <= t, t < h { arm = lerp(-120, 40, pow(seg(t, h - 0.12, h), 2)) }
            if h <= t, t < h + 0.25 { arm = 40 - 85 * ease(seg(t, h, h + 0.25)) + settle(t, h, 5, 5, 12) }
          }
          p.lean = 16 * c; p.armRight = lerp(-40, arm, c); p.armLeft = 20 * c; p.turn = 0.25
          s.gaze = .init(x: 0.6, y: 0.95, k: 1)
          ham = 160 + arm
        } else if t < T("test") {                         // nhón chân bước ra, ngoái lại: ván nằm yên
          let u = seg(t, T("tiptoe"), T("safe"))
          px = lerp(onX, offX + 30, ease(u)); lift = 6 + 8 * abs(sin(u * .pi * 3))
          exprs = [(0, .yikes), (T("safe"), .happytired)]
          s.gaze = .init(x: 0.9, y: 0.6, k: 1)
          p.armRight = -60; p.armLeft = 60; p.turn = 0.3
          if t < T("safe") { ham = 100 } else {           // lau mồ hôi trán
            p.armRight = -150 * sin(.pi * seg(t, T("safe"), T("test"))); p.armLeft = 0; p.turn = 0
          }
        } else {                                          // nhảy thử lên ván hai cái → mừng
          exprs = [(0, .grin), (T("cheer"), .delighted)]
          if t < T("hop2") {
            let h = hop(t, T("test"), 0.08, 0.36, 60)
            px = lerp(offX + 30, onX, ease(seg(t, T("test") + 0.08, T("test") + 0.44)))
            lift = h.lift; s.stretchY = h.squash; s.stretchX = 2 - h.squash
          } else if t < T("cheer") {
            px = onX
            let h = hop(t, T("hop2"), 0.08, 0.32, 70)
            lift = h.lift; s.stretchY = h.squash; s.stretchX = 2 - h.squash
            s.gaze = .init(x: 0.3, y: 0.9, k: 1)
          } else {
            px = onX
            p.armRight = -150; p.armLeft = 150
            lift = hop(t, T("cheer"), 0.05, 0.3, 40).lift
          }
        }
      } else {                                            // về bục, cảm ơn
        exprs = [(0, .happy), (T("thanks"), .delighted), (T("end") - 0.5, .happy)]
        if t < T("thanks") {
          let h = hop(t, T("home"), 0.12, 0.5, 0)
          let u = seg(t, T("home") + 0.12, T("home") + 0.62)
          px = lerp(onX, stagePx.x, ease(u)); w = lerp(floorPx.w, stagePx.w, ease(u))
          feet = lerp(floorPx.feet, stagePx.feet, ease(u)) - (h.phase == .air ? 130 * 4 * u * (1 - u) : 0)
          s.stretchY = h.squash; s.stretchX = 2 - h.squash
          p.armRight = -150 * sin(.pi * u); p.armLeft = 150 * sin(.pi * u)
        } else {
          let out = 1 - ease(seg(t, T("end") - 0.6, T("end") - 0.1))
          s.gesture = .taDa; s.gestureAmount = backOut(seg(t, T("thanks") + 0.1, T("thanks") + 0.4)) * out
          s.gaze = .init(x: 0, y: 0.1, k: 1)
          s.mouth = thanks.mouth(at: t)
          s.bubble = thanks.bubble(at: t, x: roomX(300), y: roomY(1030), width: 700 / pxPerUnit,
                                   alpha: ease(seg(t, T("thanks") - 0.05, T("thanks") + 0.2)) * out)
        }
      }
      face(&s, t, exprs)
      s.pose = p
      if let ham { s.prop = .hammer(angle: ham, scale: 0.4) }
      let onStage = clamp((w - floorPx.w) / (stagePx.w - floorPx.w))
      s.x = roomX(px) + koaShift.x * onStage
      s.feet = roomY(feet - lift) - 6 + koaShift.y * onStage
      s.lift = lift / pxPerUnit
      s.scale = w / stagePx.w
      s.camera = camera(t)
      s.repaired = t >= T("h3")
      var f = FloorState()
      f.angle = plankAngle(t)
      f.hammerOnFloor = t < T("got")
      if t >= T("crouch") {
        f.nailX = roomX(onX - 260)                        // chỗ tạm; `shots()` đặt đúng chỗ đầu búa chạm
        f.nailSink = min(1, Double(hits.filter { t >= $0 }.count) / 3)
      }
      let nailY = roomY(pivotPx.y - 6)
      for h in hits where h <= t && t < h + 0.3 {
        let u = seg(t, h, h + 0.3)
        f.spark = 1 - u
        s.pops.append(Pop(text: h == hits.last ? "koa.repair.pop.knockHard" : "koa.repair.pop.knock",
                          x: (f.nailX ?? 0) + 40 / pxPerUnit, y: nailY - 60 / pxPerUnit, u: u, size: 46 / pxPerUnit))
      }
      if t >= T("cheer"), t < T("cheer") + 1.4 { f.twinkle = t - T("cheer") }
      s.floor = f
      let end = room(pivotPx.x - plankPx.length + 20, pivotPx.y)
      for t0 in [T("pop"), T("pop2")] where t0 <= t && t < t0 + 0.45 {
        let u = seg(t, t0, t0 + 0.45)
        s.puffs.append(Puff(x: end.x, y: end.y, u: u, count: 4))
        s.pops.append(Pop(text: "koa.repair.pop.boing", x: end.x - 40 / pxPerUnit, y: end.y - 120 / pxPerUnit, u: u, size: 58 / pxPerUnit))
      }
      return s
    }

    static let cam: [(Double, Double, Double, Double)] = [
      (5.3, 1.0, 630, 1368),    // kéo ra: thẻ việc
      (6.5, 1.0, 630, 1368),
      (7.2, 1.55, 820, 1640),   // sàn sau bục: Koa, tấm ván, cây búa trong một khung (thấy vì sao ván bật lại)
      (9.7, 1.55, 820, 1640),
      (10.3, 1.9, 880, 1720),   // cận: đóng đinh
      (12.2, 1.9, 880, 1720),
      (12.6, 1.55, 820, 1640),  // lùi ra: nhón chân bước ra, ván có bật nữa không?
      (14.9, 1.55, 820, 1640),
      (15.5, 1.0, 630, 1368),   // toàn cảnh khi Koa về bục
      (16.3, 1.22, 616, 1600),  // đẩy nhẹ vào Koa cảm ơn
      (18.8, 1.22, 616, 1600),
      (19.4, 1.0, 630, 1368),   // lùi êm về toàn cảnh rồi trả phòng
    ]

    static func camera(_ t: Double) -> Camera {
      var k = 0
      while k + 1 < cam.count, cam[k + 1].0 <= t { k += 1 }
      let a = cam[k], b = cam[min(k + 1, cam.count - 1)]
      let u = b.0 == a.0 ? 0 : (t - a.0) / (b.0 - a.0)
      let e = ease(u)
      var c = Camera()
      c.zoom = lerp(a.1, b.1, e)
      c.x = roomX(lerp(a.2, b.2, e)); c.y = roomY(lerp(a.3, b.3, e))
      let sh = settle(t, T("pop2"), 12, 9, 8) + hits.reduce(0.0) { $0 + settle(t, $1, 6, 10, 14) }
        + settle(t, T("down") + 0.62, 5, 9, 12) + settle(t, T("hop2") + 0.32, 4, 9, 12)
      c.shake = sh / pxPerUnit
      return c
    }
  }
}

// MARK: - Bảng neon tắt (storyboard A bản 5, Kiệt duyệt 06/11)

extension KoaRepairScene {
  /// Thang chữ A: khớp (toạ độ phòng), độ mở 0…1 (0 = gập), góc, khe giữa hai chân (px ảnh).
  public struct Ladder: Sendable, Hashable {
    public var hinge: Pt
    public var spread: Double, angle: Double, gap: Double
    /// Vác trên đầu (vẽ trước Koa) / đứng trên sàn.
    public var carried: Bool
  }

  public struct NeonState: Sendable, Hashable {
    /// Bảng tối 0…1, nhoè sáng khi gõ, viền bừng sáng 0…1, rung (đơn vị phòng).
    public var broken = 0.0, glow = 0.0, shake = 0.0
    /// Góc phòng tối đi khi đèn tắt / ấm lên khi sáng lại.
    public var dim = 0.0, warm = 0.0
    /// Tia lửa ở chỗ búa chạm 0…1.
    public var hit: Pt?
    public var hitU = 0.0
    /// Lấp lánh quanh bảng (giây kể từ lúc sáng) và khắp phòng (giây kể từ lúc mừng).
    public var twinkle: Double?, roomTwinkle: Double?
    /// Vệt gió khi Koa chạy vụt đi 0…1.
    public var whoosh: Double?
    public var ladder: Ladder?
    /// Thang đang chao (độ, quanh chân thang); Koa đứng trên thang thì chao cùng.
    public var wobble = 0.0
    public var koaOnLadder = false
  }

  public enum Neon {
    static let T: [String: Double] = [
      "tap": 4.75, "yay": 5.2, "go": 5.95, "out": 6.45, "gone": 6.6, "back": 7.05, "skid": 7.25, "pant": 7.6, "set": 8.35,
      "open": 8.75, "climb": 9.15, "top": 10.35, "wob_end": 11.0, "ham": 11.15, "lit": 12.85, "show": 13.45, "down": 14.6,
      "cheer": 16.1, "end": 19.0,
    ]
    static func T(_ k: String) -> Double { T[k]! }
    public static let hits = [11.75, 12.25, 12.75]
    public static let start = 4.75 + 4.0 / 30
    public static var duration: Double { T("end") - start }
    static let climbStep = 0.3

    /// Bảng neon trong ảnh phòng (px) và vết nứt.
    public static let signPx = (x: 17.0, y: 353.0, w: 486.0, h: 383.0)
    public static let crackPx: [(Double, Double)] = [(60, 380), (170, 470), (140, 520), (260, 610), (230, 650), (330, 720)]
    /// Thang chữ A: chân giữa x, sàn, chiều dài chân, nửa góc mở; bậc trên chân phải (tỉ lệ từ khớp).
    public static let ladderPx = (x: 512.0, base: 1868.0, length: 715.0, half: 12.0)
    public static let steps = [0.34, 0.63, 0.9]
    public static var hingePx: (x: Double, y: Double) { (ladderPx.x, ladderPx.base - ladderPx.length * cos(ladderPx.half * .pi / 180)) }

    static let yay = Line("Để tớ!", key: "koa.repair.neon.yay", at: T("yay") + 0.35, rate: 0.16)
    static let show = Line("Sáng rồi nè!", key: "koa.repair.neon.show", at: T("show") + 0.1)
    static let thanks = Line("Cảm ơn cậu nha!", key: "koa.repair.neon.thanks", at: T("cheer") + 0.3)

    /// Chỗ đặt chân trên bậc i (0…2), 3 = nóc thang (px ảnh).
    static func stepPx(_ i: Int) -> (Double, Double) {
      let h = hingePx, a = ladderPx.half * .pi / 180
      if i >= 3 { return (h.x + 6, h.y - 14) }
      let f = steps[2 - i]
      return (h.x + ladderPx.length * sin(a) * f + 30, h.y + ladderPx.length * cos(a) * f - 8)
    }

    public static var cues: [Cue] {
      var c: [(Double, String, Double)] = []
      for l in [yay, show, thanks] {
        for (i, r) in l.syllables.enumerated() { c.append((r.lowerBound, "koa-talk-\((i * 7 + l.text.count) % 10 + 1)", 0.55)) }
      }
      c += [(T("tap") + 0.45, "koa-coin", 0.6), (T("yay"), "koa-v-yay", 0.7)]
      for k in 0..<5 { c.append((T("go") + Double(k) * 0.07, "koa-step-\(k % 3 + 1)", 0.5)) }
      c += [(T("out"), "koa-sweep", 0.8), (T("back"), "koa-sweep", 0.8), (T("skid"), "koa-creak", 0.5), (T("pant"), "koa-v-hehe", 0.5),
            (T("set") + 0.3, "koa-creak", 0.6), (T("open") + 0.1, "koa-click", 0.8)]
      for i in 0..<4 { c.append((T("climb") + Double(i) * climbStep + climbStep * 0.7, "koa-step-wood-\(i % 2 + 1)", 0.7)) }
      c += [(T("top") + 0.1, "koa-creak", 0.6), (T("top") + 0.15, "koa-v-ui", 0.7), (T("ham"), "koa-rustle", 0.6)]
      for h in hits { c += [(h, "koa-click", 1.0), (h + 0.02, "koa-tick", 0.6)] }
      c += [(T("lit"), "koa-buzz", 0.7), (T("lit") + 0.15, "koa-v-giggle", 0.6), (T("down") + 0.1, "koa-hop", 0.6),
            (T("down") + 0.6, "koa-land", 0.7), (T("cheer"), "koa-cheer", 0.6)]
      return c.filter { $0.0 >= start }.map { Cue(t: $0.0 - start, name: $0.1, volume: $0.2) }.sorted { $0.t < $1.t }
    }

    /// Cả đoạn: chuyển động phụ, rồi thang (vác trên đầu đo từ hai tay + đỉnh đầu) và chỗ búa chạm bảng (đo).
    public static func shots(fps: Double = 30) -> [Shot] {
      var out = (0..<Int(duration * fps)).map { shot(at: Double($0) / fps) }
      secondary(&out, fps: fps)
      func time(_ i: Int) -> Double { Double(i) / fps + start }
      func carry(_ s: Shot, t: Double, tilt: Double) -> (Pt, Double)? {
        guard let p = carryPoints(s, t: t) else { return nil }
        let mx = (p.right.x + p.left.x) / 2, my = min(p.right.y, p.left.y, p.top.y - 20 / pxPerUnit)
        let half = ladderPx.length / 2 / pxPerUnit, r = tilt * .pi / 180
        return (Pt(mx - half * cos(r), my - half * sin(r)), -90 + tilt)
      }
      let setIndex = max(0, Int(((T("set") - start) * fps).rounded()) - 1)
      let from = carry(out[setIndex], t: time(setIndex), tilt: 0)
      let h = hingePx, hinge = Pt(roomX(h.x), roomY(h.y))
      for i in out.indices {
        let t = time(i)
        if T("back") <= t, t < T("set") {
          let tilt = settle(t, T("skid"), 9, 2.2, 3) + (t >= T("pant") ? 3 * sin(t * 2 * .pi * 3.2) : 0)
          if let c = carry(out[i], t: t, tilt: tilt) { out[i].neon.ladder = Ladder(hinge: c.0, spread: 0, angle: c.1, gap: 70, carried: true) }
        } else if T("set") <= t, t < T("open") + 0.4, let from {
          let u = ease(seg(t, T("set"), T("open"))), o = seg(t, T("open"), T("open") + 0.4)
          let spread = o <= 0 ? 0 : o > 0.3 ? 1 + settle(t, T("open") + 0.12, -0.25, 3, 7) : ease(o / 0.3)
          out[i].neon.ladder = Ladder(hinge: Pt(lerp(from.0.x, hinge.x, u), lerp(from.0.y, hinge.y, u) - 120 / pxPerUnit * sin(.pi * u)),
                                      spread: max(0, spread), angle: lerp(from.1, 0, u), gap: lerp(70, 26, u), carried: false)
        } else if t >= T("open") + 0.4 {
          out[i].neon.ladder = Ladder(hinge: hinge, spread: 1, angle: 0, gap: 26, carried: false)
        }
      }
      for hit in hits {
        let i = Int(((hit - start) * fps).rounded())
        guard out.indices.contains(i), let head = hammerHead(out[i], t: time(i)) else { continue }
        for j in out.indices where hit <= time(j) && time(j) < hit + 0.35 {
          let u = seg(time(j), hit, hit + 0.35)
          out[j].neon.hit = head; out[j].neon.hitU = u
          out[j].pops.append(Pop(text: "koa.repair.pop.knock", x: head.x + 30 / pxPerUnit, y: head.y - 50 / pxPerUnit, u: u, size: 66 / pxPerUnit))
        }
      }
      return out
    }

    public static func shot(at time: Double) -> Shot {
      let t = time + start
      var s = Shot()
      var px = stagePx.x, feet = stagePx.feet, w = stagePx.w, lift = 0.0
      var exprs: [(Double, KoaFlags.Expression)] = [(0, .happy)]
      var p = KoaWalk.Pose()
      p.weight = 1
      var squeeze = false
      s.blink = blink(t, [T("pant") + 0.5, T("top") + 0.7, T("show") - 0.03, T("cheer") + 1.4])
      if t < T("go") {                                    // mừng, "Để tớ!" (nắm tay đấm lên trời)
        exprs = [(0, .delighted), (T("yay") + 0.3, .happy)]
        s.gaze = .init(x: 0, y: 0.1, k: 1)
        let h = hop(t, T("tap") + 0.45, 0.07, 0.28, 50)
        lift = h.lift; s.stretchY = h.squash; s.stretchX = 2 - h.squash
        p.armRight = -150 * backOut(seg(t, T("yay") + 0.3, T("yay") + 0.5))
        s.mouth = yay.mouth(at: t)
        let a = ease(seg(t, T("yay") + 0.3, T("yay") + 0.5)) * (1 - seg(t, T("go") + 0.1, T("go") + 0.3))
        if a > 0 { s.bubble = yay.bubble(at: t, x: roomX(300), y: roomY(1080), width: 300 / pxPerUnit, alpha: a) }
      } else if t < T("back") {                           // chạy vụt đi: lấy đà (chân quẫy tại chỗ) → vèo
        exprs = [(0, .happy), (T("go"), .grin)]
        if t < T("out") {
          let u = seg(t, T("go"), T("out")), ph = (t - T("go")) * 2 * .pi * 9
          p.turn = 0.8; p.lean = -10 * ease(u); p.left.lift = 12 * max(0, sin(ph)); p.right.lift = 12 * max(0, -sin(ph))
          p.armRight = 30 * sin(ph); p.armLeft = -30 * sin(ph); p.bob = 3 * abs(sin(ph))
          px = stagePx.x - 30 * ease(u)
          s.puffs.append(Puff(x: roomX(px + 60), y: roomY(stagePx.feet - 10), u: ((t - T("go")) * 3).truncatingRemainder(dividingBy: 1), count: 3))
        } else if t < T("gone") {
          let u = seg(t, T("out"), T("gone"))
          p.turn = 1; p.lean = 14; p.left.lift = 10; p.right.lift = 10; p.armRight = 40; p.armLeft = 40
          px = lerp(stagePx.x - 30, 1700, u * u); s.stretchX = 1 + 0.7 * u; s.stretchY = 1 - 0.12 * u
        } else {
          s.hidden = true
        }
        if t >= T("out") {
          let u = seg(t, T("out"), T("out") + 0.9)
          s.puffs.append(Puff(x: roomX(stagePx.x), y: roomY(stagePx.feet - 60), u: u, count: 7))
          s.neon.whoosh = u
          s.pops.append(Pop(text: "koa.repair.pop.whoosh", x: roomX(stagePx.x - 60), y: roomY(stagePx.feet - 520), u: seg(t, T("out"), T("out") + 0.8), size: 72 / pxPerUnit))
        }
      } else if t < T("climb") {                          // vác thang về, trượt phanh, thở hổn hển, dựng thang
        feet = floorPx.feet; w = floorPx.w
        exprs = [(0, .grin), (T("pant"), .pant), (T("set"), .happy)]
        if t < T("skid") {
          let u = seg(t, T("back"), T("skid"))
          px = lerp(1700, 780, eout(u)); s.stretchX = 1.5 - 0.5 * u; s.stretchY = 0.9 + 0.1 * u
          p.turn = -1; p.lean = 12; p.armRight = -165; p.armLeft = 165; p.left.lift = 10; p.right.lift = 10
        } else if t < T("pant") {                         // trượt phanh: ngả người ra sau, bụi tung dưới chân
          let u = seg(t, T("skid"), T("pant"))
          px = lerp(780, 700, eout(u))
          p.turn = -0.7; p.lean = -12 * (1 - u); p.armRight = -165; p.armLeft = 165
          s.puffs.append(Puff(x: roomX(px + 80), y: roomY(floorPx.feet - 10), u: u, count: 5))
        } else if t < T("set") {
          px = 700
          let b = sin(t * 2 * .pi * 3.2)
          p.armRight = -165; p.armLeft = 165; p.bob = -3 + 3 * b; p.sway = 1.5 * b
        } else {                                          // hạ thang xuống bên trái, mở chân thang
          px = 700
          let u = ease(seg(t, T("set"), T("open")))
          p.turn = -0.5 * u; p.armRight = lerp(-165, -80, u); p.armLeft = lerp(165, 80, u); p.lean = 4 * u
        }
        s.gaze = .init(x: 0, y: 0.1, k: 1)
      } else if t < T("top") + 0.3 {                      // leo thang
        w = floorPx.w
        var k = min(3, Int((t - T("climb")) / climbStep)), u = (t - T("climb")) / climbStep - Double(k)
        if t >= T("top") { k = 3; u = 1 }
        let a = k == 0 ? (700.0, floorPx.feet) : stepPx(k - 1), b = stepPx(k)
        let rise = ease(seg(u, 0.35, 0.9))
        px = lerp(a.0, b.0, rise); feet = lerp(a.1, b.1, rise)
        s.stretchY = 1 - 0.05 * sin(.pi * seg(u, 0.85, 1)); s.stretchX = 2 - s.stretchY
        let odd = k % 2 == 1, swing = sin(.pi * u), step = 16 * sin(.pi * seg(u, 0, 0.6))
        p.turn = t >= T("top") ? -0.7 * (1 - ease(seg(t, T("top"), T("top") + 0.3))) : -0.7
        p.armRight = -70 + (odd ? 25 : -10) * swing; p.armLeft = 70 - (odd ? -10 : 25) * swing
        p.left.lift = odd ? 0 : step; p.right.lift = odd ? step : 0; p.lean = 6 * swing
        s.gaze = .init(x: -0.4, y: -0.5, k: 1)
      } else if t < T("down") {                           // trên nóc: chao → búa → gõ gõ → sáng → khoe
        (px, feet) = stepPx(3); w = floorPx.w
        if t < T("wob_end") {
          exprs = [(0, .oops)]
          p.armRight = -110 + 40 * sin(t * 22); p.armLeft = 110 + 40 * sin(t * 22 + 1.5); p.sway = 4 * sin(t * 9)
        } else {
          s.flip = true
          s.gaze = t < T("show") ? .init(x: 0.55, y: -0.95, k: 1) : .init(x: 0, y: 0.1, k: 1)
          p.turn = 0.35 * ease(seg(t, T("wob_end"), T("wob_end") + 0.2)) * (1 - ease(seg(t, T("show"), T("show") + 0.2)))
          var arm = -40.0, up = 0.0
          for h in hits {
            if h - 0.32 <= t, t < h - 0.07 { arm = lerp(-40, -15, ease(seg(t, h - 0.32, h - 0.1))) }
            if h - 0.07 <= t, t < h { arm = lerp(-15, -158, ease(seg(t, h - 0.07, h))); up = 40 * ease(seg(t, h - 0.07, h)) }
            if h <= t, t < h + 0.3 {
              arm = -158 + 118 * ease(seg(t, h + 0.05, h + 0.3)) + settle(t, h, 8, 5, 12); up = 40 * (1 - ease(seg(t, h, h + 0.22)))
              squeeze = t < h + 0.14
            }
          }
          if t >= T("show") { arm = lerp(-40, -95, backOut(seg(t, T("show"), T("show") + 0.3))) }
          lift = up
          p.armRight = arm; p.armLeft = -8
          if up > 1 { p.left.lift = 6; p.right.lift = 6 }
          exprs = [(0, .happy), (T("ham") + 0.2, .focus), (T("lit") + 0.02, .surprised), (T("lit") + 0.3, .delighted)]
          if t >= T("ham") { s.prop = .hammer(angle: 160 + arm, scale: 0.5 * backOut(seg(t, T("ham"), T("ham") + 0.25))) }
          s.mouth = show.mouth(at: t)
          let a = ease(seg(t, T("show"), T("show") + 0.22)) * (1 - seg(t, T("down") - 0.15, T("down")))
          if a > 0 { s.bubble = show.bubble(at: t, x: roomX(700), y: roomY(800), width: 340 / pxPerUnit, alpha: a) }
        }
      } else {                                            // nhảy xuống, về bục, mừng, cảm ơn
        exprs = [(0, .delighted), (T("end") - 0.5, .happy)]
        s.gaze = .init(x: 0, y: 0.1, k: 1)
        if t < T("cheer") {
          let mid = T("down") + 0.62
          var h: (lift: Double, squash: Double, phase: Phase), u: Double, a: (Double, Double), b: (Double, Double), wa: Double, wb: Double, arc: Double
          if t < mid {                                    // từ nóc thang xuống sàn
            h = hop(t, T("down"), 0.12, 0.5, 0); u = seg(t, T("down") + 0.12, mid)
            a = stepPx(3); b = (720, floorPx.feet); wa = floorPx.w; wb = floorPx.w; arc = 150
          } else {                                        // bước lên bục
            h = hop(t, mid + 0.18, 0.1, 0.42, 0); u = seg(t, mid + 0.28, mid + 0.7)
            a = (720, floorPx.feet); b = (stagePx.x, stagePx.feet); wa = floorPx.w; wb = stagePx.w; arc = 120
            if t < mid + 0.18 { h.squash = hop(t, mid, 0, 0.0001, 0).squash }
          }
          px = lerp(a.0, b.0, ease(u)); w = lerp(wa, wb, ease(u))
          feet = lerp(a.1, b.1, ease(u)) - (h.phase == .air ? arc * 4 * u * (1 - u) : 0)
          s.stretchY = h.squash; s.stretchX = 2 - h.squash
          s.flip = t < T("down") + 0.3
          p.armRight = -150 * sin(.pi * u); p.armLeft = 150 * sin(.pi * u)
          if h.phase == .air { p.left.lift = 10; p.right.lift = 10 }
          if t < T("down") + 0.3 { s.prop = .hammer(angle: 0, scale: 0.5) }
        } else {
          let out = 1 - ease(seg(t, T("end") - 0.6, T("end") - 0.1))
          s.gesture = .cheer; s.gestureAmount = ease(seg(t, T("cheer") - 0.1, T("cheer") + 0.12)) * out
          let h = hop(t, T("cheer"), 0.08, 0.32, 60)
          lift = h.lift; s.stretchY = h.squash; s.stretchX = 2 - h.squash
          s.mouth = thanks.mouth(at: t)
          s.bubble = thanks.bubble(at: t, x: roomX(300), y: roomY(980), width: 620 / pxPerUnit,
                                   alpha: ease(seg(t, T("cheer") + 0.2, T("cheer") + 0.45)) * out)
          s.neon.roomTwinkle = t - T("cheer")
        }
      }
      face(&s, t, exprs)
      if squeeze { s.expression = .oof; s.from = nil; s.mix = 1; s.blink = nil }   // búa chạm: nhắm tịt ngay
      s.pose = p
      let onStage = clamp((w - floorPx.w) / (stagePx.w - floorPx.w))
      s.x = roomX(px) + koaShift.x * onStage
      s.feet = roomY(feet - lift) - 6 + koaShift.y * onStage
      s.lift = feet > 1850 ? lift / pxPerUnit : 0
      s.scale = w / stagePx.w
      s.camera = camera(t)
      s.repaired = t >= T("lit")
      var n = s.neon
      n.broken = t < T("lit") ? 1 : 0
      for h in hits.prefix(2) where h <= t && t < h + 0.2 { n.broken = Int((t - h) * 30) % 2 == 0 ? 0.3 : 1 }
      n.glow = ease(seg(t, T("lit"), T("lit") + 0.25))
      n.shake = hits.reduce(0.0) { $0 + settle(t, $1, 5, 9, 14) } / pxPerUnit
      n.dim = 1 - ease(seg(t, T("lit"), T("lit") + 0.4))
      n.warm = 0.22 * n.glow * (1 - 0.5 * seg(t, T("show"), T("end")))
      if t >= T("lit") { n.twinkle = t - T("lit") }
      n.koaOnLadder = T("climb") <= t && t < T("down") + 0.2
      if T("top") <= t, t < T("wob_end") + 0.5 { n.wobble = settle(t, T("top") + 0.05, 4, 2.2, 3) }
      s.neon = n
      return s
    }

    static let cam: [(Double, Double, Double, Double, Double)] = [
      (4.85, 1.0, 630, 1368, 0),    // kéo ra: thấy cả phòng khi người dùng làm xong
      (7.55, 1.0, 630, 1368, 0),
      (7.75, 1.8, 700, 1640, 0),    // cận mặt thở hổn hển: miếng hài
      (8.30, 1.8, 700, 1640, 0),
      (8.60, 1.25, 600, 1540, 0),   // lùi ra vừa đủ thấy thang được dựng
      (9.15, 1.25, 600, 1540, 0),
      (10.35, 1.3, 540, 1150, 0),   // lia lên theo Koa leo: thấy độ cao
      (10.45, 1.38, 520, 1080, 3.5),// thang chao: máy nghiêng theo (bất an)
      (10.70, 1.38, 520, 1080, -3),
      (10.95, 1.38, 520, 1080, 0),
      (11.40, 1.7, 430, 880, 0),    // cận bảng đèn + đầu Koa: từng cú gõ
      (12.85, 1.7, 430, 880, 0),
      (13.40, 1.12, 560, 1160, 0),  // kéo ra: đèn sáng, cả góc phòng bừng lên
      (14.55, 1.12, 560, 1160, 0),
      (15.10, 1.0, 630, 1368, 0),   // toàn cảnh khi Koa nhảy xuống
      (16.00, 1.0, 630, 1368, 0),
      (16.50, 1.22, 616, 1600, 0),  // đẩy nhẹ vào Koa cảm ơn
      (18.40, 1.22, 616, 1600, 0),
      (19.00, 1.0, 630, 1368, 0),   // lùi êm về toàn cảnh rồi trả phòng
    ]

    static func camera(_ t: Double) -> Camera {
      var k = 0
      while k + 1 < cam.count, cam[k + 1].0 <= t { k += 1 }
      let a = cam[k], b = cam[min(k + 1, cam.count - 1)]
      let u = b.0 == a.0 ? 0 : (t - a.0) / (b.0 - a.0)
      let e = ease(u)
      var c = Camera()
      c.roll = T("top") <= t && t < T("wob_end") + 0.4 ? 0.6 * settle(t, T("top") + 0.05, 4, 2.2, 3) : lerp(a.4, b.4, e)
      c.zoom = lerp(a.1, b.1, e) * (1 + 0.02 * abs(c.roll))   // nghiêng thì phóng thêm chút cho khỏi lộ mép
      c.x = roomX(lerp(a.2, b.2, e)); c.y = roomY(lerp(a.3, b.3, e))
      let sh = settle(t, T("skid"), 8, 8, 10) + hits.reduce(0.0) { $0 + settle(t, $1, 10, 11, 14) } + settle(t, T("down") + 0.62, 6, 9, 12)
      c.shake = sh / pxPerUnit
      return c
    }
  }
}
