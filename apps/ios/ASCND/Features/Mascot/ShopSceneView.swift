import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Phòng thử đồ (#527, S2) — `ShopScene` của RN @ fac9ac2: một căn phòng
/// (`ShopScene.tree`, VẼ LẠI theo `ShopRoom`, Kiệt đồng ý) và một máy quay đi
/// giữa bốn khung hình theo tab. Căn phòng vẽ MỘT lần ở toạ độ của nó; máy quay
/// chỉ dời / phóng cả bức (nhân vật đi cùng, đứng ở `FIGURE_BOX`), như RN biến
/// đổi `<View>` bọc ngoài chứ không vẽ lại SVG. Lò xo không nảy (`SPRING`:
/// damping 26, stiffness 120) để chạm tab giữa chừng thì đổi hướng mượt;
/// Reduce Motion → chuyển thẳng. Mép tan vào nền trang đứng yên ngoài máy quay
/// Cảnh ngày ở giao diện sáng, đêm ở giao diện tối (15/10).
///
/// Cả bức dựng ở `SS` lần toạ độ cảnh rồi máy quay thu về (`m[0] / SS`): khung
/// gần nhất phóng ~1,9 lần, nên phóng một ảnh đã rời rạc hoá ở 1× sẽ mờ; ở 2×
/// thì khung rộng là 1:1 và khung gần chỉ hơi THU — như RN.
struct ShopSceneView: View {
  let shot: ShopScene.ShotName
  /// Khoá đang mặc (đã cộng món đang xem thử).
  var equipped: [String] = []
  /// Skin của căn phòng (`StudioScene.skinKey`).
  var skin = "default"
  var energy = 0.5
  /// Đang chơi phản ứng mặc đồ.
  var dress = false
  /// Chiều cao cố định (tủ đồ ghim sân khấu, 29/10): máy quay lấp đầy khung này thay
  /// cho tỉ lệ của cả căn phòng.
  var height: CGFloat?

  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Environment(\.colorScheme) private var scheme

  /// `SS`.
  private static let ss = 2.0

  var body: some View {
    GeometryReader { g in
      let w = Double(g.size.width)
      let h = Double(g.size.height)
      let frame = height == nil ? ShopScene.shot(shot) : ShopScene.banner(shot, aspect: w / max(h, 1))
      let m = ShopScene.camera(frame, width: w, height: h)
      let box = ShopScene.figureBox
      let ss = Self.ss
      ZStack(alignment: .topLeading) {
        ShopRoomCanvas(skin: skin, energy: energy, light: scheme == .light, scale: ss)
        MascotFigureView(emotion: .idle, equipped: equipped, size: (box.w * ss).rounded(), dress: dress)
          .offset(x: box.x * ss, y: box.y * ss)
      }
      .frame(width: ShopScene.width * ss, height: ShopScene.height * ss, alignment: .topLeading)
      .scaleEffect(m[0] / ss, anchor: .topLeading)
      .offset(x: m[4], y: m[5])
      .animation(reduceMotion ? nil : .interpolatingSpring(mass: 1, stiffness: 120, damping: 26), value: shot)
    }
    .modifier(SceneFrame(height: height))
    // Thẻ bo góc như sân khấu phòng Koa (15/10, thay mép tan của RN).
    .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: 28, style: .continuous)
        .strokeBorder(DS.Color.foreground.swiftUI.opacity(0.08), lineWidth: 0.75)
    }
    .shadow(color: .black.opacity(0.08), radius: 18, y: 8)
    .accessibilityHidden(true)
  }
}

/// Căn phòng (`ShopRoom`, toạ độ 390 × 476) vẽ ở `scale` lần.
private struct ShopRoomCanvas: View {
  let skin: String
  let energy: Double
  var light = false
  let scale: Double

  var body: some View {
    let plan = KoaPaint.plan(KoaRender.Element("Svg", kids: ShopScene.tree(skin: skin, energy: energy, light: light)))
    Canvas { ctx, _ in
      var c = ctx
      c.concatenate(CGAffineTransform(scaleX: scale, y: scale))
      KoaCanvas.draw(plan, in: &c)
    }
    .frame(width: ShopScene.width * scale, height: ShopScene.height * scale)
  }
}

/// Tỉ lệ cả căn phòng, hay một khung cao cố định phủ hết bề ngang (tủ đồ).
private struct SceneFrame: ViewModifier {
  let height: CGFloat?

  func body(content: Content) -> some View {
    if let height {
      content.frame(maxWidth: .infinity).frame(height: height)
    } else {
      content.aspectRatio(ShopScene.width / ShopScene.height, contentMode: .fit)
    }
  }
}
