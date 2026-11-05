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
      visualEffect { content, proxy in
        content.offset(y: max(0, -proxy.frame(in: .scrollView(axis: .vertical)).minY) * plane.lag)
      }
    }
  }
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
          if !reduceMotion, layer.id == "wall", !options.light {
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
