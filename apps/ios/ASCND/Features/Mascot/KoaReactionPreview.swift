import ASCNDCore
import SwiftUI

#if DEBUG
  /// Mock phản ứng toàn màn hình của Koa (05/11), phát `KoaReaction` bằng Koa vector thật của app.
  /// Mở: `SIMCTL_CHILD_ASCND_DEBUG_KOA_REACTION=set|record|done`. Chạm để phát lại; tự lặp.
  struct KoaReactionPreview: View {
    static var scene: KoaReaction.Scene? {
      ProcessInfo.processInfo.environment["ASCND_DEBUG_KOA_REACTION"].flatMap(KoaReaction.Scene.init(rawValue:))
    }

    let scene: KoaReaction.Scene
    @State private var start = Date.now
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private static let bg = Color(red: 0.055, green: 0.059, blue: 0.071)
    private static let orange = Color(red: 0.91, green: 0.52, blue: 0.16)
    private static let gold = Color(red: 0.91, green: 0.70, blue: 0.23)
    private static let rose = Color(red: 0.90, green: 0.33, blue: 0.42)

    var body: some View {
      // reduce-motion: đồng hồ của storyboard; bật Giảm chuyển động thì máy không đẩy, không rung, không pháo giấy, chỉ còn chữ mờ dần
      TimelineView(.animation) { ctx in
        let total = KoaReaction.duration(scene)
        let t = max(0, ctx.date.timeIntervalSince(start) * 1000)
        let local = t.truncatingRemainder(dividingBy: total + 900)
        let (i, p) = KoaReaction.at(scene, local)
        let shots = KoaReaction.shots(scene)
        let shot = shots[i]
        let shotStart = shots.prefix(i).reduce(0) { $0 + $1.ms }
        GeometryReader { geo in
          ZStack {
            Self.bg.ignoresSafeArea()
            RadialGradient(colors: [Self.orange.opacity(0.32), .clear], center: UnitPoint(x: 0.5, y: 0.5), startRadius: 0,
                           endRadius: geo.size.width * 0.9)
              .ignoresSafeArea()
            effects(shot, p: p, t: local - shotStart, size: geo.size)
            koa(shots, i, p: p, t: local, since: local - shotStart, size: geo.size)
            ring(shot, p: p)
            overlay(shot, p: p, size: geo.size)
            if shot.effects.contains(.flash), p < 0.16 { Color.white.opacity(0.85 * (1 - p / 0.16)).ignoresSafeArea() }
            VStack {
              Text(verbatim: "\(i + 1)/\(shots.count) · \(shot.label)")
                .font(.system(size: 11, weight: .bold)).tracking(1).foregroundStyle(.white.opacity(0.45))
                .frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 20).padding(.top, 8)
              Spacer()
              Text(verbatim: "Chạm để bỏ qua").font(.system(size: 13)).foregroundStyle(.white.opacity(0.45)).padding(.bottom, 8)
              GeometryReader { g in
                Rectangle().fill(Self.orange).frame(width: g.size.width * min(1, local / total), height: 3)
              }
              .frame(height: 3)
            }
          }
          .contentShape(Rectangle())
          .onTapGesture { start = .now }
          .sensoryFeedback(trigger: i) { _, _ in
            switch shot.haptic {
            case .none: nil
            case .soft: .impact(weight: .light)
            case .success: .success
            case .heavy: .impact(weight: .heavy)
            }
          }
        }
      }
      .statusBarHidden()
    }

    // MARK: Koa + máy quay
    //
    // Như state machine của Duolingo (Rive): không cắt cứng giữa các dáng. Máy lướt liền sang khung mới
    // (`KoaReaction.blendMs`), dáng cũ mờ dần sang dáng mới, dáng biểu cảm hiện dần có vượt đà, thân nảy theo
    // đà sau mỗi lần đổi, đầu diễn riêng (nhìn / gật), trên nền thở + chớp mắt sẵn có của `KoaFigureView`.

    /// Khung máy của một khung hình ở tiến độ `p`: (độ phóng, tâm phóng y).
    private func framing(_ s: KoaReaction.Shot, _ p: Double) -> (zoom: Double, anchorY: Double) {
      let e = KoaReaction.ease(p)
      var z = s.zoom.0 + (s.zoom.1 - s.zoom.0) * e
      if s.motion == .intoRing { z = 1 - 0.58 * e }
      return s.focus == .face ? (z * 2.15, 0.32) : (z, 0.6)
    }

    private func figure(_ s: KoaReaction.Shot, p: Double, gestureAmount: Double, fig: Double) -> some View {
      let e = KoaReaction.ease(p)
      let turn = s.turn.0 + (s.turn.1 - s.turn.0) * e
      let lx = s.look.from.0 + (s.look.to.0 - s.look.from.0) * e
      let ly = s.look.from.1 + (s.look.to.1 - s.look.from.1) * e
      return KoaFigureView(
        expression: s.expression, pose: s.pose, gesture: s.gesture, size: fig, animated: true, stage: true,
        headLook: KoaMath.Gaze(x: lx, y: ly, k: 1), turn: turn, gestureAmount: gestureAmount
      )
    }

    private func koa(_ shots: [KoaReaction.Shot], _ i: Int, p: Double, t: Double, since: Double, size: CGSize) -> some View {
      let s = shots[i]
      let prev = i > 0 ? shots[i - 1] : nil
      let fig = min(size.width * 0.82, 340.0)
      // máy: lướt từ khung cuối của cảnh trước sang khung này
      var f = framing(s, p)
      if let prev, !s.cut, since < KoaReaction.blendMs, !reduceMotion {
        let k = 1 - pow(1 - since / KoaReaction.blendMs, 3)
        let a = framing(prev, 1)
        f = (a.zoom + (f.zoom - a.zoom) * k, a.anchorY + (f.anchorY - a.anchorY) * k)
      }
      // thân: chuyển động của khung + nảy theo đà sau khi đổi khung
      let body = KoaReaction.body(s.motion, p)
      let settle = s.motion == .jump || s.motion == .plop || reduceMotion ? (sx: 1.0, sy: 1.0) : KoaReaction.settle(since)
      var dx = 0.0, dy = body.dy * fig * 1.25
      if s.effects.contains(.shake), p < 0.4, !reduceMotion {
        let a = (1 - p / 0.4) * 7
        dx += sin(t * 0.09) * a; dy += cos(t * 0.11) * a
      }
      let ringK = s.motion == .intoRing ? KoaReaction.ease(p) : 0
      // dáng: đổi tư thế không mờ chồng hai hình (ra "bóng ma", soi 05/11) mà GIẤU cú đổi trong động tác:
      // thân nén xuống (`poseSquashMs`), đổi dáng lúc nén sâu nhất, rồi nảy lên có vượt đà
      let posed = prev.map { $0.pose != s.pose || $0.gesture != s.gesture } ?? false
      let squash = posed && !reduceMotion ? KoaReaction.poseSwap(since) : (sx: 1.0, sy: 1.0, old: false)
      let gIn = s.gesture != nil && prev?.gesture != s.gesture && !reduceMotion
        ? KoaReaction.backOut((since - KoaReaction.poseSquashMs) / KoaReaction.gestureInMs) : 1
      let shown = squash.old ? (prev ?? s) : s
      return figure(shown, p: squash.old ? 1 : p, gestureAmount: squash.old ? 1 : max(0, gIn), fig: fig)
      .scaleEffect(x: body.sx * settle.sx * squash.sx, y: body.sy * settle.sy * squash.sy, anchor: .bottom)
      .scaleEffect(reduceMotion ? 1 : f.zoom, anchor: UnitPoint(x: 0.5, y: f.anchorY))
      .offset(x: dx, y: dy - ringK * size.height * 0.2)
      .position(x: size.width / 2, y: size.height * 0.54)
    }

    @ViewBuilder private func ring(_ s: KoaReaction.Shot, p: Double) -> some View {
      if s.motion == .intoRing {
        let k = KoaReaction.ease(p)
        GeometryReader { g in
          ZStack {
            Circle().stroke(Self.rose, lineWidth: 8).frame(width: 236, height: 236)
            Text(verbatim: "1:30").font(.system(size: 42, weight: .semibold, design: .rounded)).foregroundStyle(.white)
              .offset(y: 70)
          }
          .position(x: g.size.width / 2, y: g.size.height * 0.34 + 40)
          .opacity(k)
        }
      }
    }

    // MARK: chữ, ô số

    @ViewBuilder private func overlay(_ s: KoaReaction.Shot, p: Double, size: CGSize) -> some View {
      let op = min(1, p / 0.12)
      let pop = p < 0.22 ? 1 + (s.effects.contains(.shake) ? 0.6 : 0.3) * (1 - p / 0.22) : 1
      VStack(spacing: 6) {
        if let title = s.title {
          Text(verbatim: title).font(.system(size: 40, weight: .heavy, design: .rounded)).foregroundStyle(.white)
            .shadow(color: .black.opacity(0.45), radius: 10, y: 4).scaleEffect(reduceMotion ? 1 : pop)
        }
        if let sub = s.subtitle {
          Text(verbatim: sub).font(.system(size: 17, weight: .medium)).foregroundStyle(.white.opacity(0.8))
        }
        Spacer()
        if let chip = s.chip {
          Text(verbatim: chip).font(.system(size: 15, weight: .heavy)).foregroundStyle(.black.opacity(0.85))
            .padding(.horizontal, 14).padding(.vertical, 7).background(Capsule().fill(Self.gold))
            .scaleEffect(p < 0.2 ? 1.3 - p * 1.5 : 1)
        }
        if !s.stats.isEmpty {
          HStack(spacing: 10) {
            ForEach(Array(s.stats.enumerated()), id: \.offset) { k, st in
              let shown = st.value * min(1, p / 0.7)
              VStack(spacing: 2) {
                Text(verbatim: "\(Int(shown).formatted())\(st.unit.isEmpty ? "" : " \(st.unit)")")
                  .font(.system(size: 21, weight: .bold, design: .rounded)).foregroundStyle(.white).monospacedDigit()
                Text(verbatim: st.label).font(.system(size: 12)).foregroundStyle(.white.opacity(0.55))
              }
              .frame(maxWidth: .infinity).padding(.vertical, 12)
              .background(RoundedRectangle(cornerRadius: 16).fill(.white.opacity(0.08)))
              .opacity(max(0, min(1, (p - Double(k) * 0.12) / 0.15)))
            }
          }
          .padding(.horizontal, 24)
        }
      }
      .opacity(op)
      .padding(.top, 70).padding(.bottom, 70)
    }

    // MARK: hiệu ứng

    private func effects(_ s: KoaReaction.Shot, p: Double, t: Double, size: CGSize) -> some View {
      Canvas { c, sz in
        guard !reduceMotion else { return }
        func rnd(_ i: Double) -> Double { let x = sin(i * 12.9898) * 43758.5453; return x - floor(x) }
        let cx = sz.width / 2, cy = sz.height * 0.46
        if s.effects.contains(.speedLines) {
          for i in 0..<26 {
            let a = rnd(Double(i)) * 2 * .pi, r0 = 210 + rnd(Double(i) + 1) * 70 - p * 40
            var path = Path()
            path.move(to: CGPoint(x: cx + cos(a) * r0, y: cy + sin(a) * r0))
            path.addLine(to: CGPoint(x: cx + cos(a) * (r0 + 90), y: cy + sin(a) * (r0 + 90)))
            c.stroke(path, with: .color(.white.opacity(0.16)), lineWidth: 3)
          }
        }
        if s.effects.contains(.sweat) {
          for i in 0..<3 {
            let q = (t / 700 + Double(i) / 3).truncatingRemainder(dividingBy: 1)
            let r = CGRect(x: cx - 80 + Double(i) * 75, y: cy - 150 + q * 80, width: 12, height: 18)
            c.fill(Path(ellipseIn: r), with: .color(Color(red: 0.62, green: 0.85, blue: 0.95).opacity(1 - q)))
          }
        }
        if s.effects.contains(.confetti) {
          let cols: [Color] = [Self.orange, Self.gold, Self.rose, Color(red: 0.49, green: 0.78, blue: 0.93), .white]
          for i in 0..<90 {
            let d = Double(i)
            let life = t / 1000 + rnd(d + 11) * 0.4
            let x = rnd(d + 5) * sz.width + (rnd(d) - 0.5) * 60 * life
            let y = -20 - rnd(d + 7) * 200 + (180 + rnd(d + 9) * 160) * life + 120 * life * life
            guard y < sz.height + 20 else { continue }
            var g = c
            g.translateBy(x: x, y: y)
            g.rotate(by: .radians(life * (rnd(d + 3) * 10 - 5)))
            g.fill(Path(CGRect(x: -4, y: -7, width: 8, height: 14 * abs(cos(life * 6 + d)))), with: .color(cols[i % 5]))
          }
        }
      }
      .ignoresSafeArea()
      .allowsHitTesting(false)
    }
  }
#endif
