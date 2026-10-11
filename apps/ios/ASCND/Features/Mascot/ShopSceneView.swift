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
/// (`shopFadeH` / `shopFadeV`). Cảnh luôn là cảnh đêm — Koa luôn vẽ bản đèn.
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

  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  /// `SS`.
  private static let ss = 2.0

  var body: some View {
    GeometryReader { g in
      let w = Double(g.size.width)
      let h = Double(g.size.height)
      let m = ShopScene.camera(ShopScene.shot(shot), width: w, height: h)
      let box = ShopScene.figureBox
      let ss = Self.ss
      ZStack(alignment: .topLeading) {
        ShopRoomCanvas(skin: skin, energy: energy, scale: ss)
        MascotFigureView(emotion: .idle, equipped: equipped, size: (box.w * ss).rounded(), dress: dress, paper: false)
          .offset(x: box.x * ss, y: box.y * ss)
      }
      .frame(width: ShopScene.width * ss, height: ShopScene.height * ss, alignment: .topLeading)
      .scaleEffect(m[0] / ss, anchor: .topLeading)
      .offset(x: m[4], y: m[5])
      .animation(reduceMotion ? nil : .interpolatingSpring(mass: 1, stiffness: 120, damping: 26), value: shot)
    }
    .aspectRatio(ShopScene.width / ShopScene.height, contentMode: .fit)
    .clipped()
    .overlay { ShopFade() }
    .accessibilityHidden(true)
  }
}

/// Căn phòng (`ShopRoom`, toạ độ 390 × 476) vẽ ở `scale` lần.
private struct ShopRoomCanvas: View {
  let skin: String
  let energy: Double
  let scale: Double

  var body: some View {
    let plan = KoaPaint.plan(KoaRender.Element("Svg", kids: ShopScene.tree(skin: skin, energy: energy)))
    Canvas { ctx, _ in
      var c = ctx
      c.concatenate(CGAffineTransform(scaleX: scale, y: scale))
      KoaCanvas.draw(plan, in: &c)
    }
    .frame(width: ShopScene.width * scale, height: ShopScene.height * scale)
  }
}

/// `shopFadeH` rồi `shopFadeV` — theo màu trang của theme.
private struct ShopFade: View {
  var body: some View {
    let page = DS.Color.background.swiftUI
    ZStack {
      LinearGradient(
        stops: [
          .init(color: page.opacity(0.55), location: 0), .init(color: page.opacity(0), location: 0.09),
          .init(color: page.opacity(0), location: 0.91), .init(color: page.opacity(0.55), location: 1),
        ], startPoint: .leading, endPoint: .trailing)
      LinearGradient(
        stops: [
          .init(color: page.opacity(0), location: 0), .init(color: page.opacity(0), location: 0.83),
          .init(color: page, location: 1),
        ], startPoint: .top, endPoint: .bottom)
    }
    .allowsHitTesting(false)
  }
}
