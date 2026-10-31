import ASCNDCore
import SwiftUI

/// Phòng ngủ gác mái (`KoaBedroom`): Koa thật đang ngủ. Tranh tĩnh vẽ một lần; đầu Koa là hình sống
/// (tai lay, thỉnh thoảng giật), chăn phồng xẹp theo nhịp thở, lâu lâu thở dài. Giảm chuyển động
/// thì đứng yên.
struct KoaBedroomView: View {
  var equipped: [String] = []
  var build = 0

  @Environment(\.colorScheme) private var scheme
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Environment(\.scenePhase) private var scenePhase
  @State private var onScreen = true

  /// Một nhịp thở khi ngủ (giây).
  private static let breath = 5.2

  var body: some View {
    // dựng kế hoạch vẽ ngoài `TimelineView`: nhịp thở chạy không dựng lại tranh
    let light = scheme == .light
    let back = KoaBedroomLayer(plan: Self.plan(KoaBedroom.back(light: light)))
    let cover = KoaBedroomLayer(plan: Self.plan(KoaBedroom.cover(light: light)))
    let moon = KoaBedroomLayer(plan: Self.plan(KoaBedroom.moonlight(light: light)))
    let shade = KoaBedroomLayer(plan: Self.plan(KoaBedroom.shade(light: light)))
    return GeometryReader { g in
      let k = g.size.width / StudioScene.width
      TimelineView(.animation(minimumInterval: 1.0 / 20, paused: reduceMotion || !onScreen || scenePhase != .active)) { tl in
        let now = tl.date.timeIntervalSinceReferenceDate
        // thở: nhịp hơi trôi cho khỏi đều; mỗi ~23 giây một hơi sâu
        let phase = now * 2 * .pi / Self.breath + 0.4 * sin(now * 0.13)
        let sigh = 1 + 0.9 * pow(max(0, sin(now * 2 * .pi / 23)), 24)
        let s = reduceMotion ? 0 : sin(phase) * sigh
        ZStack(alignment: .topLeading) {
          back.equatable()
          head(light: light, ms: reduceMotion ? 0 : now * 1000).offset(x: 0.5 * s * k, y: -0.5 * s * k)
          cover.equatable()
            .scaleEffect(y: 1 + 0.006 * s, anchor: UnitPoint(x: 0.5, y: KoaBedroom.coverBottom / KoaBedroom.height))
          moon.equatable().blur(radius: 3.5 * k)
          shade.equatable()
        }
      }
    }
    .onScrollVisibilityChange(threshold: 0.2) { onScreen = $0 }
    .accessibilityHidden(true)
  }

  private static func plan(_ kids: [KoaRender.Element]) -> [KoaPaint.Op] {
    KoaPaint.plan(KoaRender.Element("Svg", kids: kids))
  }

  /// Đầu thật của Koa (dáng nhắm mắt).
  private func head(light: Bool, ms: Double) -> KoaBedroomHead {
    var o = KoaRender.Options()
    o.expression = .meditate
    o.pose = .relaxing
    o.live = ms > 0
    // đồng hồ riêng: hoạt ảnh gốc (tai lay) chậm lại như đang ngủ
    o.t = ms * 0.6
    // có `Poke` là Koa sống: tai trong theo tai ngoài, tai tự giật
    o.poke = ms > 0 ? KoaMath.Poke() : nil
    // mắt khép sẵn, không chớp
    o.blink = ms > 0 ? 0 : nil
    o.size = 240
    o.paper = light
    o.flat = light
    o.build = build
    o.worn = KoaEmotion.worn(equipped)
    return KoaBedroomHead(plan: KoaPaint.plan(KoaRender.figure(o)))
  }
}

/// Đầu Koa cắt ngang cổ, nghiêng trên gối.
private struct KoaBedroomHead: View {
  let plan: [KoaPaint.Op]

  var body: some View {
    Canvas { ctx, canvas in
      var c = ctx
      let h = KoaBedroom.head
      let k = canvas.width / StudioScene.width
      c.concatenate(CGAffineTransform(scaleX: k, y: k))
      c.translateBy(x: h.x, y: h.y)
      c.rotate(by: .degrees(h.angle))
      c.scaleBy(x: h.scale, y: h.scale)
      c.translateBy(x: -h.anchorX, y: -h.anchorY)
      var top = Path()
      top.move(to: CGPoint(x: -10, y: -10))
      top.addLine(to: CGPoint(x: 250, y: -10))
      top.addLine(to: CGPoint(x: 250, y: KoaBedroom.headTop))
      top.addCurve(
        to: CGPoint(x: -10, y: KoaBedroom.headTop), control1: CGPoint(x: 200, y: KoaBedroom.headChin),
        control2: CGPoint(x: 40, y: KoaBedroom.headChin))
      top.closeSubpath()
      c.clip(to: top)
      KoaCanvas.draw(plan, in: &c)
    }
  }
}

/// Một lớp tranh, `Equatable`: đồng hồ nhịp thở chạy mà tranh không đổi thì không vẽ lại.
struct KoaBedroomLayer: View, Equatable {
  let plan: [KoaPaint.Op]

  var body: some View {
    Canvas { ctx, canvas in
      var c = ctx
      let k = canvas.width / StudioScene.width
      c.concatenate(CGAffineTransform(scaleX: k, y: k))
      KoaCanvas.draw(plan, in: &c)
    }
  }
}
