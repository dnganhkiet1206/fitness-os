import ASCNDCore
import SwiftUI

/// Đoạn diễn Koa sửa đồ trong phòng (`KoaRepairScene`, storyboard Kiệt duyệt 06–07/11). Vẽ trên lớp sân
/// khấu (toạ độ phòng, chưa cộng `drop`): đồ vật của món đang sửa, Koa của cảnh (Koa của phòng nhường
/// chỗ trong lúc diễn), đồ cầm tay, chữ hiệu ứng, bóng thoại; phát tiếng đúng nhịp.
struct KoaRepairLayer: View {
  let item: KoaBreakage.Item
  let start: Date
  let shots: [KoaRepairScene.Shot]
  let cues: [KoaRepairScene.Cue]
  var equipped: [String] = []
  var build = 0
  var daytime = false
  let done: () -> Void
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  @State private var played = 0
  @State private var finished = false

  static let fps = 30.0

  static func shot(_ shots: [KoaRepairScene.Shot], at date: Date, start: Date) -> KoaRepairScene.Shot? {
    let i = Int(date.timeIntervalSince(start) * fps)
    return shots.isEmpty ? nil : shots[max(0, min(shots.count - 1, i))]
  }

  var body: some View {
    GeometryReader { g in
      let width = Double(g.size.width), k = width / StudioScene.width
      TimelineView(.animation(paused: reduceMotion)) { tl in   // cảnh không chạy khi Giảm chuyển động (MascotRoomView.startRepair)
        let t = tl.date.timeIntervalSince(start)
        if let s = Self.shot(shots, at: tl.date, start: start) {
          ZStack(alignment: .topLeading) {
            Canvas { ctx, _ in
              var c = ctx
              c.scaleBy(x: k, y: k)
              if item == .board { drawBoard(&c, s, t: t, behindKoa: true) }
              drawKoa(&c, s, k: k, t: t)
              if item == .board { drawBoard(&c, s, t: t, behindKoa: false) }
              for p in s.pops { drawPop(&c, p) }
            }
            if let b = s.bubble, !b.text.isEmpty {
              KoaBubble(line: b.text, width: g.size.width, x: s.x, headY: s.feet - KoaRoomMap.heroWidth * KoaMath.aspect * s.scale + 18)
                .opacity(b.alpha)
            }
          }
          .onChange(of: Int(t * Self.fps)) { play(upTo: t) }
        }
      }
    }
    .allowsHitTesting(false)
    .accessibilityHidden(true)
    .onChange(of: reduceMotion) { if reduceMotion { done() } }   // bật Giảm chuyển động giữa cảnh: trả phòng ngay
  }

  private func play(upTo t: Double) {
    while played < cues.count, cues[played].t <= t {
      KoaSound.cue(cues[played].name, volume: cues[played].volume)
      played += 1
    }
    if t >= Double(shots.count) / Self.fps, !finished {
      finished = true
      done()
    }
  }

  // MARK: - Koa

  private func options(_ s: KoaRepairScene.Shot, t: Double) -> KoaRender.Options {
    var o = KoaRender.Options()
    o.size = 240
    o.live = true
    o.t = t * 1000
    o.paper = daytime
    o.flat = daytime
    o.build = build
    o.worn = KoaEmotion.worn(equipped)
    o.expression = s.expression
    if let f = s.from { o.faceFrom = .init(expression: f, gesture: nil); o.faceMix = s.mix }
    o.mouth = s.mouth
    o.gaze = s.gaze
    o.gesture = s.gesture
    o.gestureAmount = s.gestureAmount
    o.blink = s.blink
    o.walk = s.pose
    return o
  }

  /// Koa: chân ở (x, feet + 6) như Koa của phòng (`hero`), nén / giãn quanh chân.
  private func drawKoa(_ c: inout GraphicsContext, _ s: KoaRepairScene.Shot, k: Double, t: Double) {
    let o = options(s, t: t)
    let sc = KoaRoomMap.heroWidth * s.scale / 240
    let foot = CGPoint(x: s.x, y: s.feet + 6)
    // bóng dưới chân
    let sw = KoaRoomMap.heroWidth * s.scale * 0.42
    c.fill(Path(ellipseIn: CGRect(x: foot.x - sw, y: foot.y - 4 * s.scale, width: sw * 2, height: 9 * s.scale)),
           with: .color(.black.opacity(0.16)))
    var f = c
    f.translateBy(x: foot.x, y: foot.y)
    f.scaleBy(x: sc * s.stretchX, y: sc * s.stretchY)
    f.translateBy(x: -120, y: -240 * KoaMath.aspect)
    KoaCanvas.draw(KoaPaint.plan(KoaRender.figure(o)), in: &f)
    if let prop = s.prop, let paw = KoaRender.paws(o).right {
      let p = CGPoint(x: foot.x + sc * s.stretchX * (paw.x - 120), y: foot.y + sc * s.stretchY * (paw.y - 240 * KoaMath.aspect))
      switch prop {
      case .plug: drawPlugCable(&c, end: p, inPaw: true)
      default: break
      }
    }
  }

  // MARK: - Bảng kỷ lục

  private func r(_ px: Double, _ py: Double) -> CGPoint {
    let q = KoaRepairScene.room(px, py)
    return CGPoint(x: q.x, y: q.y)
  }
  private func len(_ px: Double) -> Double { px / KoaRepairScene.pxPerUnit }

  private func drawBoard(_ c: inout GraphicsContext, _ s: KoaRepairScene.Shot, t: Double, behindKoa: Bool) {
    let B = KoaRepairScene.Board.self
    let b = s.board
    if behindKoa {
      let o = r(B.screenPx.x, B.screenPx.y)
      let rect = CGRect(x: o.x, y: o.y, width: len(B.screenPx.w), height: len(B.screenPx.h))
      let shape = Path(roundedRect: rect, cornerRadius: len(24))
      if let scan = b.scan {
        // khởi động: phần dưới vệt quét còn tối, vệt sáng chạy xuống
        let y = rect.minY + rect.height * scan
        var cc = c
        cc.clip(to: Path(CGRect(x: rect.minX, y: y, width: rect.width, height: rect.maxY - y)))
        cc.fill(shape, with: .color(Color(red: 0.02, green: 0.02, blue: 0.04).opacity(0.93)))
        c.fill(Path(roundedRect: CGRect(x: rect.minX + len(8), y: y - len(5), width: rect.width - len(16), height: len(10)), cornerRadius: len(5)),
               with: .color(Color(red: 0.75, green: 0.96, blue: 1).opacity(0.9)))
      } else if b.dark > 0 {
        c.fill(shape, with: .color(Color(red: 0.02, green: 0.02, blue: 0.04).opacity(0.93 * b.dark)))
      }
      if let seed = b.noise {
        var g = SplitMix(seed: UInt64(seed))
        for _ in 0..<7 {
          let y = rect.minY + len(10) + g.unit() * (rect.height - len(20))
          c.fill(Path(CGRect(x: rect.minX + len(14), y: y, width: rect.width - len(28), height: len(2 + 4 * g.unit()))),
                 with: .color(Color(red: 0.62, green: 0.91, blue: 1).opacity(0.2 + 0.35 * g.unit())))
        }
      }
      if let n = b.count {
        let q = r(B.numberPx.x, B.numberPx.y)
        c.fill(Path(CGRect(x: q.x - len(6), y: q.y - len(4), width: len(B.numberPx.w + 14), height: len(B.numberPx.h + 10))),
               with: .color(Color(red: 0.04, green: 0.05, blue: 0.1)))
        c.draw(Text(verbatim: "\(n)").font(.system(size: len(80), weight: .black)).foregroundStyle(Color(red: 1, green: 0.9, blue: 0.94)),
               at: CGPoint(x: q.x + len(B.numberPx.w), y: q.y + len(B.numberPx.h)), anchor: .bottomTrailing)
      }
      if b.glow > 0 {
        c.stroke(Path(roundedRect: rect.insetBy(dx: -len(16), dy: -len(16)), cornerRadius: len(34)),
                 with: .color(Color(red: 1, green: 0.44, blue: 0.66).opacity(0.8 * b.glow)), lineWidth: len(18 * b.glow))
      }
      // ổ cắm + dây (phích trong ổ, hoặc trên tay — khi đó vẽ sau Koa)
      let sk = r(B.socketPx.x, B.socketPx.y)
      c.fill(Path(roundedRect: CGRect(x: sk.x - len(24), y: sk.y - len(28), width: len(48), height: len(56)), cornerRadius: len(10)),
             with: .color(Color(red: 0.96, green: 0.93, blue: 0.89)))
      c.stroke(Path(roundedRect: CGRect(x: sk.x - len(24), y: sk.y - len(28), width: len(48), height: len(56)), cornerRadius: len(10)),
               with: .color(Color(red: 0.79, green: 0.73, blue: 0.65)), lineWidth: len(3))
      for dx in [-8.0, 8] { c.fill(Path(ellipseIn: CGRect(x: sk.x + len(dx) - len(4), y: sk.y - len(4), width: len(8), height: len(8))), with: .color(Color(red: 0.42, green: 0.38, blue: 0.34))) }
      if b.plugged { drawPlugCable(&c, end: sk, inPaw: false) }
      if b.spark > 0 { drawSpark(&c, at: sk, r: len(34) * b.spark) }
    }
  }

  private func drawPlugCable(_ c: inout GraphicsContext, end: CGPoint, inPaw: Bool) {
    let B = KoaRepairScene.Board.self
    let top = r(B.cableTopPx.x, B.cableTopPx.y), sk = r(B.socketPx.x, B.socketPx.y)
    var p = Path()
    p.move(to: top)
    p.addLine(to: CGPoint(x: top.x - len(6), y: top.y + len(96)))
    p.addQuadCurve(to: CGPoint(x: top.x - len(40), y: top.y + len(114)), control: CGPoint(x: top.x - len(12), y: top.y + len(112)))
    p.addLine(to: CGPoint(x: sk.x + len(40), y: top.y + len(114)))
    let sag = len(inPaw ? 20 : 60)
    p.addCurve(to: end, control1: CGPoint(x: sk.x + len(20), y: top.y + len(114)), control2: CGPoint(x: end.x + len(20), y: end.y + sag))
    c.stroke(p, with: .color(Color(red: 0.17, green: 0.17, blue: 0.2)), style: StrokeStyle(lineWidth: len(7), lineCap: .round, lineJoin: .round))
    let body = CGRect(x: end.x - len(14), y: end.y - len(16), width: len(28), height: len(32))
    c.fill(Path(roundedRect: body, cornerRadius: len(7)), with: .color(Color(red: 0.23, green: 0.23, blue: 0.27)))
    if inPaw {
      for dx in [-8.0, 4] { c.fill(Path(CGRect(x: end.x + len(dx), y: end.y + len(14), width: len(4), height: len(10))), with: .color(Color(red: 0.79, green: 0.7, blue: 0.48))) }
    }
  }

  // MARK: - Hiệu ứng

  private func drawSpark(_ c: inout GraphicsContext, at p: CGPoint, r: Double) {
    guard r > 0.2 else { return }
    var s = Path()
    let pts = (0..<8).map { i -> CGPoint in
      let a = Double(i) * .pi / 4 - .pi / 2, rr = i % 2 == 0 ? r : r * 0.25
      return CGPoint(x: p.x + cos(a) * rr, y: p.y + sin(a) * rr)
    }
    s.addLines(pts)
    s.closeSubpath()
    c.fill(s, with: .color(Color(red: 1, green: 0.84, blue: 0.29)))
  }

  private func drawPop(_ c: inout GraphicsContext, _ p: KoaRepairScene.Pop) {
    guard p.u > 0, p.u < 1 else { return }
    let scale = KoaRepairScene.backOut(min(1, p.u * 4)), o = 1 - KoaRepairScene.seg(p.u, 0.75, 1)
    var cc = c
    cc.opacity = o
    cc.translateBy(x: p.x, y: p.y)
    cc.rotate(by: .degrees(-8))
    cc.scaleBy(x: scale, y: scale)
    let text = Text(verbatim: p.text).font(.system(size: p.size, weight: .heavy))
    cc.draw(text.foregroundStyle(Color(red: 0.42, green: 0.29, blue: 0.06)), at: CGPoint(x: 0.6, y: 0.6), anchor: .bottomLeading)
    cc.draw(text.foregroundStyle(.white), at: .zero, anchor: .bottomLeading)
  }
}

/// Máy quay của đoạn diễn: đẩy vào / lùi ra quanh một điểm của phòng, nghiêng, rung — áp lên cả phòng.
struct KoaRepairCamera: ViewModifier {
  let camera: KoaRepairScene.Camera?
  let size: CGSize
  let drop: Double

  func body(content: Content) -> some View {
    if let cam = camera {
      let k = Double(size.width) / StudioScene.width
      let w = Double(size.width), h = Double(size.height), z = max(1, cam.zoom)
      // tâm khung trên màn, giữ trong khung để không lộ mép phòng
      let c = KoaRepairScene.shown(cam.x, cam.y)
      let fx = min(w - w / 2 / z, max(w / 2 / z, c.x * k))
      let fy = min(h - h / 2 / z, max(h / 2 / z, drop + c.y * k))
      content
        .scaleEffect(z, anchor: UnitPoint(x: fx / w, y: fy / h))
        .offset(x: w / 2 - fx + cam.shake * k * KoaRepairScene.zoom, y: h / 2 - fy + 0.5 * cam.shake * k * KoaRepairScene.zoom)
        .rotationEffect(.degrees(cam.roll))
    } else {
      content
    }
  }
}

/// Số ngẫu nhiên tất định cho nhiễu màn.
private struct SplitMix {
  var state: UInt64
  init(seed: UInt64) { state = seed &+ 0x9E37_79B9_7F4A_7C15 }
  mutating func unit() -> Double {
    state = state &+ 0x9E37_79B9_7F4A_7C15
    var z = state
    z = (z ^ (z >> 30)) &* 0xBF58_476D_1CE4_E5B9
    z = (z ^ (z >> 27)) &* 0x94D0_49BB_1331_11EB
    z ^= z >> 31
    return Double(z >> 11) / Double(1 << 53)
  }
}
