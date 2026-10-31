import ASCNDCore
import SwiftUI

/// Phòng ngủ gác mái (`KoaBedroom`): Koa thật đang ngủ. Tranh tĩnh vẽ một lần; Koa là hình sống
/// (tai lay, thỉnh thoảng giật), thân và chăn phồng xẹp theo nhịp thở, lâu lâu thở dài. Giảm
/// chuyển động thì đứng yên.
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
          sleeper(light: light, ms: reduceMotion ? 0 : now * 1000, breath: s)
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

  /// Koa thật, dáng ngồi nhắm mắt xoay nằm.
  private func sleeper(light: Bool, ms: Double, breath: Double) -> KoaBedroomSleeper {
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
    return KoaBedroomSleeper(plan: KoaPaint.plan(KoaRender.figure(o)), breath: breath)
  }
}

/// Koa nằm cuộn trên gối; thở thì ngực nở theo chiều ngang của hình (đang xoay nằm nên thành lên xuống).
private struct KoaBedroomSleeper: View {
  let plan: [KoaPaint.Op]
  var breath = 0.0

  var body: some View {
    Canvas { ctx, canvas in
      var c = ctx
      let h = KoaBedroom.sleeper
      let k = canvas.width / StudioScene.width
      c.concatenate(CGAffineTransform(scaleX: k, y: k))
      c.translateBy(x: h.x, y: h.y)
      c.rotate(by: .degrees(h.angle))
      c.scaleBy(x: h.scale * (1 + 0.012 * breath), y: h.scale)
      c.translateBy(x: -h.anchorX, y: -h.anchorY)
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
