import ASCNDCore
import CoreMotion
import SwiftUI

/// Phòng Koa nhiều lớp (01/11): mỗi lớp của `StudioScene.layers` là một ảnh tĩnh, chỉ dịch
/// theo máy quay. `Equatable` ở từng lớp: đồng hồ sân khấu chạy mà lớp không đổi thì không vẽ lại.
struct StudioLayers: View {
  let options: StudioScene.Options
  /// Độ rung của chậu cây (chỉ lớp đồ trên sàn đổi theo).
  let plantSway: Double
  let shot: KoaParallax.Shot
  let size: CGSize
  let light: Bool
  /// Sương xa của tranh gốc; khung dọc tự vẽ tường nên không cần.
  var showsHaze = true

  private var k: Double { Double(size.width) / StudioScene.width }

  var body: some View {
    ZStack(alignment: .topLeading) {
      ForEach(StudioScene.layers) { layer in
        if showsHaze, layer.id == StudioScene.hazeBefore { haze }
        canvas(layer)
      }
    }
    .frame(width: size.width, height: size.height, alignment: .topLeading)
    .allowsHitTesting(false)
    .accessibilityHidden(true)
  }

  @ViewBuilder private func canvas(_ layer: StudioScene.Layer) -> some View {
    switch layer.kind {
    case .plain:
      image(layer).parallax(layer.plane, shot, k: k, anchor: anchor)
    case .props:
      image(layer, plantSway: plantSway).parallax(layer.plane, shot, k: k, anchor: anchor)
    case .floor:
      image(layer)
        .transformEffect(floorSkew)
        .parallaxLag(layer.plane)
    case .outside:
      // lớp ngoài trời trôi trong khung kính, khung kính đi cùng tường
      image(layer)
        .offset(x: (shot.shift(layer.plane.amp) - shot.shift(KoaParallax.Plane.wall.amp)) * k)
        .clipShape(WindowGlass())
        .parallax(.wall, shot, k: k, anchor: anchor)
    }
  }

  private func image(_ layer: StudioScene.Layer, plantSway: Double = 0) -> some View {
    var o = options
    o.plantSway = plantSway
    return StudioLayerImage(options: o, layer: layer.id).equatable()
      .frame(width: size.width, height: size.height)
  }

  /// Hàng sàn sát tường dịch như tường, hàng gần người xem dịch nhiều nhất.
  private var floorSkew: CGAffineTransform {
    let c = -shot.pan * KoaParallax.floorSlope
    let tx = shot.shift(KoaParallax.floorBack.amp) * k - c * KoaParallax.floorBack.y * k
    return CGAffineTransform(a: 1, b: 0, c: c, d: 1, tx: tx, ty: 0)
  }

  /// Sương xa: lớp không khí trước tường, làm tường lùi ra sau đồ trên sàn.
  private var haze: some View {
    let tint = light ? Color(red: 1, green: 0.97, blue: 0.9) : Color(red: 0.56, green: 0.51, blue: 1)
    let dense = light ? 0.16 : 0.07
    return LinearGradient(
      stops: [
        .init(color: tint.opacity(dense), location: 0), .init(color: tint.opacity(dense), location: 0.9),
        .init(color: tint.opacity(0), location: 1),
      ],
      startPoint: .top, endPoint: .bottom
    )
    .frame(width: size.width + 40, height: StudioScene.hazeBottom * k)
    .offset(x: -20)
    .parallax(.wall, shot, k: k, anchor: anchor)
  }

  private var anchor: UnitPoint {
    UnitPoint(x: 0.5, y: KoaParallax.anchorY * k / Double(size.height))
  }
}

/// Ảnh tĩnh của một lớp phòng.
private struct StudioLayerImage: View, Equatable {
  let options: StudioScene.Options
  let layer: String

  var body: some View {
    let plan = StudioPlans.layer(options, layer)
    Canvas { ctx, canvas in
      var c = ctx
      let k = canvas.width / StudioScene.width
      c.concatenate(CGAffineTransform(scaleX: k, y: k))
      KoaCanvas.draw(plan, in: &c)
    }
  }
}

/// Khung kính cửa sổ trong toạ độ phòng.
private struct WindowGlass: Shape {
  func path(in rect: CGRect) -> Path {
    let k = rect.width / StudioScene.width
    let w = StudioScene.window
    return Path(CGRect(x: w.x * k, y: w.y * k, width: w.width * k, height: w.height * k))
  }
}

extension View {
  /// Đặt view lên một tầng của máy quay.
  func parallax(_ plane: KoaParallax.Plane, _ shot: KoaParallax.Shot, k: Double, anchor: UnitPoint) -> some View {
    scaleEffect(shot.scale(plane.amp), anchor: anchor)
      .offset(x: shot.shift(plane.amp) * k)
      .parallaxLag(plane)
  }

  /// Cuộn trang: tầng xa trễ lại. `visualEffect` tính lúc cuộn, không dựng lại view.
  @ViewBuilder func parallaxLag(_ plane: KoaParallax.Plane) -> some View {
    if plane.lag == 0 {
      self
    } else {
      modifier(ParallaxLag(lag: plane.lag))
    }
  }
}

/// Máy quay của đoạn diễn sửa đồ dời cả phòng — khung trong vùng cuộn đổi theo, nên tắt độ trễ lúc diễn
/// (nếu không, tầng tường tưởng đang cuộn mà trôi lệch khỏi lớp diễn).
private struct ParallaxLag: ViewModifier {
  let lag: Double
  @Environment(\.koaCameraRolling) private var rolling

  func body(content: Content) -> some View {
    content.visualEffect { content, proxy in
      content.offset(y: rolling ? 0 : max(0, -proxy.frame(in: .scrollView(axis: .vertical)).minY) * lag)
    }
  }
}

extension EnvironmentValues {
  @Entry var koaCameraRolling = false
}

/// Độ nghiêng điện thoại, đọc từng khung theo đồng hồ của sân khấu.
@MainActor
final class KoaTiltSensor {
  private let motion = CMMotionManager()
  private var tilt = KoaParallax.Tilt()
  private var on = false
  #if DEBUG
    /// Soát trên simulator (không có con quay): `-koaSwing` lắc máy quay hai đầu đều đặn.
    private static let swing = ProcessInfo.processInfo.arguments.contains("-koaSwing")
  #endif

  /// Giá trị −1…1 của khung này.
  func read(_ dt: Double, at now: Double) -> Double {
    #if DEBUG
      if Self.swing { return sin(now * 1.2) }
    #endif
    if !on {
      guard motion.isDeviceMotionAvailable, !ProcessInfo.processInfo.isLowPowerModeEnabled else { return 0 }
      motion.deviceMotionUpdateInterval = 1.0 / 30
      motion.startDeviceMotionUpdates()
      on = true
    }
    if let m = motion.deviceMotion { tilt.step(dt, roll: m.attitude.roll) }
    return tilt.value
  }

  /// Rời màn / ra nền: tắt cảm biến. Lần sau lấy lại tư thế cầm làm giữa.
  func stop() {
    guard on else { return }
    motion.stopDeviceMotionUpdates()
    on = false
    tilt.reset()
  }
}

/// Phòng khung dọc theo mock đã duyệt (`StudioTall`): vẽ mới tường, cửa sổ, trời, thành phố, sàn và
/// đèn, mỗi thứ một tầng máy quay. Kệ, cây, bục, bảng số do `MascotStage` vẽ đè lên, nên đồ phòng đã
/// mua và đường đi của Koa giữ nguyên. Gác mái nằm bên phải; đi ngủ thì cả hai lia ngang cùng sân khấu.
struct StudioTallRoom: View {
  /// Tranh gốc hạ xuống bao nhiêu điểm.
  let drop: CGFloat
  let lens: KoaLens
  /// Món đang hỏng (`KoaBreakage`, cảnh A — Kiệt duyệt 06/11).
  var broken: KoaBreakage.Item?
  @Environment(\.colorScheme) private var scheme
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @AppStorage(KoaBedroomView.lampKey) private var lampOff = false
  @State private var motes = StudioMotes()

  var body: some View {
    GeometryReader { g in
      let width = g.size.width
      let asleep = lens.bedroom
      ZStack(alignment: .topLeading) {
        studio(g.size, paused: reduceMotion || asleep)
          .offset(x: asleep ? -width : 0)
        StudioAttic(light: scheme == .light, drop: Double(drop)).equatable()
          // tắt đèn tối cả phần gác mái: chỉ tranh tối thì lộ vệt ngang ở hai mép tranh
          .overlay {
            Color.black.opacity(lampOff ? KoaBedroom.lampOffDim(light: scheme == .light) : 0)
              .animation(reduceMotion ? nil : .easeInOut(duration: 0.25), value: lampOff)
          }
          .offset(x: asleep ? 0 : width)
        // mảng tường tiền cảnh của cảnh đi ngủ: sân khấu tự vẽ phần của nó, đây là phần trên và dưới
        let wall = KoaBedroom.wallColor(light: scheme == .light)
        let edge = KoaBedroom.wallEdge * width / StudioScene.width
        Color(hex: wall.body)
          .overlay(alignment: .leading) { Color(hex: wall.edge).frame(width: edge) }
          .overlay(alignment: .trailing) { Color(hex: wall.edge).frame(width: edge) }
          .frame(width: KoaBedtime.wall * width / StudioScene.width, height: g.size.height)
          .offset(x: asleep ? -(KoaBedtime.wall + 8) * width / StudioScene.width : width + 8)
      }
      .frame(width: width, height: g.size.height, alignment: .topLeading)
      .clipped()
      // cùng đường cong với sân khấu, để cả màn lia như một khung hình
      .animation(reduceMotion ? nil : .timingCurve(0.42, 0, 0.58, 1, duration: KoaBedtime.pan), value: asleep)
    }
    .allowsHitTesting(false)
    .accessibilityHidden(true)
  }

  private func studio(_ size: CGSize, paused: Bool) -> some View {
    let k = Double(size.width) / StudioScene.width
    let options = lens.options
    return TimelineView(.animation(minimumInterval: 1.0 / 30, paused: paused)) { timeline in
      let shot = lens.shot
      // truyền giờ vào: view con đọc đồng hồ tự nó thì SwiftUI thấy tham số không đổi, không vẽ lại
      let t = timeline.date.timeIntervalSinceReferenceDate
      ZStack(alignment: .topLeading) {
        // đèn đung đưa theo gió quanh điểm treo; chùm sáng và bụi trong chùm lắc cùng
        let swing = Angle.degrees(StudioTall.lampSway(at: t))
        let pivot = UnitPoint(
          x: StudioTall.lampPivot.x / StudioScene.width, y: (Double(drop) + StudioTall.lampPivot.y * k) / Double(size.height))
        ForEach(StudioTall.layers) { layer in
          let swings = layer.id == "cone" || layer.id == "lamp"
          StudioTallImage(options: options, layer: layer.id, drop: Double(drop)).equatable()
            .frame(width: size.width, height: size.height)
            .rotationEffect(swings ? swing : .zero, anchor: pivot)
            .offset(x: shot.shift(layer.plane.amp) * k)
          // đồ động chen đúng tầng: mây sau thành phố, đèn nhà trên thành phố, bụi trong chùm đèn
          if !reduceMotion, ["sky", "city", "lamp"].contains(layer.id) {
            StudioLive(
              t: t, layer: layer.id, night: !options.light, drop: Double(drop), k: k, lamp: options.lamp, dust: options.dust, box: motes)
              .frame(width: size.width, height: size.height)
              .rotationEffect(layer.id == "lamp" ? swing : .zero, anchor: pivot)
              .offset(x: shot.shift(layer.plane.amp) * k)
          }
          if layer.id == "wall", broken == .neon, let broken {
            StudioBroken(item: broken, t: reduceMotion ? 0 : t, drop: Double(drop), k: k)
              .frame(width: size.width, height: size.height)
              .offset(x: shot.shift(layer.plane.amp) * k)
          }
          if !reduceMotion, layer.id == "wall", !options.light, broken != .neon {
            StudioNeon(t: t, drop: Double(drop), k: k)
              .frame(width: size.width, height: size.height)
              .offset(x: shot.shift(layer.plane.amp) * k)
          }
        }
      }
      .scaleEffect(shot.zoom, anchor: UnitPoint(x: 0.5, y: (KoaParallax.anchorY * k + Double(drop)) / Double(size.height)))
    }
  }
}

/// Những thứ nhỏ làm phòng sống: mây trôi ngoài cửa sổ, đèn nhà bật tắt, bụi bay trong chùm đèn.
/// Vẽ thẳng bằng Canvas, không qua bộ dựng cảnh, nên nhẹ dù chạy mỗi khung.
private struct StudioLive: View {
  let t: Double
  let layer: String
  let night: Bool
  let drop: Double
  let k: Double
  let lamp: Bool
  /// Mức bụi của phòng 0…3: bụi xám lơ lửng khắp phòng, bẩn càng nhiều.
  var dust = 0
  let box: StudioMotes

  var body: some View {
    let motes = layer == "lamp" ? box.advance(t: t, dust: dust, lamp: lamp) : []
    Canvas { ctx, _ in
      var c = ctx
      c.translateBy(x: 0, y: drop)
      c.scaleBy(x: k, y: k)
      switch layer {
      case "sky":
        for (speed, y, r) in [(4.0, -40.0, 1.0), (2.6, 30.0, 0.7)] {
          let x = 150 + (t * speed).truncatingRemainder(dividingBy: 280)
          c.opacity = night ? 0.2 : 0.8
          for (dx, dy, w) in [(0.0, 0.0, 44.0), (26.0, -9.0, 38.0), (52.0, 0.0, 40.0)] {
            c.fill(
              Path(ellipseIn: CGRect(x: x + dx * r, y: y + dy * r, width: w * r, height: 18 * r)),
              with: .color(night ? Color(red: 0.6, green: 0.56, blue: 0.85) : .white))
          }
        }
      case "city":
        guard night else { return }
        // từng ô đèn tắt bật theo nhịp riêng, không đồng loạt
        for (i, w) in [(236.0, 70.0), (292, 30), (298, 74), (330, 100), (358, 60), (204, 110)].enumerated() {
          let on = sin(t * (0.21 + Double(i) * 0.07) + Double(i) * 1.9) > -0.2
          c.opacity = on ? 0.95 : 0
          c.fill(Path(CGRect(x: w.0, y: w.1, width: 5, height: 7)), with: .color(Color(red: 1, green: 0.8, blue: 0.45)))
        }
      default:
        // trong chùm đèn hạt bắt sáng nên rõ, ngoài chùm chỉ thoáng thấy
        for m in motes {
          let spread = 30 + (m.y + 54) * 0.2
          let lit = lamp ? min(1, max(0, (spread - abs(m.x - 195)) / 22)) : 0
          let r = 0.5 + m.size * 0.9
          c.opacity = (lit * 0.55 + (1 - lit) * (night ? 0.1 : 0.18)) * m.fade
          c.fill(
            Path(ellipseIn: CGRect(x: m.x - r, y: m.y - r, width: r * 2, height: r * 2)),
            with: .color(
              lit > 0.4 ? Color(red: 1, green: 0.9, blue: 0.72)
                : night ? Color(red: 0.8, green: 0.76, blue: 0.7) : Color(red: 0.55, green: 0.47, blue: 0.38)))
        }
      }
    }
  }
}

/// Bụi của phòng và bụi trong chùm đèn, sống qua các khung. Vẽ lại mỗi khung nên chỉ giữ ít hạt.
@MainActor
final class StudioMotes {
  private var room = KoaMotes(count: 0, x: -10...400, y: -160...470, seed: 3)
  private var beam = KoaMotes(count: 14, x: 150...240, y: -40...300, seed: 7)
  private var last: Double?

  func advance(t: Double, dust: Int, lamp: Bool) -> [KoaMotes.Mote] {
    let dt = min(0.1, max(0, t - (last ?? t)))
    last = t
    room.resize(dust * 16)
    room.step(dt, t: t)
    guard lamp else { return room.motes }
    // bẩn hơn thì nhiều hạt trong vệt đèn hơn — mọi hạt đều trôi (04/11: bỏ hạt vẽ chết của mock)
    beam.resize(14 + dust * 8)
    beam.step(dt, t: t)
    return room.motes + beam.motes
  }
}

/// Đồ hỏng trong phòng (`KoaBreakage`, cảnh A duyệt 06/11): neon tắt nửa bảng + vết nứt, thỉnh thoảng loé
/// tia lửa; bảng streak tắt màn + nứt; sân khấu nứt một vệt; sàn bật một tấm ván. Vẽ thẳng bằng Canvas theo toạ độ
/// phòng (390 điểm ngang), cùng `drop` với tranh khung dọc.
struct StudioBroken: View {
  let item: KoaBreakage.Item
  let t: Double
  let drop: Double
  let k: Double

  /// Khung các món trong toạ độ phòng.
  static let board = CGRect(x: 272, y: 248, width: 98, height: 58)
  static let stage = (x: 195.0, y: 411.5, rx: 137.0, ry: 30.5)

  var body: some View {
    Canvas { ctx, _ in
      var c = ctx
      c.translateBy(x: 0, y: drop)
      c.scaleBy(x: k, y: k)
      let ink = GraphicsContext.Shading.color(Color(red: 0.07, green: 0.07, blue: 0.09))
      func crack(_ pts: [CGPoint], width: Double = 2.2) {
        var p = Path()
        p.addLines(pts)
        c.stroke(p, with: ink, lineWidth: width)
        c.stroke(p.offsetBy(dx: 0.6, dy: 0.6), with: .color(.white.opacity(0.35)), lineWidth: 0.7)
      }
      // tia lửa nhỏ thỉnh thoảng loé (vài phần mười giây mỗi ~4 giây)
      let spark = sin(t * 1.6) * sin(t * 7.3) > 0.82
      switch item {
      case .neon:
        let s = StudioTall.sign
        let r = CGRect(x: s.x, y: s.y, width: s.w, height: s.h)
        c.fill(Path(roundedRect: r, cornerRadius: 10), with: .color(.black.opacity(0.55)))
        crack([CGPoint(x: s.x + 12, y: s.y + 8), CGPoint(x: s.x + 46, y: s.y + 36), CGPoint(x: s.x + 38, y: s.y + 52),
               CGPoint(x: s.x + 76, y: s.y + 80), CGPoint(x: s.x + 68, y: s.y + 92), CGPoint(x: s.x + 100, y: s.y + 110)])
        if spark { sparkle(&c, at: CGPoint(x: s.x + s.w - 14, y: s.y + 10)) }
      case .board:
        let r = Self.board
        c.fill(Path(roundedRect: r, cornerRadius: 6), with: .color(.black.opacity(0.62)))
        crack([CGPoint(x: r.minX + 10, y: r.minY + 6), CGPoint(x: r.midX - 4, y: r.midY), CGPoint(x: r.midX + 6, y: r.midY + 6),
               CGPoint(x: r.maxX - 12, y: r.maxY - 6)])
        // màn hình chập chờn sọc nhiễu
        if spark {
          for i in 0..<4 {
            let y = r.minY + 8 + Double(i) * 12
            c.fill(Path(CGRect(x: r.minX + 4, y: y, width: r.width - 8, height: 2)), with: .color(.white.opacity(0.35)))
          }
        }
      case .stage:
        Self.stageCrack(&c, opacity: 1)
        Self.darkRim(&c, opacity: 1)
      case .floor:
        Self.plank(&c, angle: KoaRepairScene.Floor.plankPx.raise)
      }
    }
  }

  /// Vết nứt trên mặt bục — đúng vết của storyboard D (`KoaRepairScene.Stage.crack`), để lúc hỏng và lúc
  /// Koa sửa là một vết.
  static func stageCrack(_ c: inout GraphicsContext, opacity: Double) {
    let u = KoaRepairScene.pxPerUnit
    var g = c
    g.opacity = opacity
    var p = Path()
    p.addLines(KoaRepairScene.Stage.crack.map { CGPoint(x: $0.x, y: $0.y) })
    let ink = GraphicsContext.Shading.color(Color(red: 0.16, green: 0.11, blue: 0.07))
    g.stroke(p, with: ink, style: StrokeStyle(lineWidth: 7 / u, lineCap: .round, lineJoin: .round))
    g.stroke(p.offsetBy(dx: 2 / u, dy: 3 / u), with: .color(Color(red: 0.85, green: 0.71, blue: 0.54).opacity(0.7)), lineWidth: 2 / u)
    for b in KoaRepairScene.Stage.branches {
      var q = Path()
      q.addLines(b.map { CGPoint(x: $0.x, y: $0.y) })
      g.stroke(q, with: ink, style: StrokeStyle(lineWidth: 4 / u, lineCap: .round))
    }
  }

  /// Tấm ván sau bục (storyboard E): cùng màu sàn (lấy mẫu ảnh phòng). Bật: lộ cạnh ván + khe tối; nằm phẳng:
  /// chỉ còn đường ráp mảnh liền với sàn. Đầu phải dính sàn, đầu trái nhấc lên `angle` độ.
  static func plank(_ c: inout GraphicsContext, angle: Double) {
    let F = KoaRepairScene.Floor.self, u = KoaRepairScene.pxPerUnit
    let pv = KoaRepairScene.room(F.pivotPx.x, F.pivotPx.y)
    let len = F.plankPx.length / u, h = 14 / u, top = pv.y - 10 / u, x0 = pv.x - len
    let face = CGRect(x: x0, y: top, width: len, height: h)
    let dark = Color(red: 0.54, green: 0.42, blue: 0.3)
    guard angle >= 0.3 else {
      c.stroke(Path(face), with: .color(Color(red: 0.56, green: 0.45, blue: 0.34).opacity(0.55)), lineWidth: 1.6 / u)
      return
    }
    c.fill(Path(face), with: .color(Color(red: 0.23, green: 0.16, blue: 0.11).opacity(0.85 * min(1, angle / 6))))   // khe tối
    var g = c
    g.translateBy(x: pv.x, y: top + h)
    g.rotate(by: .degrees(angle))
    g.translateBy(x: -pv.x, y: -(top + h))
    g.fill(Path(CGRect(x: x0, y: top + h, width: len, height: 9 / u)), with: .color(dark))                          // cạnh ván
    g.fill(Path(face), with: .color(Color(red: 0.76, green: 0.65, blue: 0.52)))
    g.stroke(Path(face), with: .color(dark), lineWidth: 2 / u)
    var grain = Path()
    grain.move(to: CGPoint(x: x0 + 20 / u, y: top + 7 / u))
    grain.addLine(to: CGPoint(x: pv.x - 30 / u, y: top + 7 / u))
    g.stroke(grain, with: .color(Color(red: 0.66, green: 0.54, blue: 0.42).opacity(0.7)), lineWidth: 1.5 / u)
    g.fill(Path(ellipseIn: CGRect(x: x0 + 4 / u, y: top + h + 6 / u, width: 20 / u, height: 6 / u)), with: .color(Color(red: 0.16, green: 0.11, blue: 0.07).opacity(0.4)))
  }

  /// Vành đèn của bục tắt một đoạn.
  static func darkRim(_ c: inout GraphicsContext, opacity: Double) {
    let st = stage
    var arc = Path()
    arc.addArc(center: .zero, radius: 1, startAngle: .degrees(20), endAngle: .degrees(70), clockwise: false)
    let m = CGAffineTransform(translationX: st.x, y: st.y).scaledBy(x: st.rx, y: st.ry)
    c.stroke(arc.applying(m), with: .color(.black.opacity(0.55 * opacity)), lineWidth: 4)
  }

  private func sparkle(_ c: inout GraphicsContext, at p: CGPoint) {
    var s = Path()
    let r = 7.0
    s.addLines([CGPoint(x: p.x, y: p.y - r), CGPoint(x: p.x + r * 0.25, y: p.y - r * 0.25), CGPoint(x: p.x + r, y: p.y),
                CGPoint(x: p.x + r * 0.25, y: p.y + r * 0.25), CGPoint(x: p.x, y: p.y + r), CGPoint(x: p.x - r * 0.25, y: p.y + r * 0.25),
                CGPoint(x: p.x - r, y: p.y), CGPoint(x: p.x - r * 0.25, y: p.y - r * 0.25)])
    s.closeSubpath()
    c.fill(s, with: .color(Color(red: 1, green: 0.84, blue: 0.29)))
  }
}

/// Quầng sáng sau bảng neon, chập chờn như đèn thật: thở chậm, thỉnh thoảng sụt một nhịp.
struct StudioNeon: View {
  let t: Double
  let drop: Double
  let k: Double

  /// Đèn đang sụt một nhịp (cùng đồng hồ `timeIntervalSinceReferenceDate`) — tiếng rè theo đây.
  static func dips(at t: Double) -> Bool { sin(t * 0.73) * sin(t * 2.9) > 0.86 }

  var body: some View {
    let s = StudioTall.sign
    let dip = Self.dips(at: t)
    let glow = (0.3 + 0.08 * sin(t * 1.4)) * (dip ? 0.35 : 1)
    Canvas { ctx, _ in
      var c = ctx
      c.translateBy(x: 0, y: drop)
      c.scaleBy(x: k, y: k)
      c.opacity = glow
      c.fill(
        Path(ellipseIn: CGRect(x: s.x - 30, y: s.y - 26, width: s.w + 60, height: s.h + 52)),
        with: .radialGradient(
          Gradient(colors: [Color(red: 0.56, green: 0.51, blue: 1), .clear]),
          center: CGPoint(x: s.x + s.w / 2, y: s.y + s.h / 2), startRadius: 20, endRadius: (s.w + 60) / 2))
    }
  }
}

/// Gác mái khung dọc, vẽ một lần.
private struct StudioAttic: View, Equatable {
  let light: Bool
  let drop: Double

  var body: some View {
    let plan = StudioPlans.attic(light: light)
    Canvas { ctx, canvas in
      var c = ctx
      let k = canvas.width / StudioScene.width
      c.translateBy(x: 0, y: drop)
      c.concatenate(CGAffineTransform(scaleX: k, y: k))
      KoaCanvas.draw(plan, in: &c)
    }
  }
}

/// Ảnh tĩnh của một lớp phần vẽ mới.
private struct StudioTallImage: View, Equatable {
  let options: StudioScene.Options
  let layer: String
  let drop: Double

  var body: some View {
    let plan = StudioPlans.tall(options, layer)
    Canvas { ctx, canvas in
      var c = ctx
      let k = canvas.width / StudioScene.width
      if layer == "cone" { c.addFilter(.blur(radius: StudioTall.coneBlur * k)) }
      c.translateBy(x: 0, y: drop)
      c.concatenate(CGAffineTransform(scaleX: k, y: k))
      KoaCanvas.draw(plan, in: &c)
    }
  }
}

/// Khung máy quay cho phần vẽ mới, nằm ngoài sân khấu nên đọc qua ô nhớ. `bedroom` và `options` được
/// theo dõi, phần còn lại đổi mỗi khung.
@MainActor @Observable
final class KoaLens {
  /// Koa đang ở phòng ngủ: tường cao và sàn đổi theo.
  var bedroom = false
  /// Tuỳ chọn của phòng đang hiện, để phần vẽ mới cùng theme và đồ phòng.
  var options = StudioScene.Options()
  @ObservationIgnored var shot = KoaParallax.Shot()
  /// Chân Koa (toạ độ phòng) và cỡ theo độ sâu: cảnh kéo thẻ bắt đầu đúng từ đây.
  @ObservationIgnored var koa = (x: StudioScene.stageMark.x, y: StudioScene.stageMark.y, scale: 1.0)
  /// Tranh hạ xuống bao nhiêu điểm trong khung dọc.
  @ObservationIgnored var drop: CGFloat = 0
}

extension View {
  /// Phòng bám bụi thì hơi xám (Kiệt 04/11): nhạt màu và kém tương phản một chút theo mức bụi
  /// 0…3. Chỉ phòng và đồ vật, Koa giữ màu.
  func koaDustFilm(_ level: Int) -> some View {
    let n = Double(min(max(level, 0), 3))
    return saturation(1 - 0.1 * n).contrast(1 - 0.03 * n)
  }
}
