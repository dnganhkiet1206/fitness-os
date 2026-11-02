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

  private var k: Double { Double(size.width) / StudioScene.width }

  var body: some View {
    ZStack(alignment: .topLeading) {
      ForEach(StudioScene.layers) { layer in
        if layer.id == StudioScene.hazeBefore { haze }
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

/// Sàn kéo dài tới đáy màn (01/11, phòng full màn): nối mép sàn của tranh, thêm vệt ván hội tụ về
/// sau phòng và vũng sáng của đèn. Vẽ một lần.
struct StudioFloorRun: View {
  @Environment(\.colorScheme) private var scheme

  var body: some View {
    GeometryReader { g in
      let light = scheme == .light
      let k = g.size.width / StudioScene.width
      let top = StudioScene.sceneBottom * k - 2
      // đúng màu mép dưới của tranh, để không lộ đường nối
      let edge = light ? Color(red: 0.86, green: 0.8, blue: 0.72) : Color(red: 15 / 255, green: 16 / 255, blue: 38 / 255)
      let far = light ? Color(red: 0.76, green: 0.69, blue: 0.6) : Color(red: 0.03, green: 0.035, blue: 0.08)
      ZStack(alignment: .top) {
        LinearGradient(colors: [edge, far], startPoint: .top, endPoint: .bottom)
          .frame(height: max(0, g.size.height - top))
          .offset(y: top)
        Canvas { ctx, size in
          // ván sàn hội tụ về điểm tụ giữa tường
          let vanish = CGPoint(x: size.width / 2, y: 360 * k)
          for i in -7...7 {
            var p = Path()
            let x = size.width / 2 + CGFloat(i) * size.width * 0.34
            let t = (top - vanish.y) / (size.height - vanish.y)
            p.move(to: CGPoint(x: vanish.x + (x - vanish.x) * t, y: top))
            p.addLine(to: CGPoint(x: x, y: size.height))
            ctx.stroke(p, with: .color((light ? Color.black : Color.white).opacity(light ? 0.05 : 0.035)), lineWidth: 1)
          }
        }
        // ánh đèn đổ tiếp xuống sàn, tắt dần về phía người xem
        Circle()
          .fill(
            RadialGradient(
              colors: [Color(red: 1, green: 0.8, blue: 0.5).opacity(light ? 0.2 : 0.09), .clear],
              center: .center, startRadius: 0, endRadius: g.size.width * 0.62)
          )
          .frame(width: g.size.width * 1.24, height: g.size.width * 1.24)
          .offset(y: top - g.size.width * 0.5)
      }
      .frame(width: g.size.width, height: g.size.height, alignment: .top)
    }
    .allowsHitTesting(false)
    .accessibilityHidden(true)
  }
}

/// Tiền cảnh mờ sát ống kính, kiểu máy quay nhiều tầng của Disney: tạ và khăn nhoè ở hai góc dưới,
/// nằm rất gần người xem nên trôi mạnh nhất, ngược với tường. Thấy lớp này trôi là thấy chiều sâu.
struct StudioForeground: View {
  let lens: KoaLens
  @Environment(\.colorScheme) private var scheme
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    TimelineView(.animation(minimumInterval: 1.0 / 30, paused: reduceMotion)) { _ in
      shapes.offset(x: lens.shot.shift(KoaParallax.Plane.foreground.amp))
    }
    .ignoresSafeArea()
    .allowsHitTesting(false)
    .accessibilityHidden(true)
  }

  private var shapes: some View {
    GeometryReader { g in
      // sáng hơn sàn một chút: đồ sát ống kính bắt ánh đèn phòng, tối quá thì chìm mất
      let tone = scheme == .light ? Color(red: 0.42, green: 0.33, blue: 0.26) : Color(red: 0.2, green: 0.19, blue: 0.36)
      ZStack(alignment: .bottom) {
        // tạ đơn nằm trên sàn, góc trái, phía trên nút mở bảng
        HStack(spacing: 0) {
          RoundedRectangle(cornerRadius: 14).frame(width: 52, height: 108)
          Rectangle().frame(width: 74, height: 26)
          RoundedRectangle(cornerRadius: 14).frame(width: 52, height: 108)
        }
        .rotationEffect(.degrees(-16))
        .offset(x: -g.size.width * 0.42, y: -g.size.height * 0.2)
        // khăn vắt thành đống, góc phải
        Ellipse().frame(width: 200, height: 104).offset(x: g.size.width * 0.5, y: -g.size.height * 0.15)
        Ellipse().frame(width: 130, height: 64).offset(x: g.size.width * 0.44, y: -g.size.height * 0.21)
      }
      .foregroundStyle(tone)
      .blur(radius: 7)
      .frame(width: g.size.width, height: g.size.height, alignment: .bottom)
    }
  }
}

/// Khung máy quay cho lớp tiền cảnh: lớp này nằm ngoài sân khấu nên đọc qua ô nhớ, không qua view.
@MainActor
final class KoaLens {
  var shot = KoaParallax.Shot()
}
