import ASCNDCore
import SwiftUI

/// Phòng ngủ gác mái (`KoaBedroom`): Koa thật đang ngủ. Tranh tĩnh vẽ một lần; đồ động (`KoaBedroom.live`)
/// vẽ lại theo nhịp; Koa là hình sống (tai lay, thỉnh thoảng giật), thân và chăn phồng xẹp theo nhịp
/// thở, lâu lâu thở dài. Giảm chuyển động thì đứng yên.
struct KoaBedroomView: View {
  var equipped: [String] = []
  var build = 0
  /// Mốc bắt đầu cảnh đi ngủ (`KoaBedtime`): chăn chờ Koa nhảy lên rồi mới kéo. `nil` = Koa ngủ sẵn.
  var scene: Date?
  /// Mốc bắt đầu cảnh Koa dậy (`KoaWakeUp`): chăn gập lại, Koa rời giường.
  var wake: Date?

  @Environment(\.colorScheme) private var scheme
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Environment(\.scenePhase) private var scenePhase
  @State private var onScreen = true
  /// Đèn ngủ đầu giường: chạm để tắt / bật, nhớ giữa các lần mở.
  @AppStorage(KoaBedroomView.lampKey) private var lampOff = false

  static let lampKey = "koa.bedroom.lampOff"

  /// Một nhịp thở khi ngủ (giây).
  private static let breath = 5.2

  var body: some View {
    // dựng kế hoạch vẽ ngoài `TimelineView`: nhịp thở chạy không dựng lại tranh
    let light = scheme == .light
    let back = KoaBedroomLayer(plan: Self.plan(KoaBedroom.back(light: light)))
    let duvet = KoaBedroomLayer(plan: Self.plan(KoaBedroom.duvet(light: light)))
    let cover = KoaBedroomLayer(plan: Self.plan(KoaBedroom.cover(light: light)))
    let moon = KoaBedroomLayer(plan: Self.plan(KoaBedroom.moonlight(light: light)))
    let shade = KoaBedroomLayer(plan: Self.plan(KoaBedroom.shade(light: light)))
    return GeometryReader { g in
      let k = g.size.width / StudioScene.width
      TimelineView(.animation(minimumInterval: 1.0 / 24, paused: reduceMotion || !onScreen || scenePhase != .active)) { tl in
        let now = tl.date.timeIntervalSinceReferenceDate
        let t = scene.map { tl.date.timeIntervalSince($0) } ?? .infinity
        let up = wake.map { tl.date.timeIntervalSince($0) }
        let cover01 = up.map(KoaWakeUp.cover(at:)) ?? KoaBedtime.cover(at: t)
        // thở: nhịp hơi trôi cho khỏi đều; mỗi ~23 giây một hơi sâu
        let phase = now * 2 * .pi / Self.breath + 0.4 * sin(now * 0.13)
        let sigh = 1 + 0.9 * pow(max(0, sin(now * 2 * .pi / 23)), 24)
        let s = reduceMotion ? 0 : sin(phase) * sigh * cover01
        ZStack(alignment: .topLeading) {
          back.equatable()
          KoaBedroomLayer(plan: Self.plan(KoaBedroom.live(t: reduceMotion ? 0 : now, light: light, zzz: !reduceMotion && t >= KoaBedtime.end && up == nil, lamp: !lampOff)))
          if t >= KoaBedtime.land, (up ?? 0) < KoaWakeUp.blanket {
            sleeper(light: light, ms: reduceMotion ? 0 : now * 1000, breath: s, standing: cover01 < 0.85)
          }
          // chăn gập ở chân giường, Koa nằm xuống thì kéo lên
          duvet.equatable()
            .scaleEffect(
              x: 0.34 + 0.66 * cover01, y: 1 + 0.006 * s,
              anchor: UnitPoint(x: 304 / StudioScene.width, y: KoaBedroom.coverBottom / KoaBedroom.height))
          cover.equatable()
          moon.equatable().blur(radius: 3.5 * k).opacity(cover01)
          shade.equatable()
          Color.black.opacity(lampOff ? KoaBedroom.lampOffDim(light: light) : 0)
            .allowsHitTesting(false)
        }
      }
      // vùng chạm ở ngoài `TimelineView`, không dựng lại theo nhịp thở
      Color.clear
        .contentShape(Circle())
        .frame(width: 56, height: 56)
        .position(x: KoaBedroom.lamp.x * k, y: KoaBedroom.lamp.y * k)
        .onTapGesture { lampOff.toggle() }
        .accessibilityHidden(true)
    }
    .animation(reduceMotion ? nil : .easeInOut(duration: 0.25), value: lampOff)
    .sensoryFeedback(.selection, trigger: lampOff)
    .onScrollVisibilityChange(threshold: 0.2) { onScreen = $0 }
    .accessibilityHidden(true)
  }

  private static func plan(_ kids: [KoaRender.Element]) -> [KoaPaint.Op] {
    KoaPaint.plan(KoaRender.Element("Svg", kids: kids))
  }

  /// Koa thật, dáng ngồi nhắm mắt xoay nằm.
  private func sleeper(light: Bool, ms: Double, breath: Double, standing: Bool) -> KoaBedroomSleeper {
    var o = KoaRender.Options()
    o.expression = .meditate
    // chăn chưa phủ thì còn dáng lúc nhảy lên; phủ xong thân cuộn tròn bên dưới
    o.pose = standing ? .idle : .relaxing
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

/// Koa trong cảnh đi ngủ / cảnh dậy, lúc không nằm dưới chăn. Vẽ cùng một đường với lúc ngủ, nên hình
/// không đổi khi sang tay `KoaBedroomView`.
struct KoaBedtimeActor: View {
  let start: Date
  let clock: KoaSceneClock
  var equipped: [String] = []
  var build = 0

  @Environment(\.colorScheme) private var scheme

  var body: some View {
    let light = scheme == .light
    TimelineView(.animation(minimumInterval: 1.0 / 60)) { tl in
      let current = clock.shot(at: tl.date.timeIntervalSince(start))
      Canvas { ctx, canvas in
        guard let shot = current else { return }
        var c = ctx
        let k = canvas.width / StudioScene.width
        c.concatenate(CGAffineTransform(scaleX: k, y: k))
        c.translateBy(x: shot.x, y: shot.y)
        c.rotate(by: .degrees(shot.angle))
        c.scaleBy(x: shot.scale, y: shot.scale)
        c.translateBy(x: -120, y: -110)
        var o = KoaRender.Options()
        o.expression = shot.eyesClosed ? .meditate : .happytired
        o.walk = shot.walk
        o.t = tl.date.timeIntervalSinceReferenceDate * 1000
        o.size = 240
        o.paper = light
        o.flat = light
        o.build = build
        o.worn = KoaEmotion.worn(equipped)
        KoaCanvas.draw(KoaPaint.plan(KoaRender.figure(o)), in: &c)
      }
    }
    .allowsHitTesting(false)
  }
}

/// Ô nhớ của cảnh giữa các khung (như `KoaDirectorDriver`, không phải trạng thái của view).
@MainActor
final class KoaSceneClock {
  private var bedtime = KoaBedtime()
  private var waking: KoaWakeUp?

  init(waking: Bool = false) { self.waking = waking ? KoaWakeUp() : nil }

  func shot(at t: Double) -> KoaBedtime.Shot? {
    if waking != nil { return waking?.shot(at: t) }
    return bedtime.shot(at: t)
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
