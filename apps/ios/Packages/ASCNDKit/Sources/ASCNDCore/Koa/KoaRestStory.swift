import Foundation

/// Màn nghỉ giữa hai set có Koa (07/11, Kiệt: "thay cho phần đồng hồ đếm giờ nghỉ cũ… story phải có ý nghĩa,
/// biểu cảm không được nhanh quá").
///
/// Câu chuyện bám đồng hồ nghỉ thật, không phải một đoạn phim cố định:
/// 1. **Xong set** (`intro`, 4,2 s): rep cuối gồng đẩy tạ → hạ tạ thở "phù" → mệt, thở dốc (`KoaPerformance` `.set`).
/// 2. **Thở cùng bạn** (`breathe`): Koa hít vào 4 s (thân phồng, tai dựng, tay mở) / thở ra 4 s, chữ dẫn nhịp.
///    Mặt đi dần từ thở dốc → dễ chịu khi đã hồi sức một phần ba quãng nghỉ.
/// 3. **Chuẩn bị** (`ready`, `readySeconds` cuối): nắm chặt tạ, lắc vai, nhún tại chỗ, mắt tập trung vào người xem.
/// 4. **Đếm ngược** (`countdown`, 3 giây cuối): mỗi giây một cú nhún; hết giờ thì giơ tạ "Lên set!" (`go`).
/// Tạm dừng (`paused`): đứng thở chậm, tập trung chờ.
///
/// Mọi nét mặt giữ ít nhất `minFaceMs`; các đoạn hoà vào nhau (`blendMs`), không cắt.
public enum KoaRestStory {
  public enum Beat: String, Sendable { case intro, breathe, ready, countdown, go, paused }
  public enum Caption: String, Sendable { case inhale, exhale, getReady, go, paused }

  public struct Moment: Sendable {
    public var frame: KoaPerformance.Frame
    public var beat: Beat
    public var caption: Caption?
    /// Hít vào 0 → 1 (vòng thở trên màn).
    public var breath: Double
  }

  public static let introMs = KoaPerformance.duration(.set)
  public static let breathMs = 8000.0
  public static let blendMs = 700.0
  public static let minFaceMs = 900.0
  public static let countdownSeconds = 3.0

  /// Chuẩn bị từ chừng này giây cuối: 12 s, quãng nghỉ ngắn thì một phần ba.
  public static func readySeconds(total: Double) -> Double { min(12, max(countdownSeconds + 2, total / 3)) }

  /// - Parameters:
  ///   - elapsed: ms từ lúc màn nghỉ mở.
  ///   - left: ms còn lại của đồng hồ nghỉ (đang dừng: số đóng băng).
  ///   - total: giây của cả quãng nghỉ.
  ///   - pausedFor: đang dừng thì đã dừng bao lâu (ms); `nil` = đang chạy.
  public static func at(elapsed: Double, left: Double, total: Double, pausedFor: Double? = nil) -> Moment {
    let intro = KoaPerformance.frame(.set, at: min(elapsed, introMs))
    let tired = KoaPerformance.frame(.set, at: introMs)
    let introW = clamp((elapsed - introMs) / blendMs)
    let afterIntro = max(0, elapsed - introMs)

    let breathe = breathing(afterIntro, rested: 1 - left / max(1, total * 1000), from: tired)
    let readyAt = readySeconds(total: total) * 1000
    let readyW = clamp((readyAt - left) / blendMs)
    let ready = readying(readyAt - left, left: left, from: breathe.frame)

    var m: Moment
    if introW <= 0 && elapsed < introMs {
      m = Moment(frame: intro, beat: .intro, caption: nil, breath: 0)
    } else {
      // intro → thở
      var f = mix(tired, breathe.frame, introW)
      f.expression = introW < 1 ? tired.expression : breathe.frame.expression
      m = Moment(frame: f, beat: .breathe, caption: breathe.caption, breath: breathe.breath)
    }
    if left <= readyAt, elapsed >= introMs {
      var f = mix(m.frame, ready.frame, readyW)
      if readyW > 0.5 { f.expression = ready.frame.expression }
      m = Moment(frame: f, beat: ready.beat, caption: ready.caption, breath: m.breath * (1 - readyW))
    }
    if let pausedFor {
      let w = clamp(pausedFor / blendMs)
      let p = waiting(pausedFor, from: m.frame)
      var f = mix(m.frame, p, w)
      if w > 0.5 { f.expression = p.expression }
      m = Moment(frame: f, beat: .paused, caption: .paused, breath: m.breath * (1 - w))
    }
    return m
  }

  // MARK: các đoạn

  static func breathing(_ t: Double, rested: Double, from base: KoaPerformance.Frame) -> Moment {
    // 0 → 1 hít vào (4 s), 1 → 0 thở ra (4 s); đường cong sin cho êm
    let phase = (t / breathMs).truncatingRemainder(dividingBy: 1)
    let inhale = phase < 0.5
    let b = 0.5 - 0.5 * cos(phase * 2 * .pi)
    var f = base
    f.walk.bob = -3 * max(0, 1 - t / 2500) + 2.2 * b
    f.walk.lean = base.walk.lean * max(0, 1 - t / 2500)
    f.walk.sway = 0
    f.walk.armLeft = 2 + 7 * b
    f.walk.armRight = -(2 + 7 * b)
    f.walk.earLeft = 13 * max(0, 1 - t / 3000) - 6 * b
    f.walk.earRight = f.walk.earLeft
    f.walk.headLag = 0
    f.look = (0, 0.3 * max(0, 1 - t / 3000) - 0.15 * b)
    f.eyes = f.look
    f.sx = 1 + 0.018 * b
    f.sy = 1 + 0.012 * b
    f.zoom = 1
    // mặt: thở dốc tới khi hồi sức một phần ba (và ít nhất 2 vòng thở đầu), rồi dễ chịu
    f.expression = t < 2 * breathMs * 0.5 || rested < 0.34 ? .gymPant : .content
    return Moment(frame: f, beat: .breathe, caption: inhale ? .inhale : .exhale, breath: b)
  }

  static func readying(_ t: Double, left: Double, from base: KoaPerformance.Frame) -> Moment {
    var f = base
    let cd = countdownSeconds * 1000
    if left <= 0 {
      // hết giờ: giơ tạ lên "Lên set!"
      let k = clamp(-left / 350)
      f.walk.armRight = -10 - 85 * ease(k)
      f.walk.armLeft = 4
      f.walk.bob = 3 * ease(k)
      f.walk.flipRaisedArms = true
      f.expression = .grit
      f.sx = 1; f.sy = 1
      return Moment(frame: f, beat: .go, caption: .go, breath: 0)
    }
    // chuẩn bị: lắc vai hai nhịp, rồi nhún nhẹ tại chỗ; mắt nhìn thẳng người xem
    let shake = t < 1600 ? sin(t / 1600 * 4 * .pi) : 0
    let bounce = t >= 1600 ? 0.5 - 0.5 * cos((t - 1600) / 700 * 2 * .pi) : 0
    f.walk.bob = 1.5 * bounce
    f.walk.armLeft = 5 + 9 * max(0, shake)
    f.walk.armRight = -(5 + 9 * max(0, -shake))
    f.walk.sway = 0.6 * shake
    f.walk.earLeft = -3; f.walk.earRight = -3
    f.sx = 1 - 0.008 * bounce; f.sy = 1 + 0.01 * bounce
    f.look = (0, -0.05)
    f.eyes = f.look
    f.expression = .gymFocus
    guard left <= cd else { return Moment(frame: f, beat: .ready, caption: .getReady, breath: 0) }
    // đếm ngược: mỗi giây một cú nhún (nén đầu giây, bật giữa giây), hoà từ dáng chuẩn bị trong 300 ms
    var c = f
    let into = 1 - (left / 1000).truncatingRemainder(dividingBy: 1)
    let hop = sin(into * .pi)
    c.walk.bob = 4 * hop
    c.walk.sway = 0
    c.sx = 1 - 0.01 * hop; c.sy = 1 + 0.02 * hop
    c.walk.armLeft = 6 + 6 * hop
    c.walk.armRight = -(6 + 6 * hop)
    c.walk.earLeft = -6 * hop; c.walk.earRight = -6 * hop
    c.look = (0, -0.1)
    c.eyes = c.look
    let m = mix(f, c, clamp((cd - left) / 300))
    return Moment(frame: m, beat: .countdown, caption: .getReady, breath: 0)
  }

  static func waiting(_ t: Double, from base: KoaPerformance.Frame) -> KoaPerformance.Frame {
    var f = base
    let b = 0.5 - 0.5 * cos(t / 6000 * 2 * .pi)
    f.walk.bob = 1.2 * b
    f.walk.armLeft = 3; f.walk.armRight = -3
    f.walk.sway = 0
    f.walk.earLeft = 2; f.walk.earRight = 2
    f.sx = 1 + 0.01 * b; f.sy = 1 + 0.008 * b
    f.look = (0, 0)
    f.eyes = f.look
    f.expression = .gymFocus
    return f
  }

  // MARK: phụ

  static func clamp(_ x: Double) -> Double { min(1, max(0, x)) }
  static func ease(_ p: Double) -> Double { KoaReaction.ease(clamp(p)) }

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
