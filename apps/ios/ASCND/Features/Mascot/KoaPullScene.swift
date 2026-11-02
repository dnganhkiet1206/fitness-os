import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Cảnh Koa chạy tới kéo thẻ nhiệm vụ lên (`KoaPull`) và bảng nội dung đi theo. Koa của cảnh nằm
/// SAU bảng nên chỉ thò đầu lên khỏi mép, hai tay vẽ TRƯỚC bảng để bám được vào mép.
/// Giảm chuyển động, hay Koa đang ngủ: không có Koa chạy, bảng trượt lên. Kéo bảng xuống hoặc chạm
/// phòng để đóng.
struct KoaPullScene<Content: View>: View {
  let start: Date
  let lens: KoaLens
  var equipped: [String] = []
  var build = 0
  /// Koa đang ở phòng ngủ.
  var asleep = false
  let taunt: String
  let close: () -> Void
  @ViewBuilder var content: Content

  @Environment(\.colorScheme) private var scheme
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var drag = 0.0
  /// Koa đang ngủ thì không có cảnh chạy tới: thẻ tự trượt lên, Koa ngủ tiếp.
  private var quiet: Bool { reduceMotion || asleep }
  /// Rung theo từng nhịp kéo.
  @State private var tugs = 0

  private static var heroScale: Double { KoaRoomMap.heroWidth / 240 }

  var body: some View {
    GeometryReader { g in
      let w = Double(g.size.width), h = Double(g.size.height + g.safeAreaInsets.top + g.safeAreaInsets.bottom)
      let panelHeight = h * 0.66
      TimelineView(.animation(paused: quiet)) { tl in
        let t = quiet ? KoaPull.end : tl.date.timeIntervalSince(start)
        let shot = KoaPull.shot(at: t, start: head(w), width: w, height: h, panelHeight: panelHeight)
        let top = h - panelHeight * shot.panel + drag
        ZStack(alignment: .topLeading) {
          Color.black.opacity(0.35 * min(1, max(0, shot.panel)))
            .contentShape(Rectangle())
            .onTapGesture { if t >= KoaPull.end { close() } }
          if !quiet {
            StudioDust(t: t, start: head(w), width: w, height: h)
            figure(shot, width: w, height: h, t: tl.date.timeIntervalSinceReferenceDate)
              .offset(y: drag)
          }
          panel(height: panelHeight, top: top)
          if !quiet, shot.hands {
            hands(w, top: top, grip: shot.stretchY)
          }
          if t >= KoaPull.tugTwoEnd, !quiet {
            bubble.position(x: w / 2 + 92, y: top - 118)
              .transition(.scale(scale: 0.6, anchor: .bottom).combined(with: .opacity))
          }
        }
      }
      .frame(width: w, height: h)
    }
    .ignoresSafeArea()
    .sensoryFeedback(.impact(weight: .medium), trigger: tugs)
    .task {
      guard !quiet else { return }
      try? await Task.sleep(for: .seconds(KoaPull.peekEnd))
      tugs += 1
      KoaSound.boop()
      try? await Task.sleep(for: .seconds(KoaPull.tugTwoStart - KoaPull.peekEnd))
      tugs += 1
    }
  }

  /// Tâm đầu Koa trên sân khấu, điểm trên màn.
  private func head(_ w: Double) -> (x: Double, y: Double, scale: Double) {
    let k = w / StudioScene.width
    let zoom = lens.shot.zoom
    let cx = StudioScene.width / 2, cy = KoaParallax.anchorY
    let feet = cy + (lens.koa.y - cy) * zoom + lens.drop / k
    let x = cx + (lens.koa.x - cx) * zoom
    let scale = Self.heroScale * k * zoom
    return (x * k, feet * k - 184 * scale, scale)
  }

  private func figure(_ s: KoaPull.Shot, width: Double, height: Double, t: Double) -> some View {
    let light = scheme == .light
    return Canvas { ctx, _ in
      var c = ctx
      c.translateBy(x: s.x, y: s.y)
      c.rotate(by: .degrees(s.angle))
      c.scaleBy(x: s.scale * s.stretchX, y: s.scale * s.stretchY)
      c.translateBy(x: -120, y: -110)
      var o = KoaRender.Options()
      o.expression = .tease
      o.pose = s.running ? .running : .idle
      o.t = t * 1000 * (s.running ? 3 : 1)
      o.size = 240
      o.paper = light
      o.flat = light
      o.build = build
      o.worn = KoaEmotion.worn(equipped)
      KoaCanvas.draw(KoaPaint.plan(KoaRender.figure(o)), in: &c)
    }
    .frame(width: width, height: height)
    .allowsHitTesting(false)
  }

  private func panel(height: Double, top: Double) -> some View {
    VStack(spacing: 0) {
      Capsule()
        .fill(DS.Color.mutedForeground.swiftUI.opacity(0.4))
        .frame(width: 40, height: 5)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, minHeight: 44)
        .contentShape(Rectangle())
        .gesture(
          DragGesture()
            .onChanged { drag = max(0, $0.translation.height) }
            .onEnded { v in
              if v.translation.height > 90 { close() } else { withAnimation(.snappy) { drag = 0 } }
            }
        )
      content
    }
    .frame(height: height + 60, alignment: .top)
    .background(
      DS.Color.background.swiftUI,
      in: UnevenRoundedRectangle(topLeadingRadius: 30, topTrailingRadius: 30)
    )
    .offset(y: top)
    .accessibilityAddTraits(.isModal)
  }

  /// Hai tay lông bám mép bảng; kéo thì bóp lại.
  private func hands(_ w: Double, top: Double, grip: Double) -> some View {
    ForEach([-1.0, 1.0], id: \.self) { side in
      KoaPaw()
        .frame(width: 48 * (2 - grip), height: 34 * grip)
        .position(x: w / 2 + side * 78, y: top + 8)
    }
    .allowsHitTesting(false)
    .accessibilityHidden(true)
  }

  private var bubble: some View {
    Text(verbatim: taunt)
      .font(.system(size: 14, weight: .semibold))
      .foregroundStyle(Color.black.opacity(0.85))
      .multilineTextAlignment(.center)
      .padding(.horizontal, 12)
      .padding(.vertical, 8)
      .background(Color(red: 0.98, green: 0.96, blue: 0.92), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
      .frame(maxWidth: 170)
      .shadow(color: .black.opacity(0.25), radius: 8, y: 3)
      .allowsHitTesting(false)
      .accessibilityLabel(Text(verbatim: taunt))
  }
}

/// Cụm bụi ở chỗ chân chạm sàn, và cụm khói ở lại sau khi Koa lao khỏi màn.
private struct StudioDust: View {
  let t: Double
  let start: (x: Double, y: Double, scale: Double)
  let width: Double
  let height: Double

  var body: some View {
    Canvas { ctx, _ in
      let spots = [
        (x: width * 0.5, y: height * 0.74), (x: width * 0.5, y: height * 0.82), (x: width * 0.5, y: height * 0.95),
      ]
      for (at, spot) in zip(KoaPull.landings, spots) {
        let age = (t - at) / 0.5
        guard age > 0, age < 1 else { continue }
        for i in 0..<5 {
          let a = Double(i) * 1.26 + at * 7
          let r = (10 + 12 * age) * (1 + Double(i % 2) * 0.4)
          let p = CGPoint(x: spot.x + cos(a) * 58 * age, y: spot.y + sin(a) * 14 * age - 12 * age)
          ctx.opacity = (1 - age) * 0.5
          ctx.fill(Path(ellipseIn: CGRect(x: p.x - r, y: p.y - r * 0.7, width: r * 2, height: r * 1.4)), with: .color(.white))
        }
      }
    }
    .allowsHitTesting(false)
  }
}

/// Bàn tay Koa: cùng màu lông, ba vạch móng.
private struct KoaPaw: View {
  var body: some View {
    ZStack(alignment: .bottom) {
      RoundedRectangle(cornerRadius: 17, style: .continuous)
        .fill(Color(red: 0.75, green: 0.78, blue: 0.81))
      RoundedRectangle(cornerRadius: 17, style: .continuous)
        .strokeBorder(Color(red: 0.54, green: 0.58, blue: 0.63), lineWidth: 1.5)
      HStack(spacing: 8) {
        ForEach(0..<3, id: \.self) { _ in
          Capsule().fill(Color(red: 0.54, green: 0.58, blue: 0.63)).frame(width: 2.5, height: 10)
        }
      }
      .padding(.bottom, 5)
    }
  }
}
