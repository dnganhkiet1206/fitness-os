import ASCNDCore
import SwiftUI

/// Sân khấu chung của các cảnh Koa toàn màn hình — cảnh xong buổi (`KoaReactionView`) và màn nghỉ
/// (`KoaRestScreen`). KOA-T39 (audit 17/11): hai màn từng chép tay cùng một nền, cùng hình Koa và cùng
/// hiệu ứng ("như `KoaReactionView.koa`"); sửa một bên dễ quên bên kia. Kiệt 07/11: "sân khấu và vị trí
/// đứng của koa phải khớp với story xong buổi tập" — nay cả hai đọc từ đây.
enum KoaShowStage {
  static let bg = Color(red: 0.055, green: 0.059, blue: 0.071)
  static let orange = Color(red: 0.91, green: 0.52, blue: 0.16)
  static let gold = Color(red: 0.91, green: 0.70, blue: 0.23)
  static let rose = Color(red: 0.90, green: 0.33, blue: 0.42)
  static let confettiColors: [Color] = [orange, gold, rose, Color(red: 0.49, green: 0.78, blue: 0.93), .white]
  /// Koa đứng giữa ở 54 % chiều cao.
  static let koaY = 0.54

  /// Tiêu đề hiện ra: tiêu đề cố định của kịch bản theo khoá dịch (KOA-T59), chữ thật của buổi giữ nguyên.
  static func title(_ cue: KoaPerformance.Cue) -> String? {
    guard let raw = cue.title else { return nil }
    switch cue.titleKey {
    case .setDone?: return String(localized: "koa.rest.setDone")
    case .newRecord?: return String(localized: "koa.reaction.record")
    case .yourTurn?: return String(localized: "koa.rest.go")
    case .workoutDone?: return String(localized: "koa.reaction.done")
    case nil: return raw
    }
  }

  /// Nền tĩnh: quầng sáng sân khấu ở 46 % + vũng sáng trên sàn ở 79 %, KHÔNG theo máy / theo Koa.
  struct Backdrop: View {
    let size: CGSize
    var body: some View {
      ZStack {
        KoaShowStage.bg.ignoresSafeArea()
        RadialGradient(colors: [KoaShowStage.orange.opacity(0.30), .clear], center: UnitPoint(x: 0.5, y: 0.46), startRadius: 0,
                       endRadius: size.width * 0.85)
          .ignoresSafeArea()
        Ellipse().fill(RadialGradient(colors: [KoaShowStage.orange.opacity(0.22), .clear], center: .center, startRadius: 0,
                                      endRadius: size.width * 0.38))
          .frame(width: size.width * 0.8, height: size.width * 0.18)
          .position(x: size.width / 2, y: size.height * 0.79)
      }
      .accessibilityHidden(true)
    }
  }

  /// Koa một hình, không đổi dáng: 82 % bề ngang (tối đa 340). Bay lên dời CẢ hình (không nhún trong khung vẽ —
  /// đầu / tai bị cắt ở mép khung); bóng nằm yên trên sàn, co lại và nhạt đi khi bay cao. Không dùng quầng sáng
  /// `stage` của hình: nó dính vào hình nên nền nhảy theo Koa (Kiệt 06/11).
  struct Figure: View {
    let frame: KoaPerformance.Frame
    let size: CGSize
    let reduceMotion: Bool
    var gesture: KoaGesture? = nil
    var worn: KoaFlags.Worn = [:]
    var gestureAmount = 0.0
    /// Hệ số thu nhỏ thêm (cảnh kỷ lục thu Koa vào vòng đồng hồ).
    var shrink = 1.0

    var body: some View {
      let f = frame
      let fig = min(size.width * 0.82, 340.0)
      let unit = fig / 240
      let air = (reduceMotion ? 0 : f.air) * unit
      let lift = min(1, f.air / 40)
      ZStack {
        Ellipse().fill(Color(red: 0.68, green: 0.71, blue: 0.75).opacity(0.32 * (1 - 0.55 * lift)))
          .frame(width: 128 * unit * (1 - 0.35 * lift), height: 18 * unit * (1 - 0.35 * lift))
          .offset(y: (294 - 150) * unit)
        KoaFigureView(
          expression: f.expression, pose: .idle, gesture: gesture, worn: worn, size: fig, animated: true,
          stage: false, walk: reduceMotion ? KoaWalk.Pose() : f.walk, bleeds: true,
          headLook: KoaMath.Gaze(x: f.look.x, y: f.look.y, k: 1), eyes: KoaMath.Gaze(x: f.eyes.x, y: f.eyes.y, k: 1),
          groundShadow: false, gestureAmount: gestureAmount
        )
        .scaleEffect(x: reduceMotion ? 1 : f.sx, y: reduceMotion ? 1 : f.sy, anchor: .bottom)
        .offset(y: -air)
      }
      .scaleEffect((reduceMotion ? 1 : f.zoom) * shrink, anchor: UnitPoint(x: 0.5, y: 0.32 + 0.28 * f.focus))
      .accessibilityHidden(true)
    }
  }

  /// Hiệu ứng theo mốc (vệt tốc độ, mồ hôi, pháo giấy). Giảm chuyển động: không vẽ gì.
  struct Effects: View {
    let cues: [KoaPerformance.Cue]
    let t: Double
    let reduceMotion: Bool
    /// Tâm hiệu ứng (phần chiều cao).
    var centerY = 0.46
    /// Mồ hôi bắt đầu cao hơn tâm bao nhiêu điểm.
    var sweatRise = 150.0
    var confetti = 80
    /// Pháo giấy dừng vẽ dưới mức này (phần chiều cao; `nil` = tới mép dưới).
    var confettiFloor: Double? = nil

    var body: some View {
      Canvas { c, sz in
        guard !reduceMotion else { return }
        func rnd(_ i: Double) -> Double { let x = sin(i * 12.9898) * 43758.5453; return x - floor(x) }
        let cx = sz.width / 2, cy = sz.height * centerY
        for cue in cues {
          let local = t - cue.from
          if cue.effects.contains(.speedLines) {
            for i in 0..<26 {
              let a = rnd(Double(i)) * 2 * .pi, r0 = 210 + rnd(Double(i) + 1) * 70 - local / 30
              var path = Path()
              path.move(to: CGPoint(x: cx + cos(a) * r0, y: cy + sin(a) * r0))
              path.addLine(to: CGPoint(x: cx + cos(a) * (r0 + 90), y: cy + sin(a) * (r0 + 90)))
              c.stroke(path, with: .color(.white.opacity(0.14)), lineWidth: 3)
            }
          }
          if cue.effects.contains(.sweat) {
            for i in 0..<3 {
              let q = (local / 800 + Double(i) / 3).truncatingRemainder(dividingBy: 1)
              let r = CGRect(x: cx - 80 + Double(i) * 75, y: cy - sweatRise + q * 80, width: 12, height: 18)
              c.fill(Path(ellipseIn: r), with: .color(Color(red: 0.62, green: 0.85, blue: 0.95).opacity(1 - q)))
            }
          }
          if cue.effects.contains(.confetti) {
            let floor = confettiFloor.map { sz.height * $0 } ?? sz.height + 20
            for i in 0..<confetti {
              let d = Double(i)
              let life = local / 1000 + rnd(d + 11) * 0.4
              let x = rnd(d + 5) * sz.width + (rnd(d) - 0.5) * 60 * life
              let y = -20 - rnd(d + 7) * 200 + (170 + rnd(d + 9) * 150) * life + 110 * life * life
              guard y < floor else { continue }
              var g = c
              g.translateBy(x: x, y: y)
              g.rotate(by: .radians(life * (rnd(d + 3) * 10 - 5)))
              g.fill(Path(CGRect(x: -4, y: -7, width: 8, height: 14 * abs(cos(life * 6 + d)))),
                     with: .color(KoaShowStage.confettiColors[i % 5]))
            }
          }
        }
      }
      .ignoresSafeArea()
      .allowsHitTesting(false)
      .accessibilityHidden(true)
    }
  }
}
