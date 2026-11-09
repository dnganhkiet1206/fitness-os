import Foundation

/// Màn nghỉ giữa hai set có Koa — storyboard lần 3 "Một hơi nữa thôi" (07/11, Kiệt duyệt
/// `docs/koa-v2/gallery/v9-reaction-storyboard/v16-rest-story-board/STORYBOARD.md`).
///
/// Một câu chuyện, không phải chuỗi việc: Koa kiệt sức sau set, ngán cái tạ, nhìn bạn rồi ấm lên, tự quyết đứng
/// dậy và nhấc tạ. Bám đồng hồ nghỉ thật:
///
/// | # | Cảnh | Khi nào | Máy |
/// |---|---|---|---|
/// | 1 | Buông tạ, ngồi phịch | 0–3 s | Toàn cảnh, đứng yên |
/// | 2 | Thở (hồi sức dần) | 3 s → cảnh 3 | Trôi rất chậm vào trung cảnh |
/// | 3 | Liếc tạ "lại là mày à", thở dài | 6 s (nếu đủ dài) | Lia nhẹ theo ánh mắt về phía tạ |
/// | 4 | Nhìn bạn, ấm lên | → 12 s cuối | Trung cảnh, Koa quay về máy |
/// | 5 | Quyết định, đứng dậy | 12 s cuối → 3 s cuối | Đẩy vào cận mặt, chậm |
/// | 6 | Nắm tạ, đếm ngược, nhấc | 3 s cuối → 0 | CẮT sang máy thấp toàn thân (cú cắt duy nhất) |
///
/// Mặt là `KoaFaceRig` đổi dần (mắt dẫn, mày rồi miệng theo sau), không thay cả mặt.
public enum KoaRestStory {
  public enum Beat: String, Sendable { case drop, recover, sideEye, lookAtYou, decide, countdown, go, paused }
  public enum Caption: String, Sendable { case inhale, exhale, getReady, go, paused }

  /// Máy quay 2D: độ phóng, tâm phóng dọc (0 = mặt, 1 = chân), lia ngang (phần chiều rộng, dương = sang phải),
  /// nghiêng (độ).
  public struct Camera: Sendable, Hashable {
    public var zoom = 1.0
    public var anchor = 0.75
    public var tilt = 0.0
    public var dy = 0.0
    public var dx = 0.0
    public init(zoom: Double = 1, anchor: Double = 0.75, tilt: Double = 0, dy: Double = 0, dx: Double = 0) {
      self.zoom = zoom; self.anchor = anchor; self.tilt = tilt; self.dy = dy; self.dx = dx
    }
    static func mix(_ a: Camera, _ b: Camera, _ k: Double) -> Camera {
      func l(_ x: Double, _ y: Double) -> Double { x + (y - x) * k }
      return Camera(zoom: l(a.zoom, b.zoom), anchor: l(a.anchor, b.anchor), tilt: l(a.tilt, b.tilt), dy: l(a.dy, b.dy),
                    dx: l(a.dx, b.dx))
    }
  }

  public struct Moment: Sendable {
    /// Thân (rig đứng: tay, nhún, quay); `sx`/`sy` nén / giãn cả hình; `look`/`eyes` ánh nhìn.
    public var frame: KoaPerformance.Frame
    /// Đứng (`idle`) hay ngồi (`relaxing`).
    public var pose: KoaFlags.Pose
    /// Mặt có tham số.
    public var face: KoaFaceRig
    public var beat: Beat
    public var caption: Caption?
    /// Hít vào 0 → 1 (vòng thở trên màn, cảnh 2).
    public var breath: Double
    public var hand: String?
    public var dumbbellOnFloor: Bool
    public var camera: Camera
  }

  public static let dropMs = 3000.0
  public static let sideEyeMs = 6000.0
  public static let countdownSeconds = 3.0
  public static let minFaceMs = 900.0
  /// Cảnh 3 chỉ có khi phần giữa (sau cảnh 1, trước cảnh 5) dài ít nhất chừng này.
  public static let sideEyeMinGap = 16_000.0
  public static let dozeAfterMs = 8000.0

  /// Cảnh 5 bắt đầu ở chừng này giây cuối: 12 s, nghỉ ngắn thì một phần ba.
  public static func readySeconds(total: Double) -> Double { min(12, max(countdownSeconds + 2, total / 3)) }

  static let wide = Camera(zoom: 1.0, anchor: 0.75)
  static let medium = Camera(zoom: 1.14, anchor: 0.58)
  static let closeUp = Camera(zoom: 1.5, anchor: 0.28)
  static let low = Camera(zoom: 1.04, anchor: 0.95)

  /// Mốc của câu chuyện theo tổng quãng nghỉ (ms từ lúc mở).
  struct Plan {
    let ready: Double
    let sideEye: Double?
    let lookAtYou: Double
    init(total: Double) {
      ready = KoaRestStory.readySeconds(total: total) * 1000
      let gapEnd = max(dropMs, total * 1000 - ready)
      let gap = gapEnd - dropMs
      if gap >= sideEyeMinGap {
        let s = dropMs + 0.35 * gap
        sideEye = s
        lookAtYou = s + sideEyeMs
      } else {
        sideEye = nil
        lookAtYou = dropMs + max(0, gap * 0.4)
      }
    }
    /// Hồi sức của cảnh 2, 0 → 1.
    func recovered(_ e: Double) -> Double {
      KoaRestStory.ease((e - dropMs) / max(8000, ((sideEye ?? lookAtYou) - dropMs) * 0.9))
    }
  }

  /// - Parameters:
  ///   - elapsed: ms từ lúc màn nghỉ mở.
  ///   - left: ms còn lại của đồng hồ nghỉ (đang dừng: số đóng băng; quá giờ: âm).
  ///   - total: giây của cả quãng nghỉ.
  ///   - pausedFor: đang dừng thì đã dừng bao lâu (ms); `nil` = đang chạy.
  public static func at(elapsed e: Double, left: Double, total: Double, pausedFor: Double? = nil) -> Moment {
    let plan = Plan(total: total)
    var m: Moment
    if left <= plan.ready, e >= dropMs {
      // cảnh 5 / 6 bắt đầu khi đồng hồ còn `ready` — lúc ấy (theo elapsed) là `e + left − ready`
      let start = max(dropMs, e + left - plan.ready)
      m = endgame(t: e - start, left: left, from: story(start, plan))
    } else {
      m = story(e, plan)
    }
    if let p = pausedFor { m = paused(p, from: m) }
    return m
  }

  /// Cảnh 1–4 (theo thời gian đã nghỉ).
  static func story(_ e: Double, _ plan: Plan) -> Moment {
    var f = KoaPerformance.Frame()
    f.walk.flipRaisedArms = true
    if e < dropMs { return drop(e, f) }

    // ngồi: thở. Nhịp thở chậm dần theo hồi sức (dốc 1,2 s → êm 6 s); thân phồng theo nhịp.
    let rec = plan.recovered(e)
    let breath = breathing(e - dropMs, rec)
    // nối liền với cú ngồi của cảnh 1: lò xo còn lại tắt hẳn trong 600 ms đầu
    let land = drop(dropMs, f).frame
    let w = ease((e - dropMs) / 600)
    f.sx = land.sx + (1 + (0.012 + 0.018 * (1 - rec)) * breath - land.sx) * w
    f.sy = land.sy + (1 + (0.01 + 0.02 * (1 - rec)) * breath - land.sy) * w
    f.look = (0, 0.3 * (1 - rec))
    f.eyes = f.look
    var face = KoaFaceRig.mix(.spent, .rested) { c in
      // mắt mở lại trước, miệng khép sau cùng
      c == .lids ? min(1, rec * 1.2) : c == .brows ? rec : ease((rec - 0.15) / 0.85)
    }
    face.sweat = rec < 0.6 ? 1 : 0
    var cam = Camera.mix(wide, medium, ease((e - dropMs) / max(1, plan.lookAtYou + 4000 - dropMs)))
    var beat = Beat.recover
    var caption: Caption?
    if rec > 0.35 { caption = breathing(e - dropMs + 30, rec) >= breath ? .inhale : .exhale }

    let restFace = face
    if let s = plan.sideEye, e >= s, e < plan.lookAtYou {
      // cảnh 3: mắt liếc xuống tạ trước, đầu theo sau, rồi mặt "lại là mày à"; thở dài; nhìn đi chỗ khác
      let t = e - s
      let eyesTo = ease(t / 220) * (1 - ease((t - 4700) / 500))
      let headTo = ease((t - 200) / 500) * (1 - ease((t - 4800) / 700))
      f.eyes = (1.0 * eyesTo, f.look.y + (1.0 - f.look.y) * eyesTo)
      f.look = (0.6 * headTo, f.look.y + (0.5 - f.look.y) * headTo)
      face = KoaFaceRig.at(t, [.init(0, restFace), .init(450, .unimpressed, ms: 700), .init(3000, .sigh, ms: 900),
                               .init(4900, restFace, ms: 1000)])
      // thở dài: phồng lên rồi xẹp, vai sụp
      f.sy *= 1 + 0.035 * bump(t, 3000, 4400) - 0.02 * bump(t, 4000, 4900)
      cam.dx = 0.05 * bump(t, 200, 5000, edge: 900)
      beat = .sideEye
      caption = nil
    } else if e >= plan.lookAtYou {
      // cảnh 4: ngẩng lên nhìn bạn (Koa quay 3/4 về máy), ấm lên; gật nhẹ; rồi nghỉ yên
      let t = e - plan.lookAtYou
      let up = ease(t / 500)
      f.look = (0, f.look.y * (1 - up) - 0.05 * up + 0.18 * bump(t, 1300, 2100))
      f.turn = 0.25 * (1 - ease(t / 900))
      face = KoaFaceRig.at(t, [.init(0, restFace), .init(250, .warm, ms: 900), .init(3600, .content, ms: 1400)])
      // nghỉ yên lâu: cứ ~14 s một cú gật / mỉm nhỏ, không làm trò
      if t > 6000 {
        let q = (t - 6000).truncatingRemainder(dividingBy: 14_000)
        f.look.y += 0.12 * bump(q, 9000, 9800)
        face = KoaFaceRig.mix(face, .warm, 0.6 * bump(q, 8800, 11_000, edge: 700))
      }
      f.eyes = f.look
      beat = .lookAtYou
      caption = nil
    }
    return Moment(frame: f, pose: .relaxing, face: face, beat: beat, caption: caption, breath: breath, hand: nil,
                  dumbbellOnFloor: true, camera: cam)
  }

  /// Cảnh 1: rep cuối run tay → hạ tạ → tạ chạm sàn → lấy đà ngồi phịch xuống cạnh nó → nảy, lắng.
  static func drop(_ e: Double, _ base: KoaPerformance.Frame) -> Moment {
    var f = base
    let lower = ease((e - 350) / 750)
    let tremble = e < 450 ? 2.2 * sin(e / 13) : 0
    f.walk.armRight = -(8 + 82 * (1 - lower)) + tremble
    f.walk.armLeft = 4 + 4 * (1 - lower)
    f.look = (0.1 * (1 - lower), -0.3 * (1 - lower) + 0.3 * lower)
    f.eyes = f.look
    let sitting = e >= 1550
    if !sitting {
      // lấy đà: nén xuống trước khi ngồi
      let crouch = ease((e - 1200) / 350)
      f.sx = 1 + 0.07 * crouch; f.sy = 1 - 0.1 * crouch
      f.walk.bob = -3 * crouch
    } else {
      // vừa ngồi: còn nén, nảy lên, lắng (lò xo tắt dần)
      let u = e - 1550
      let k = -0.1 * exp(-u / 160) * cos(u / 70)
      f.sx = 1 - 0.7 * k; f.sy = 1 + k
      f.walk = KoaWalk.Pose()
    }
    let face = KoaFaceRig.at(e, [.init(0, .strain), .init(1050, .spent, ms: 800)])
    return Moment(frame: f, pose: sitting ? .relaxing : .idle, face: face, beat: .drop, caption: nil, breath: 0,
                  hand: e < 1100 ? "dumbbell" : nil, dumbbellOnFloor: e >= 1100, camera: wide)
  }

  /// Cảnh 5 + 6: `t` ms từ đầu cảnh 5.
  static func endgame(t: Double, left: Double, from s: Moment) -> Moment {
    var m = s
    let cd = countdownSeconds * 1000
    let standAt = 3600.0
    var f = s.frame
    // cảnh 5: nhìn tạ lần nữa (mắt trước) → mặt cân nhắc → quyết tâm, hít một hơi sâu → lấy đà, đứng dậy
    let look = ease(t / 300) * (1 - ease((t - 1400) / 400))
    f.eyes = (s.frame.eyes.x + (0.9 - s.frame.eyes.x) * look, s.frame.eyes.y + (0.8 - s.frame.eyes.y) * look)
    f.look = (0.2 * ease(t / 500) * (1 - ease((t - 1500) / 500)), s.frame.look.y * (1 - ease(t / 800)))
    f.turn = s.frame.turn * (1 - ease(t / 600))
    var face = KoaFaceRig.at(t, [.init(0, s.face), .init(300, .consider, ms: 700), .init(1500, .determined, ms: 800)])
    f.sy = s.frame.sy + 0.04 * bump(t, 2000, 3100)
    var pose = s.pose
    var hand: String?
    var floor = true
    if t >= standAt - 350, t < standAt {
      let k = ease((t - standAt + 350) / 350)
      f.sx = s.frame.sx + 0.06 * k; f.sy = s.frame.sy - 0.09 * k
    } else if t >= standAt {
      // đứng dậy, nắm tạ theo (vượt đà rồi lắng)
      let u = t - standAt
      let k = -0.09 * exp(-u / 150) * cos(u / 65)
      f = standing()
      f.sx = 1 - 0.7 * k; f.sy = 1 + k
      pose = .idle; hand = "dumbbell"; floor = false
    }
    // máy: đẩy vào cận mặt tới khi cảnh 6 bắt đầu (`left` = 3 s)
    let toCountdown = max(1, t + left - cd)
    var cam = Camera.mix(s.camera, closeUp, ease(t / toCountdown))
    var beat = Beat.decide
    var caption: Caption? = .getReady
    if left <= cd {
      // cảnh 6: CẮT sang máy thấp toàn thân. Mỗi giây siết tạ một nhịp; ở 0 nhấc tạ.
      if pose != .idle { f = standing(); pose = .idle; hand = "dumbbell"; floor = false }
      let into = 1 - (max(0, left) / 1000).truncatingRemainder(dividingBy: 1)
      let squeeze = sin(into * .pi)
      f.walk.armRight = -8 - 6 * squeeze
      f.walk.bob = -1.5 * squeeze
      f.sx = 1 + 0.015 * squeeze; f.sy = 1 - 0.02 * squeeze
      f.look = (0, -0.1); f.eyes = f.look
      cam = low
      beat = .countdown
      if left <= 0 {
        let k = ease(-left / 300)
        let u = max(0, -left - 300)
        let over = 0.08 * exp(-u / 160) * sin(u / 60)
        f.walk.armRight = -10 - 85 * k
        f.walk.armLeft = 5 + 16 * k
        f.walk.bob = 3 * k + 4 * over
        f.sx = 1; f.sy = 1 + over * 0.3
        f.look = (0, -0.25 * k); f.eyes = f.look
        face = KoaFaceRig.at(-left, [.init(0, .determined), .init(0, .strain, ms: 250)])
        cam = Camera.mix(low, Camera(zoom: 1.14, anchor: 0.95, tilt: 3), k)
        beat = .go; caption = .go
      }
    }
    m.frame = f; m.pose = pose; m.face = face; m.hand = hand; m.dumbbellOnFloor = floor; m.camera = cam
    m.beat = beat; m.caption = caption; m.breath = 0
    return m
  }

  static func standing() -> KoaPerformance.Frame {
    var f = KoaPerformance.Frame()
    f.walk.flipRaisedArms = true
    f.walk.armRight = -8
    f.walk.armLeft = 5
    f.look = (0, -0.05)
    f.eyes = f.look
    return f
  }

  /// Tạm dừng: nhìn bạn chờ; dừng lâu thì mí sụp dần, ngủ gật (liên tục, không cắt).
  static func paused(_ t: Double, from s: Moment) -> Moment {
    var m = s
    let w = ease(t / 600)
    let doze = ease((t - dozeAfterMs) / 4000)
    m.frame.look = (s.frame.look.x * (1 - w), s.frame.look.y * (1 - w) + 0.25 * doze)
    m.frame.eyes = m.frame.look
    let wait = KoaFaceRig.mix(s.face, .waiting) { c in
      ease((t - (c == .lids ? 0 : c == .brows ? KoaFaceRig.stagger : 2 * KoaFaceRig.stagger)) / 600)
    }
    m.face = KoaFaceRig.mix(wait, .doze, doze)
    m.beat = .paused
    m.caption = .paused
    m.breath = 0
    return m
  }

  // MARK: phụ

  /// Nhịp thở 0 → 1 → 0: chu kỳ dài dần theo hồi sức (1,2 s → 6 s).
  static func breathing(_ t: Double, _ rec: Double) -> Double {
    let period = 1200 + 4800 * rec
    let avg = (1200 + period) / 2
    let phase = (t / avg).truncatingRemainder(dividingBy: 1)
    return 0.5 - 0.5 * cos(phase * 2 * .pi)
  }

  static func clamp(_ x: Double) -> Double { min(1, max(0, x)) }
  static func ease(_ p: Double) -> Double { KoaReaction.ease(clamp(p)) }
  /// Lên trong `edge` đầu, giữ, xuống trong `edge` cuối của [a, b]; ngoài khoảng là 0.
  static func bump(_ t: Double, _ a: Double, _ b: Double, edge: Double? = nil) -> Double {
    let e = edge ?? (b - a) / 2
    return min(ease((t - a) / e), ease((b - t) / e))
  }
}
