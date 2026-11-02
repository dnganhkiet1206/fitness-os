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
/// mua và đường đi của Koa giữ nguyên. Phòng ngủ chưa vẽ khung dọc: dùng nền phẳng cùng màu.
struct StudioTallRoom: View {
  /// Tranh gốc hạ xuống bao nhiêu điểm.
  let drop: CGFloat
  let lens: KoaLens
  @Environment(\.colorScheme) private var scheme
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    GeometryReader { g in
      let k = Double(g.size.width) / StudioScene.width
      if lens.bedroom {
        let c = KoaBedroom.tallColors(light: scheme == .light)
        VStack(spacing: 0) {
          Color(hex: c.wall).frame(height: drop + 60)
          Color(hex: c.floor)
        }
      } else {
        let options = lens.options
        TimelineView(.animation(minimumInterval: 1.0 / 30, paused: reduceMotion)) { _ in
          let shot = lens.shot
          ZStack(alignment: .topLeading) {
            ForEach(StudioTall.layers) { layer in
              StudioTallImage(options: options, layer: layer.id, drop: Double(drop)).equatable()
                .frame(width: g.size.width, height: g.size.height)
                .offset(x: shot.shift(layer.plane.amp) * k)
            }
          }
          .scaleEffect(shot.zoom, anchor: UnitPoint(x: 0.5, y: (KoaParallax.anchorY * k + Double(drop)) / Double(g.size.height)))
        }
      }
    }
    .allowsHitTesting(false)
    .accessibilityHidden(true)
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
  /// Chân Koa trên sân khấu (toạ độ phòng): cảnh kéo thẻ bắt đầu từ đây.
  @ObservationIgnored var koa = (x: StudioScene.stageMark.x, y: StudioScene.stageMark.y)
  /// Tranh hạ xuống bao nhiêu điểm trong khung dọc.
  @ObservationIgnored var drop: CGFloat = 0
}
