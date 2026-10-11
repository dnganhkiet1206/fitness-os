import ASCNDCore
import SwiftUI

/// Koa (#527, K3) — `KoaFigure` của RN @ fac9ac2, vẽ bằng `Canvas`.
///
/// Mỗi khung: `KoaRender.figure` (cây phần tử của RN ở thời điểm `t`) →
/// `KoaPaint.plan` (kế hoạch vẽ đã giải kiểu / dải màu / clip) → đổ vào
/// `GraphicsContext`. Đồng hồ chạy theo tốc độ màn hình (tối đa 60 khung / giây
/// như `FIGURE_FPS`), dừng khi Reduce Motion bật hay app ra nền — nhân vật GIỮ
/// khung đang có, không nhảy về t=0, như `reduceMotionSV` của RN. `animated: false` là khung
/// t=0 đứng yên (lưới, ô chọn).
struct KoaFigureView: View {
  var expression: KoaFlags.Expression = .happy
  var pose: KoaFlags.Pose = .idle
  /// Thử đồ — tư thế riêng của app, chồng lên `pose`.
  var dress = false
  var worn: KoaFlags.Worn = [:]
  /// Bề rộng; cao = rộng × 1,25.
  var size: CGFloat = 160
  var animated = true
  /// `nil` → theo theme: giấy trên nền sáng, đèn trên nền tối.
  var paper: Bool?

  @Environment(\.colorScheme) private var scheme
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Environment(\.scenePhase) private var scenePhase
  @State private var clock = KoaClock()

  var body: some View {
    let isPaper = paper ?? (scheme == .light)
    let running = animated && !reduceMotion && scenePhase == .active
    TimelineView(.animation(minimumInterval: 1.0 / 60, paused: !running)) { timeline in
      let t = animated ? clock.tick(timeline.date.timeIntervalSinceReferenceDate * 1000, running: running) : 0
      Canvas { ctx, canvas in
        var o = KoaRender.Options()
        o.expression = expression
        o.pose = pose
        o.dress = dress
        o.worn = worn
        o.live = animated
        o.paper = isPaper
        o.t = t
        let plan = KoaPaint.plan(KoaRender.figure(o))
        var c = ctx
        c.concatenate(KoaCanvas.affine(KoaPaint.viewport(width: canvas.width, height: canvas.height)))
        KoaCanvas.draw(plan, in: &c)
      }
    }
    .frame(width: size, height: size * KoaMath.aspect)
    .accessibilityHidden(true)
  }
}

/// Đồng hồ của nhân vật (`figure-clock.ts`): CỘNG DỒN thời gian đã chạy, nên
/// dừng (Reduce Motion, ra nền, rời màn) rồi chạy lại thì tiếp từ khung đang
/// giữ chứ không nhảy cóc. Không quan sát được — chỉ là ô nhớ giữa các khung.
@MainActor
final class KoaClock {
  private var clock = 0.0
  private var last = KoaMath.clockReset

  func tick(_ ms: Double, running: Bool) -> Double {
    // đang giữ: lượt chạy kế bắt đầu lại từ mốc của nó, như `last = CLOCK_RESET`
    guard running else {
      last = KoaMath.clockReset
      return clock
    }
    KoaMath.stepClock(clock: &clock, last: &last, t: ms, frameMs: 1000.0 / 60)
    return clock
  }
}

/// Đổ một kế hoạch `KoaPaint` vào `GraphicsContext`.
enum KoaCanvas {
  static func affine(_ m: KoaMath.Mat) -> CGAffineTransform {
    CGAffineTransform(a: m[0], b: m[1], c: m[2], d: m[3], tx: m[4], ty: m[5])
  }

  static func point(_ p: KoaPaint.Point) -> CGPoint { CGPoint(x: p.x, y: p.y) }

  static func path(_ segs: [KoaPaint.Segment]) -> Path {
    var p = Path()
    for s in segs {
      switch s {
      case .move(let a): p.move(to: point(a))
      case .line(let a): p.addLine(to: point(a))
      case .quad(let c, let a): p.addQuadCurve(to: point(a), control: point(c))
      case .cubic(let c1, let c2, let a): p.addCurve(to: point(a), control1: point(c1), control2: point(c2))
      case .close: p.closeSubpath()
      }
    }
    return p
  }

  static func gradient(_ stops: [KoaPaint.Stop], alpha: Double) -> Gradient {
    // SVG: một mốc đứng trước mốc trước nó thì lấy vị trí của mốc trước
    var last = 0.0
    return Gradient(
      stops: stops.map { s in
        last = max(last, s.offset)
        let c = s.colour
        return Gradient.Stop(color: Color(.sRGB, red: c.r, green: c.g, blue: c.b, opacity: c.a * alpha), location: last)
      })
  }

  /// Sơn một hình (đã ở toạ độ của chính nó) bằng một lớp sơn: tô hoặc nét.
  static func paint(
    _ ctx: inout GraphicsContext, _ p: Path, _ paint: KoaPaint.Paint, alpha: Double, bounds b: KoaPaint.Rect,
    stroke: StrokeStyle?, evenOdd: Bool
  ) {
    func apply(_ shading: GraphicsContext.Shading, _ c: inout GraphicsContext) {
      if let stroke {
        c.stroke(p, with: shading, style: stroke)
      } else {
        c.fill(p, with: shading, style: FillStyle(eoFill: evenOdd))
      }
    }
    switch paint {
    case .none:
      return
    case .colour(let c):
      apply(.color(Color(.sRGB, red: c.r, green: c.g, blue: c.b, opacity: c.a * alpha)), &ctx)
    case .gradient(.linear(let x1, let y1, let x2, let y2, let bbox, let stops)):
      let s = bbox ? CGPoint(x: b.x + x1 * b.width, y: b.y + y1 * b.height) : CGPoint(x: x1, y: y1)
      let e = bbox ? CGPoint(x: b.x + x2 * b.width, y: b.y + y2 * b.height) : CGPoint(x: x2, y: y2)
      apply(.linearGradient(gradient(stops, alpha: alpha), startPoint: s, endPoint: e), &ctx)
    case .gradient(.radial(let cx, let cy, let r, let bbox, let stops)):
      let g = gradient(stops, alpha: alpha)
      guard bbox else {
        apply(.radialGradient(g, center: CGPoint(x: cx, y: cy), startRadius: 0, endRadius: r), &ctx)
        return
      }
      // theo khung bao: một vòng trong hình vuông đơn vị, kéo theo khung — elip
      // khi khung không vuông, đúng như SVG
      guard b.width > 0, b.height > 0 else { return }
      if stroke != nil {
        let m = max(b.width, b.height)
        let center = CGPoint(x: b.x + cx * b.width, y: b.y + cy * b.height)
        apply(.radialGradient(g, center: center, startRadius: 0, endRadius: r * m), &ctx)
        return
      }
      var c = ctx
      c.clip(to: p, style: FillStyle(eoFill: evenOdd))
      c.concatenate(CGAffineTransform(a: b.width, b: 0, c: 0, d: b.height, tx: b.x, ty: b.y))
      c.fill(
        Path(CGRect(x: 0, y: 0, width: 1, height: 1)),
        with: .radialGradient(g, center: CGPoint(x: cx, y: cy), startRadius: 0, endRadius: r))
    }
  }

  static func cap(_ s: String) -> CGLineCap { s == "round" ? .round : s == "square" ? .square : .butt }
  static func join(_ s: String) -> CGLineJoin { s == "round" ? .round : s == "bevel" ? .bevel : .miter }

  static func shape(_ s: KoaPaint.Shape, in ctx: inout GraphicsContext) {
    let p = path(s.segments)
    let st = s.style
    let stroke = StrokeStyle(lineWidth: st.strokeWidth, lineCap: cap(st.lineCap), lineJoin: join(st.lineJoin))
    var c = ctx
    c.concatenate(affine(s.matrix))
    func both(_ c: inout GraphicsContext) {
      paint(&c, p, st.fill, alpha: st.fillOpacity, bounds: s.bounds, stroke: nil, evenOdd: st.evenOdd)
      if st.strokeWidth > 0 {
        paint(&c, p, st.stroke, alpha: st.strokeOpacity, bounds: s.bounds, stroke: stroke, evenOdd: st.evenOdd)
      }
    }
    if s.opacity >= 1 {
      both(&c)
    } else if s.opacity > 0 {
      // tô và nét chồng nhau thì phải mờ CẢ HÌNH một lần, không mờ từng lớp
      c.opacity *= s.opacity
      c.drawLayer { layer in both(&layer) }
    }
  }

  static func draw(_ ops: [KoaPaint.Op], in ctx: inout GraphicsContext) {
    for op in ops {
      switch op {
      case .shape(let s):
        shape(s, in: &ctx)
      case .group(let opacity, let clip, let inner):
        guard opacity > 0 else { continue }
        var c = ctx
        if let clip {
          var area = Path()
          for k in clip { area.addPath(path(k.segments), transform: affine(k.matrix)) }
          c.clip(to: area)
        }
        if opacity >= 1 {
          draw(inner, in: &c)
        } else {
          c.opacity *= opacity
          c.drawLayer { layer in draw(inner, in: &layer) }
        }
      }
    }
  }
}

#Preview {
  ScrollView {
    LazyVGrid(columns: [GridItem(.adaptive(minimum: 110))]) {
      ForEach(KoaFlags.Pose.allCases, id: \.self) { p in
        KoaFigureView(expression: .happy, pose: p, worn: [.head: "cap", .top: "tee"], size: 110)
      }
    }
  }
}
