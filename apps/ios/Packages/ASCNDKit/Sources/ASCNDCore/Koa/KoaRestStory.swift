import Foundation

/// Màn nghỉ giữa hai set có Koa (07/11, Kiệt: "thay cho phần đồng hồ đếm giờ nghỉ cũ"; lần 2: "storyboard chưa đạt,
/// tham khảo các nguồn, biểu cảm, góc quay khác mới mẻ hơn").
///
/// Lần 2 kể đúng việc người ta làm khi nghỉ giữa hiệp, mỗi đoạn một góc máy và một đạo cụ có sẵn trong tủ đồ:
///
/// | Đoạn | Khi nào | Koa | Máy |
/// |---|---|---|---|
/// | `setDown` | 0–2,4 s | Gồng nốt rep (nghiến răng) → hạ tạ "> <" → đặt tạ xuống sàn, thở "phù" | Thấp, cận nửa người → lùi ra |
/// | `wipe` | 2,4–6,6 s | Cầm khăn lau mồ hôi trán, thở hổn hển lè lưỡi | Trung cảnh, Koa quay 3/4 |
/// | `drink` | 6,6–11,6 s (nghỉ ≥ 40 s) | Bóp bình nước tu từ trên cao, nhắm mắt; "ahh" cười tít | Cận, nghiêng nhẹ |
/// | `breathe` | phần còn lại | Nhắm mắt thở theo nhịp 4 s / 4 s; cứ ~10 s một cử chỉ: liếc đồng hồ, vẫy tai, nhìn bạn cười | Toàn cảnh, trôi rất chậm |
/// | `ready` | 12 s cuối | Nhặt tạ, thè lưỡi tập trung, lắc vai | Đẩy vào dần |
/// | `countdown` | 3 s cuối | Nhún mỗi giây, mặt gym tập trung | Thấp, nhịp đẩy mỗi giây |
/// | `go` | 0 s | Giơ tạ, nghiến răng | Thấp + nghiêng 3°, cận |
/// | `paused` | tạm dừng | Gãi đầu suy nghĩ; dừng lâu (> 8 s) thì ngủ gật | Toàn cảnh |
///
/// Nguồn tham khảo (ghi ở `docs/koa-v2/gallery/v9-reaction-storyboard/v15-rest-story/README.md`): Duolingo ghép
/// biến thể đầu × thân cho idle không lặp; idle game: thở rất nhỏ + cử chỉ một lần theo nhịp; máy thấp = anh hùng,
/// nghiêng = chao đảo. Mỗi nét mặt giữ ≥ `minFaceMs`; các đoạn hoà vào nhau (`blendMs`).
public enum KoaRestStory {
  public enum Beat: String, Sendable { case setDown, wipe, drink, breathe, ready, countdown, go, paused }
  public enum Caption: String, Sendable { case inhale, exhale, getReady, go, paused, hydrate, wipe }

  /// Máy quay 2D của khung Koa: độ phóng, tâm phóng dọc (0 = mặt, 1 = chân), nghiêng (độ), dời dọc (phần chiều cao).
  public struct Camera: Sendable, Hashable {
    public var zoom = 1.0
    public var anchor = 0.75
    public var tilt = 0.0
    public var dy = 0.0
    public init(zoom: Double = 1, anchor: Double = 0.75, tilt: Double = 0, dy: Double = 0) {
      self.zoom = zoom; self.anchor = anchor; self.tilt = tilt; self.dy = dy
    }
  }

  public struct Moment: Sendable {
    public var frame: KoaPerformance.Frame
    public var beat: Beat
    public var caption: Caption?
    /// Hít vào 0 → 1 (vòng thở trên màn).
    public var breath: Double
    /// Đồ trên tay: `dumbbell`, `towel`, `bottle` hoặc không.
    public var hand: String?
    /// Tạ đang nằm trên sàn cạnh Koa (đã đặt xuống, chưa nhặt lên).
    public var dumbbellOnFloor: Bool
    public var camera: Camera
  }

  public static let setDownMs = 2800.0
  public static let wipeMs = 4200.0
  public static let drinkMs = 5000.0
  public static let breathMs = 8000.0
  public static let blendMs = 600.0
  public static let minFaceMs = 900.0
  public static let countdownSeconds = 3.0
  /// Nghỉ ngắn hơn thì bỏ đoạn uống nước.
  public static let drinkMinSeconds = 40.0
  public static let dozeAfterMs = 8000.0

  /// Chuẩn bị từ chừng này giây cuối: 12 s, quãng nghỉ ngắn thì một phần ba.
  public static func readySeconds(total: Double) -> Double { min(12, max(countdownSeconds + 2, total / 3)) }

  /// - Parameters:
  ///   - elapsed: ms từ lúc màn nghỉ mở.
  ///   - left: ms còn lại của đồng hồ nghỉ (đang dừng: số đóng băng).
  ///   - total: giây của cả quãng nghỉ.
  ///   - pausedFor: đang dừng thì đã dừng bao lâu (ms); `nil` = đang chạy.
  public static func at(elapsed: Double, left: Double, total: Double, pausedFor: Double? = nil) -> Moment {
    let drinks = total >= drinkMinSeconds
    let wipeAt = setDownMs, drinkAt = wipeAt + wipeMs
    let breatheAt = drinks ? drinkAt + drinkMs : drinkAt
    // đoạn theo thời gian đã nghỉ, hoà sang đoạn sau trong `blendMs` đầu của nó
    var m: Moment
    if elapsed < wipeAt {
      m = setDown(elapsed)
    } else if elapsed < drinkAt {
      m = blend(setDown(wipeAt), wipe(elapsed - wipeAt), (elapsed - wipeAt) / blendMs)
    } else if drinks, elapsed < breatheAt {
      m = blend(wipe(wipeMs), drink(elapsed - drinkAt), (elapsed - drinkAt) / blendMs)
    } else {
      let from = drinks ? drink(drinkMs) : wipe(wipeMs)
      m = blend(from, breathe(elapsed - breatheAt), (elapsed - breatheAt) / blendMs)
    }
    // đoạn theo thời gian CÒN LẠI: chuẩn bị → đếm ngược → lên set (đè lên đoạn trên, hoà vào)
    let readyAt = readySeconds(total: total) * 1000
    if left <= readyAt, elapsed >= setDownMs {
      m = blend(m, ready(readyAt - left, left: left), (readyAt - left) / blendMs)
    }
    if let pausedFor { m = blend(m, paused(pausedFor), pausedFor / blendMs) }
    return m
  }

  // MARK: các đoạn

  static func base() -> KoaPerformance.Frame {
    var f = KoaPerformance.Frame()
    f.walk.flipRaisedArms = true
    f.expression = .content
    return f
  }

  /// Gồng nốt rep → hạ tạ "> <" → đặt tạ xuống, thở "phù". Máy thấp cận nửa người rồi lùi ra.
  static func setDown(_ t: Double) -> Moment {
    var f = base()
    let up = 1 - ease((t - 800) / 600)            // tay còn giơ tạ
    let tremble = t > 150 && t < 800 ? 2.5 * sin(t / 14) : 0
    f.walk.armRight = -(8 + 87 * up) + tremble
    f.walk.armLeft = 4 + 6 * up
    // hạ tạ: nén xuống, nảy nhẹ khi đặt tạ chạm sàn (~1300 ms)
    let squat = bump(t, 1200, 1700)
    f.walk.bob = -3 * squat + 1.5 * bump(t, 1700, 2100)
    f.sx = 1 + 0.035 * squat; f.sy = 1 - 0.045 * squat
    f.walk.earLeft = -5 * up + 8 * ease((t - 1500) / 600)
    f.walk.earRight = f.walk.earLeft
    f.look = (0.1 * up, -0.4 * up + 0.25 * ease((t - 1500) / 600))
    f.eyes = f.look
    f.expression = t < 900 ? .grit : t < 1800 ? .oof : .puff
    let cam = Camera(zoom: 1.32 - 0.32 * ease((t - 900) / 1500), anchor: 0.35 + 0.4 * ease((t - 900) / 1500), tilt: 0,
                     dy: 0.04 * (1 - ease((t - 900) / 1500)))
    return Moment(frame: f, beat: .setDown, caption: nil, breath: 0, hand: t < 1500 ? "dumbbell" : nil,
                  dumbbellOnFloor: t >= 1500, camera: cam)
  }

  /// Cầm khăn lau mồ hôi trán (hai lượt), thở hổn hển. Koa quay 3/4 về phía máy.
  static func wipe(_ t: Double) -> Moment {
    var f = base()
    let raise = bump(t, 500, 3300, edge: 450)      // khăn lên trán rồi hạ
    let rub = t > 950 && t < 2900 ? 9 * sin((t - 950) / 1950 * 4 * .pi) : 0
    f.walk.armRight = -(6 + 104 * raise) + rub * raise
    f.walk.armLeft = 5
    f.walk.bob = -1.5 + 1.2 * sin(t / 260) * (1 - raise * 0.5)  // thở dốc: nhịp ngắn
    f.walk.earLeft = 8 - 4 * raise; f.walk.earRight = f.walk.earLeft
    f.turn = 0.3 * ease(t / 700)
    f.look = (0.15, 0.15 - 0.25 * raise)
    f.eyes = f.look
    f.expression = .pant
    let cam = Camera(zoom: 1.0 + 0.14 * ease(t / 900), anchor: 0.45, tilt: 0, dy: 0)
    return Moment(frame: f, beat: .wipe, caption: raise > 0.3 ? .wipe : nil, breath: 0, hand: "towel",
                  dumbbellOnFloor: true, camera: cam)
  }

  /// Bóp bình nước tu từ trên cao (ngửa đầu, nhắm mắt), rồi "ahh" cười tít. Cận, máy nghiêng nhẹ.
  static func drink(_ t: Double) -> Moment {
    var f = base()
    let raise = bump(t, 300, 3300, edge: 500)
    f.walk.armRight = -(6 + 96 * raise)
    f.walk.armLeft = 4 + 4 * raise
    f.walk.bob = 1.2 * raise
    f.walk.earLeft = 4 - 6 * raise; f.walk.earRight = f.walk.earLeft
    f.turn = 0.3 - 0.3 * ease((t - 3300) / 700)
    f.look = (0.1, -0.5 * raise)
    f.eyes = f.look
    // nuốt: cổ họng nhún theo từng ngụm
    f.sy = 1 + 0.01 * raise * sin(t / 180)
    f.expression = t < 700 ? .pant : t < 3400 ? .warm : .grin
    let cam = Camera(zoom: 1.14 + 0.1 * raise, anchor: 0.3, tilt: -2.5 * raise, dy: 0.02 * raise)
    return Moment(frame: f, beat: .drink, caption: raise > 0.3 ? .hydrate : nil, breath: 0, hand: "bottle",
                  dumbbellOnFloor: true, camera: cam)
  }

  /// Nhắm mắt thở theo nhịp; cứ mỗi vòng thở thứ ba (~8 s) chen một cử chỉ: liếc đồng hồ / vẫy tai / nhìn bạn cười.
  static func breathe(_ t: Double) -> Moment {
    var f = base()
    let phase = (t / breathMs).truncatingRemainder(dividingBy: 1)
    let inhale = phase < 0.5
    let b = 0.5 - 0.5 * cos(phase * 2 * .pi)
    f.walk.bob = 2 * b
    f.walk.armLeft = 2 + 7 * b
    f.walk.armRight = -(2 + 7 * b)
    f.walk.earLeft = -5 * b; f.walk.earRight = -5 * b
    f.sx = 1 + 0.016 * b; f.sy = 1 + 0.012 * b
    f.look = (0, -0.12 * b)
    f.expression = .meditate
    // cử chỉ: vòng thở thứ 2 của mỗi 3 vòng, trọn vòng 8 s (đủ lâu cho mỗi nét mặt)
    let cycle = Int(t / breathMs)
    if cycle % 3 == 1 {
      let k = bump(phase, 0.08, 0.92, edge: 0.12)
      switch (cycle / 3) % 3 {
      case 0:  // liếc xuống đồng hồ
        f.look = (0.35 * k, 0.55 * k); f.expression = .thinking
      case 1:  // vẫy tai, nhìn quanh
        f.walk.earLeft = -5 * b + 14 * k * sin(phase * 6 * .pi); f.walk.earRight = -5 * b - 14 * k * sin(phase * 6 * .pi)
        f.look = (-0.35 * k * sin(phase * 2 * .pi), 0); f.expression = .happy
      default:  // nhìn thẳng người dùng, cười
        f.look = (0, 0); f.expression = .warm
        f.walk.armLeft = 2 + 24 * k                // vẫy nhẹ tay không cầm đồ
      }
    }
    f.eyes = f.look
    let cam = Camera(zoom: 1.0 + 0.025 * sin(t / 9000 * 2 * .pi), anchor: 0.75, tilt: 0, dy: 0)
    return Moment(frame: f, beat: .breathe, caption: inhale ? .inhale : .exhale, breath: b, hand: nil,
                  dumbbellOnFloor: true, camera: cam)
  }

  /// Nhặt tạ, thè lưỡi tập trung, lắc vai → đếm ngược nhún mỗi giây → lên set giơ tạ. Máy đẩy vào, hạ thấp dần.
  static func ready(_ t: Double, left: Double) -> Moment {
    var f = base()
    let cd = countdownSeconds * 1000
    let pick = bump(t, 0, 900, edge: 450)          // cúi nhặt tạ
    f.walk.bob = -3 * pick
    f.sx = 1 + 0.03 * pick; f.sy = 1 - 0.04 * pick
    let shake = t > 1100 && t < 2700 ? sin((t - 1100) / 1600 * 4 * .pi) : 0
    let bounce = t >= 2700 ? 0.5 - 0.5 * cos((t - 2700) / 700 * 2 * .pi) : 0
    f.walk.bob += 1.5 * bounce
    f.walk.armLeft = 5 + 10 * max(0, shake)
    f.walk.armRight = -(5 + 10 * max(0, -shake))
    f.walk.sway = 0.6 * shake
    f.walk.earLeft = -3; f.walk.earRight = -3
    f.look = (0, -0.05)
    f.expression = .focus
    var cam = Camera(zoom: 1.0 + 0.08 * ease(t / 6000), anchor: 0.6, tilt: 0, dy: 0)
    var beat = Beat.ready
    var caption: Caption? = .getReady
    if left <= 0 {
      let k = ease(-left / 350)
      f.walk.armRight = -10 - 85 * k
      f.walk.armLeft = 4 + 20 * k
      f.walk.bob = 3 * k
      f.walk.sway = 0
      f.sx = 1; f.sy = 1
      f.look = (0, -0.25 * k)
      f.expression = .grit
      cam = Camera(zoom: 1.08 + 0.1 * k, anchor: 0.92, tilt: 3 * k, dy: 0)
      beat = .go; caption = .go
    } else if left <= cd {
      let into = 1 - (left / 1000).truncatingRemainder(dividingBy: 1)
      let hop = sin(into * .pi)
      let w = min(1, max(0, (cd - left) / 300))
      f.walk.bob = f.walk.bob * (1 - w) + 4 * hop * w
      f.walk.sway *= 1 - w
      f.sx = 1 - 0.01 * hop * w; f.sy = 1 + 0.02 * hop * w
      f.walk.armLeft = 6 + 6 * hop
      f.walk.armRight = -(6 + 6 * hop)
      f.walk.earLeft = -6 * hop; f.walk.earRight = -6 * hop
      f.look = (0, -0.1)
      f.expression = .gymFocus
      // máy hạ thấp (neo ở chân) và đẩy một nhịp mỗi giây
      cam = Camera(zoom: 1.08 + 0.03 * hop * w, anchor: 0.6 + 0.3 * w, tilt: 0, dy: 0)
      beat = .countdown
    }
    f.eyes = f.look
    return Moment(frame: f, beat: beat, caption: caption, breath: 0, hand: t < 450 ? nil : "dumbbell",
                  dumbbellOnFloor: t < 450, camera: cam)
  }

  /// Tạm dừng: gãi đầu suy nghĩ; dừng lâu thì ngủ gật (đầu gục theo nhịp thở).
  static func paused(_ t: Double) -> Moment {
    var f = base()
    let doze = t > dozeAfterMs
    let b = 0.5 - 0.5 * cos(t / (doze ? 5000 : 6000) * 2 * .pi)
    f.walk.bob = (doze ? -1.5 : 0) + 1.2 * b
    let scratch = !doze && t > 400 && t < 3400 ? bump(t, 400, 3400, edge: 400) : 0
    f.walk.armLeft = 3 + 100 * scratch + 6 * scratch * sin(t / 90)
    f.walk.armRight = -3
    f.walk.earLeft = doze ? 10 : 2; f.walk.earRight = f.walk.earLeft
    f.walk.headLag = doze ? 1.2 * b : 0
    f.sx = 1 + 0.01 * b; f.sy = 1 + 0.008 * b
    f.look = doze ? (0, 0.35) : (0.2, -0.2)
    f.eyes = f.look
    f.expression = doze ? .sleepy : .thinking
    return Moment(frame: f, beat: .paused, caption: .paused, breath: 0, hand: nil, dumbbellOnFloor: true,
                  camera: Camera(zoom: 1.0, anchor: 0.75, tilt: 0, dy: 0))
  }

  // MARK: phụ

  static func clamp(_ x: Double) -> Double { min(1, max(0, x)) }
  static func ease(_ p: Double) -> Double { KoaReaction.ease(clamp(p)) }
  /// Lên trong `edge` đầu, giữ, xuống trong `edge` cuối của [a, b]; ngoài khoảng là 0.
  static func bump(_ t: Double, _ a: Double, _ b: Double, edge: Double? = nil) -> Double {
    let e = edge ?? (b - a) / 2
    return min(ease((t - a) / e), ease((b - t) / e))
  }

  static func blend(_ a: Moment, _ b: Moment, _ w: Double) -> Moment {
    guard w < 1 else { return b }
    guard w > 0 else { return a }
    let k = ease(w)
    func l(_ x: Double, _ y: Double) -> Double { x + (y - x) * k }
    var m = k < 0.5 ? a : b
    m.frame = mix(a.frame, b.frame, w)
    m.breath = l(a.breath, b.breath)
    m.camera = Camera(zoom: l(a.camera.zoom, b.camera.zoom), anchor: l(a.camera.anchor, b.camera.anchor),
                      tilt: l(a.camera.tilt, b.camera.tilt), dy: l(a.camera.dy, b.camera.dy))
    return m
  }

  static func mix(_ a: KoaPerformance.Frame, _ b: KoaPerformance.Frame, _ w: Double) -> KoaPerformance.Frame {
    let k = ease(w)
    func l(_ x: Double, _ y: Double) -> Double { x + (y - x) * k }
    var f = a
    f.walk.bob = l(a.walk.bob, b.walk.bob)
    f.walk.lean = l(a.walk.lean, b.walk.lean)
    f.walk.sway = l(a.walk.sway, b.walk.sway)
    f.walk.armLeft = l(a.walk.armLeft, b.walk.armLeft)
    f.walk.armRight = l(a.walk.armRight, b.walk.armRight)
    f.walk.earLeft = l(a.walk.earLeft, b.walk.earLeft)
    f.walk.earRight = l(a.walk.earRight, b.walk.earRight)
    f.walk.headLag = l(a.walk.headLag, b.walk.headLag)
    f.walk.earLag = l(a.walk.earLag, b.walk.earLag)
    f.walk.turn = l(a.walk.turn, b.walk.turn)
    f.walk.flipRaisedArms = a.walk.flipRaisedArms || b.walk.flipRaisedArms
    f.look = (l(a.look.x, b.look.x), l(a.look.y, b.look.y))
    f.eyes = (l(a.eyes.x, b.eyes.x), l(a.eyes.y, b.eyes.y))
    f.turn = l(a.turn, b.turn)
    f.sx = l(a.sx, b.sx); f.sy = l(a.sy, b.sy)
    f.air = l(a.air, b.air)
    f.zoom = l(a.zoom, b.zoom)
    f.focus = l(a.focus, b.focus)
    f.expression = k < 0.5 ? a.expression : b.expression
    return f
  }
}
