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
  /// Phần vẽ thêm phía trên mốc phòng (đơn vị phòng).
  static let above = 320.0

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
            // vẽ rộng lên trên mốc phòng: bảng neon nằm ở y < 0 (tranh khung dọc cao hơn phòng)
            Canvas { ctx, _ in
              var c = ctx
              c.translateBy(x: 0, y: Self.above * k)
              c.scaleBy(x: k, y: k)
              if item == .board { drawBoard(&c, s, t: t, behindKoa: true) }
              if item == .stage { drawStage(&c, s.stage) }
              if item == .floor { drawFloor(&c, s.floor, behindKoa: true) }
              var kc = c
              if item == .neon {                            // bảng neon vẽ ở tầng tường (`StudioTallRoom`): nằm trên mốc phòng
                if let l = s.neon.ladder {                  // vác: sau Koa (tay đỡ hai bên, không che mặt)
                  var lc = c
                  Self.wobble(&lc, s.neon.wobble)
                  drawLadder(&lc, l)
                  if s.neon.koaOnLadder { Self.wobble(&kc, s.neon.wobble) }
                }
              }
              drawKoa(&kc, s, k: k, t: t)
              if item == .floor { drawFloor(&c, s.floor, behindKoa: false) }
              if let p = s.stage.flyingTube {
                var f = c
                f.translateBy(x: p.x, y: p.y)
                f.rotate(by: .degrees(s.stage.flyingAngle))
                f.scaleBy(x: 0.6 / KoaRepairScene.pxPerUnit, y: 0.6 / KoaRepairScene.pxPerUnit)
                drawGlueTube(&f)
              }
              for p in s.puffs { drawPuff(&c, p) }
              for p in s.pops { drawPop(&c, p) }
            }
            .frame(width: g.size.width, height: g.size.height + Self.above * k)
            .offset(y: -Self.above * k)
            if let b = s.bubble, b.progress > 0 {
              KoaBubble(line: Self.typed(b), width: g.size.width, x: s.x, headY: s.feet - KoaRoomMap.heroWidth * KoaMath.aspect * s.scale + 18)
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

  /// Lời trong bóng thoại theo ngôn ngữ app, hiện dần theo nhịp của lời tiếng Việt.
  static func typed(_ b: KoaRepairScene.Bubble) -> String {
    let line = Bundle.main.localizedString(forKey: b.key, value: b.text, table: nil)
    return String(line.prefix(Int((Double(line.count) * b.progress).rounded(.up))))
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
    guard !s.hidden else { return }
    let o = options(s, t: t)
    let sc = KoaRoomMap.heroWidth * s.scale / 240, flip = s.flip ? -1.0 : 1.0
    let foot = CGPoint(x: s.x, y: s.feet + 6)
    // bóng dưới chân: nằm lại trên sàn khi Koa nhảy, nhỏ và nhạt đi theo độ cao
    let air = max(0, 1 - s.lift * KoaRepairScene.pxPerUnit / 400)
    let sw = KoaRoomMap.heroWidth * s.scale * 0.42 * air, ground = foot.y + s.lift
    if !s.neon.koaOnLadder {                               // trên thang: không có bóng trên sàn
      c.fill(Path(ellipseIn: CGRect(x: foot.x - sw, y: ground - 4 * s.scale * air, width: sw * 2, height: 9 * s.scale * air)),
             with: .color(.black.opacity(0.16 * air)))
    }
    var f = c
    f.translateBy(x: foot.x, y: foot.y)
    f.scaleBy(x: sc * s.stretchX * flip, y: sc * s.stretchY)
    f.translateBy(x: -120, y: -240 * KoaMath.aspect)
    KoaCanvas.draw(KoaPaint.plan(KoaRender.figure(o)), in: &f)
    if let prop = s.prop, let paw = KoaRender.paws(o).right {
      let p = CGPoint(x: foot.x + sc * s.stretchX * flip * (paw.x - 120), y: foot.y + sc * s.stretchY * (paw.y - 240 * KoaMath.aspect))
      switch prop {
      case .plug: drawPlugCable(&c, end: p, inPaw: true)
      case let .glue(angle, scale) where scale > 0:
        // tuýp trong hình 240 của Koa (storyboard vẽ ở hình 480: phóng 0,5), tay ôm ngoài tuýp
        var g = f
        g.translateBy(x: paw.x, y: paw.y + 10)
        g.rotate(by: .degrees(angle))
        g.scaleBy(x: 0.5 * scale, y: 0.5 * scale)
        drawGlueTube(&g)
        f.fill(Path(ellipseIn: CGRect(x: paw.x - 8.5, y: paw.y - 7, width: 17, height: 14)), with: .color(Color(red: 0.75, green: 0.78, blue: 0.81)))
      case let .hammer(angle, scale) where scale > 0:
        // búa trong hình 240 của Koa (storyboard vẽ ở hình 480)
        var g = f
        g.translateBy(x: paw.x, y: paw.y + 2)
        g.rotate(by: .degrees(angle))
        g.scaleBy(x: scale, y: scale)
        Self.drawHammer(&g)
        f.fill(Path(ellipseIn: CGRect(x: paw.x - 8.5, y: paw.y - 7, width: 17, height: 14)), with: .color(Color(red: 0.75, green: 0.78, blue: 0.81)))
      default: break
      }
    }
  }

  // MARK: - Bảng kỷ lục

  static func r(_ px: Double, _ py: Double) -> CGPoint {
    let q = KoaRepairScene.room(px, py)
    return CGPoint(x: q.x, y: q.y)
  }
  static func len(_ px: Double) -> Double { px / KoaRepairScene.pxPerUnit }
  private func r(_ px: Double, _ py: Double) -> CGPoint { Self.r(px, py) }
  private func len(_ px: Double) -> Double { Self.len(px) }

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

  // MARK: - Sân khấu

  /// Vết nứt dùng chung với lúc hỏng (`StudioBroken`), keo, vành đèn tắt một đoạn, đèn chạy, lấp lánh.
  private func drawStage(_ c: inout GraphicsContext, _ st: KoaRepairScene.StageState) {
    let S = KoaRepairScene.Stage.self, rim = StudioBroken.stage
    if st.darkRim > 0 { StudioBroken.darkRim(&c, opacity: st.darkRim) }
    if st.crackAlpha > 0, st.crack > 0 { StudioBroken.stageCrack(&c, opacity: st.crackAlpha) }
    let pts = S.crack
    if st.glue > 0, st.glueAlpha > 0 {
      let n = Double(pts.count - 1), x = st.glue * n, i = min(pts.count - 2, Int(x)), f = x - Double(i)
      var line = pts.prefix(i + 1).map { CGPoint(x: $0.x, y: $0.y - len(2)) }
      line.append(CGPoint(x: pts[i].x + (pts[i + 1].x - pts[i].x) * f, y: pts[i].y + (pts[i + 1].y - pts[i].y) * f - len(2)))
      var p = Path()
      p.addLines(line)
      var g = c
      g.opacity = st.glueAlpha
      g.stroke(p, with: .color(Color(red: 0.95, green: 0.96, blue: 0.98).opacity(0.9)), style: StrokeStyle(lineWidth: len(13), lineCap: .round, lineJoin: .round))
      g.stroke(p.offsetBy(dx: -len(2), dy: -len(3)), with: .color(.white), lineWidth: len(4))
    }
    if let s = st.stream {
      var p = Path()
      p.move(to: CGPoint(x: s.from.x, y: s.from.y))
      p.addQuadCurve(to: CGPoint(x: s.to.x, y: s.to.y - len(2)), control: CGPoint(x: s.from.x + len(3), y: (s.from.y + s.to.y) / 2))
      c.stroke(p, with: .color(Color(red: 0.95, green: 0.96, blue: 0.98).opacity(0.95)), style: StrokeStyle(lineWidth: len(7), lineCap: .round))
    }
    if let u = st.lights {
      let head = u * 2 * .pi * 1.5 + .pi / 2                // một vòng rưỡi, bắt đầu ở phía trước
      for k in 0..<28 {                                      // vệt sáng có đuôi (dày gấp đôi storyboard cho liền vệt)
        let a = head - Double(k) * 0.045, r = len(16 - Double(k) / 2)
        let x = rim.x + rim.rx * cos(a), y = rim.y + rim.ry * sin(a)
        c.fill(Path(ellipseIn: CGRect(x: x - r, y: y - r, width: 2 * r, height: 2 * r)),
               with: .color(Color(red: 1, green: 0.91, blue: 0.66).opacity((1 - Double(k) / 28) * st.lightsFade)))
      }
      c.stroke(Path(ellipseIn: CGRect(x: rim.x - rim.rx, y: rim.y - rim.ry, width: 2 * rim.rx, height: 2 * rim.ry)),
               with: .color(Color(red: 1, green: 0.83, blue: 0.43).opacity(0.35 * sin(.pi * u) * st.lightsFade)), lineWidth: len(10))
    }
    if let tw = st.twinkle {
      let spots: [(Double, Double, Double)] = [(-rim.rx + len(30), 0, 40), (rim.rx - len(30), 0, 40), (0, rim.ry, 36),
                                               (-len(250), -len(90), 30), (len(250), -len(90), 30)]
      for (i, p) in spots.enumerated() {
        let u = KoaRepairScene.seg(tw, Double(i) * 0.07, Double(i) * 0.07 + 1.6)
        if u > 0, u < 1 { drawSpark(&c, at: CGPoint(x: rim.x + p.0, y: rim.y + p.1), r: len(p.2) * sin(.pi * u)) }
      }
    }
  }

  // MARK: - Bảng neon

  /// Thang chao quanh chân thang (storyboard: `rotate(wob, LX, LBASE)`).
  static func wobble(_ c: inout GraphicsContext, _ deg: Double) {
    guard deg != 0 else { return }
    let N = KoaRepairScene.Neon.ladderPx, b = KoaRepairScene.room(N.x, N.base)
    c.translateBy(x: b.x, y: b.y)
    c.rotate(by: .degrees(deg))
    c.translateBy(x: -b.x, y: -b.y)
  }

  /// Góc phòng tối / ấm theo đèn, bảng tối + nứt (đúng hình lúc hỏng), viền bừng sáng, tia lửa chỗ búa chạm,
  /// lấp lánh, vệt gió khi Koa chạy vụt đi.
  static func drawNeon(_ c: inout GraphicsContext, _ n: KoaRepairScene.NeonState) {
    let N = KoaRepairScene.Neon.self
    let room = Path(CGRect(x: -40, y: -400, width: 470, height: 1400))
    let center = r(260, 560), radius = len(900)
    if n.dim > 0 {
      c.fill(room, with: .radialGradient(Gradient(colors: [Color(red: 0.11, green: 0.09, blue: 0.13).opacity(0.16 * n.dim), .clear]),
                                         center: center, startRadius: 0, endRadius: radius))
    }
    if n.warm > 0 {
      c.fill(room, with: .radialGradient(Gradient(colors: [Color(red: 1, green: 0.85, blue: 0.54).opacity(n.warm), .clear]),
                                         center: center, startRadius: 0, endRadius: radius))
    }
    var g = c
    g.translateBy(x: n.shake, y: 0)
    if n.broken > 0 { StudioBroken.neonBroken(&g, opacity: n.broken) }
    if n.glow > 0 {
      let o = r(N.signPx.x - 8, N.signPx.y - 8)
      g.stroke(Path(roundedRect: CGRect(x: o.x, y: o.y, width: len(N.signPx.w + 16), height: len(N.signPx.h + 16)), cornerRadius: len(46)),
               with: .color(Color(red: 1, green: 0.76, blue: 0.3).opacity(0.65 * n.glow)), lineWidth: len(12))
    }
    if let h = n.hit {
      let a = sin(.pi * n.hitU)
      drawSpark(&c, at: CGPoint(x: h.x, y: h.y), r: len(70) * a)
      drawSpark(&c, at: CGPoint(x: h.x + len(60), y: h.y + len(24)), r: len(34) * a)
    }
    if let tw = n.twinkle {
      for (i, p) in [(60.0, 360.0, 46.0), (510, 420, 38), (280, 330, 30), (470, 700, 30), (150, 720, 26)].enumerated() {
        let u = KoaRepairScene.seg(tw, Double(i) * 0.07, Double(i) * 0.07 + 1.6)
        if u > 0, u < 1 { drawSpark(&c, at: r(p.0, p.1), r: len(p.2) * sin(.pi * u)) }
      }
    }
    if let tw = n.roomTwinkle {
      for (i, p) in [(200.0, 520.0, 46.0), (1080, 620, 40), (250, 1500, 34), (1100, 1300, 34), (640, 1150, 30), (900, 900, 32)].enumerated() {
        let u = KoaRepairScene.seg(tw, Double(i) * 0.07, Double(i) * 0.07 + 1.6)
        if u > 0, u < 1 { drawSpark(&c, at: r(p.0, p.1), r: len(p.2) * sin(.pi * u)) }
      }
    }
    if let u = n.whoosh, u < 1 {
      let st = KoaRepairScene.stagePx
      for k in 0..<3 {
        let a = r(st.x + 120 + 200 * u, st.feet - 400 + 120 * Double(k))
        var line = Path()
        line.move(to: a)
        line.addLine(to: CGPoint(x: a.x - len(260 * (1 - u)), y: a.y))
        c.stroke(line, with: .color(.white.opacity(0.9 * (1 - u))), style: StrokeStyle(lineWidth: len(12), lineCap: .round))
      }
    }
  }

  /// Thang chữ A nhìn ngang (đơn vị px storyboard quanh khớp): chân sau, thanh giằng, chân trước có bậc, nóc.
  private func drawLadder(_ c: inout GraphicsContext, _ l: KoaRepairScene.Ladder) {
    let N = KoaRepairScene.Neon.self
    var g = c
    g.translateBy(x: l.hinge.x, y: l.hinge.y)
    g.rotate(by: .degrees(l.angle))
    g.scaleBy(x: 1 / KoaRepairScene.pxPerUnit, y: 1 / KoaRepairScene.pxPerUnit)
    let a = N.ladderPx.half * l.spread * .pi / 180, L = N.ladderPx.length
    let front = CGPoint(x: L * sin(a), y: L * cos(a)), back = CGPoint(x: -L * sin(a), y: L * cos(a))
    let gap = l.gap * (1 - l.spread), upright = abs(l.angle) < 0.01
    func rail(_ p: CGPoint, _ q: CGPoint, _ col: Color, _ w: Double) {
      var line = Path(); line.move(to: p); line.addLine(to: q)
      g.stroke(line, with: .color(Color(red: 0.48, green: 0.33, blue: 0.19)), style: StrokeStyle(lineWidth: w + 6, lineCap: .round))
      g.stroke(line, with: .color(col), style: StrokeStyle(lineWidth: w, lineCap: .round))
      g.stroke(line.offsetBy(dx: -4, dy: 0), with: .color(Color(red: 0.91, green: 0.76, blue: 0.56).opacity(0.7)), style: StrokeStyle(lineWidth: 4, lineCap: .round))
    }
    func foot(_ p: CGPoint, _ rx: Double) {
      if upright {
        g.fill(Path(ellipseIn: CGRect(x: p.x - rx - 16, y: p.y + 1, width: 2 * rx + 32, height: 14)), with: .color(Color(red: 0.35, green: 0.29, blue: 0.23).opacity(0.28)))
      }
      g.fill(Path(ellipseIn: CGRect(x: p.x - rx, y: p.y - 2, width: 2 * rx, height: 12)), with: .color(Color(red: 0.24, green: 0.24, blue: 0.27)))
    }
    let b0 = CGPoint(x: -gap, y: 0), b1 = CGPoint(x: back.x - gap, y: back.y)
    rail(b0, b1, Color(red: 0.72, green: 0.51, blue: 0.31), 16)
    foot(b1, 14)
    if l.spread > 0.3 {
      var brace = Path()
      brace.move(to: CGPoint(x: back.x * 0.58 - gap, y: back.y * 0.58)); brace.addLine(to: CGPoint(x: front.x * 0.58, y: front.y * 0.58))
      g.stroke(brace, with: .color(Color(red: 0.55, green: 0.55, blue: 0.59)), lineWidth: 5)
    }
    rail(.zero, front, Color(red: 0.81, green: 0.61, blue: 0.38), 18)
    foot(front, 15)
    for f in N.steps {
      let x = front.x * f, y = front.y * f
      if l.spread < 0.5 {                                   // gập: bậc nối hai chân như thang thường
        var rung = Path(); rung.move(to: CGPoint(x: x - gap - 2, y: y)); rung.addLine(to: CGPoint(x: x + 2, y: y))
        g.stroke(rung, with: .color(Color(red: 0.66, green: 0.45, blue: 0.24)), lineWidth: 10)
      } else {                                              // mở: mặt bậc nhô về phía người leo
        let tread = Path(roundedRect: CGRect(x: x - 6, y: y - 9, width: 66, height: 16), cornerRadius: 5)
        g.fill(tread, with: .color(Color(red: 0.79, green: 0.58, blue: 0.38)))
        g.stroke(tread, with: .color(Color(red: 0.48, green: 0.33, blue: 0.19)), lineWidth: 3)
      }
    }
    let cap = Path(roundedRect: CGRect(x: -52, y: -16, width: 104, height: 24), cornerRadius: 8)
    g.fill(cap, with: .color(Color(red: 0.85, green: 0.66, blue: 0.44)))
    g.stroke(cap, with: .color(Color(red: 0.48, green: 0.33, blue: 0.19)), lineWidth: 3)
    g.fill(Path(ellipseIn: CGRect(x: -6, y: -6, width: 12, height: 12)), with: .color(Color(red: 0.36, green: 0.25, blue: 0.15)))
  }

  // MARK: - Ván sàn

  private func drawFloor(_ c: inout GraphicsContext, _ f: KoaRepairScene.FloorState, behindKoa: Bool) {
    let F = KoaRepairScene.Floor.self
    if behindKoa {
      if f.hammerOnFloor {
        let h = r(F.hammerFloorPx.x, F.hammerFloorPx.y)
        var g = c
        g.translateBy(x: h.x, y: h.y)
        g.rotate(by: .degrees(-75))
        g.scaleBy(x: 0.7 / KoaRepairScene.pxPerUnit, y: 0.7 / KoaRepairScene.pxPerUnit)
        Self.drawHammer(&g)
      }
      StudioBroken.plank(&c, angle: f.angle)
      return
    }
    let nailY = r(0, F.pivotPx.y - 6).y
    if let x = f.nailX {                                   // đinh trước chân Koa, đúng chỗ mặt búa chạm (đo)
      let top = nailY - len(14 - 12 * f.nailSink)
      c.fill(Path(CGRect(x: x - len(3), y: top, width: len(6), height: nailY - top)), with: .color(Color(red: 0.55, green: 0.59, blue: 0.63)))
      c.fill(Path(ellipseIn: CGRect(x: x - len(9), y: top - len(3.5), width: len(18), height: len(7))), with: .color(Color(red: 0.66, green: 0.7, blue: 0.74)))
      if f.spark > 0 { drawSpark(&c, at: CGPoint(x: x, y: nailY - len(10)), r: len(18) * f.spark) }
    }
    if let tw = f.twinkle {
      let p = F.pivotPx
      for (i, s) in [(p.x - 200, p.y - 30, 30.0), (p.x - 60, p.y - 40, 26), (p.x - 130, p.y - 70, 22)].enumerated() {
        let u = KoaRepairScene.seg(tw, Double(i) * 0.07, Double(i) * 0.07 + 1.6)
        if u > 0, u < 1 { drawSpark(&c, at: r(s.0, s.1), r: len(s.2) * sin(.pi * u)) }
      }
    }
  }

  /// Búa (đơn vị storyboard; đầu búa ở (0, −128)).
  static func drawHammer(_ c: inout GraphicsContext) {
    c.fill(Path(roundedRect: CGRect(x: -7, y: -118, width: 14, height: 128), cornerRadius: 7), with: .color(Color(red: 0.69, green: 0.48, blue: 0.26)))
    c.fill(Path(roundedRect: CGRect(x: -7, y: -118, width: 5, height: 128), cornerRadius: 2), with: .color(Color(red: 0.79, green: 0.58, blue: 0.38)))
    c.fill(Path(roundedRect: CGRect(x: -44, y: -150, width: 88, height: 44), cornerRadius: 10), with: .color(Color(red: 0.49, green: 0.54, blue: 0.59)))
    c.fill(Path(roundedRect: CGRect(x: -44, y: -150, width: 88, height: 12), cornerRadius: 6), with: .color(Color(red: 0.64, green: 0.68, blue: 0.73)))
    c.fill(Path(roundedRect: CGRect(x: 34, y: -150, width: 12, height: 44), cornerRadius: 4), with: .color(Color(red: 0.37, green: 0.42, blue: 0.46)))
  }

  /// Tuýp keo khổng lồ (đơn vị storyboard; miệng ở (0, 36)).
  private func drawGlueTube(_ c: inout GraphicsContext) {
    var body = Path()
    body.addLines([CGPoint(x: -30, y: -150), CGPoint(x: 30, y: -150), CGPoint(x: 36, y: -10), CGPoint(x: -36, y: -10)])
    body.closeSubpath()
    c.fill(body, with: .color(Color(red: 0.95, green: 0.94, blue: 0.91)))
    c.stroke(body, with: .color(Color(red: 0.74, green: 0.71, blue: 0.66)), lineWidth: 4)
    let cap = Color(red: 0.89, green: 0.86, blue: 0.81)
    c.fill(Path(roundedRect: CGRect(x: -36, y: -158, width: 72, height: 14), cornerRadius: 4), with: .color(cap))
    c.fill(Path(roundedRect: CGRect(x: -26, y: -118, width: 52, height: 60), cornerRadius: 8), with: .color(Color(red: 0.96, green: 0.65, blue: 0.14)))
    c.draw(Text("koa.repair.glue").font(.system(size: 22, weight: .black)).foregroundStyle(.white), at: CGPoint(x: 0, y: -88))
    var tip = Path()
    tip.addLines([CGPoint(x: -14, y: -10), CGPoint(x: 14, y: -10), CGPoint(x: 6, y: 30), CGPoint(x: -6, y: 30)])
    tip.closeSubpath()
    c.fill(tip, with: .color(cap))
    c.fill(Path(ellipseIn: CGRect(x: -6, y: 30, width: 12, height: 12)), with: .color(.white))
  }

  private func drawPuff(_ c: inout GraphicsContext, _ p: KoaRepairScene.Puff) {
    guard p.u > 0, p.u < 1 else { return }
    for k in 0..<p.count {
      let a = Double(k) * 1.3 + 0.4, d = len(70 * KoaRepairScene.eout(p.u))
      let r = len(Double(16 + 8 * (k % 3)) * (0.6 + 0.8 * p.u))
      let x = p.x + cos(a) * d, y = p.y + sin(a) * d * 0.6 - len(60 * p.u)
      c.fill(Path(ellipseIn: CGRect(x: x - r, y: y - r, width: 2 * r, height: 2 * r)),
             with: .color(Color(red: 0.9, green: 0.84, blue: 0.75).opacity(0.75 * (1 - p.u))))
    }
  }

  // MARK: - Hiệu ứng

  private func drawSpark(_ c: inout GraphicsContext, at p: CGPoint, r: Double) { Self.drawSpark(&c, at: p, r: r) }
  static func drawSpark(_ c: inout GraphicsContext, at p: CGPoint, r: Double) {
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
    let text = Text(LocalizedStringKey(p.text)).font(.system(size: p.size, weight: .heavy))
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
