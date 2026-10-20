import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Trục hạng (`rank-journey.tsx` @ fac9ac2): cả thang hạng trên một đường —
/// bậc đã tới là chấm đặc trên đoạn tô màu hạng hiện tại, bậc hiện tại có
/// quầng + lòng khoét màu thẻ và viên "bạn đang ở đây" mang tên hạng, bậc
/// chưa tới là chấm rỗng; dưới mỗi chấm chỉ có cấp mở hạng nên tên dài không
/// đè nhau. Vẽ trong hộp 340 × 72 như `viewBox` của RN, co theo bề ngang thẻ.
struct RankJourneyView: View {
  let ranks: [MascotRules.Rank]
  let currentKey: String
  let lang: AppPreferences.Lang

  @Environment(\.colorScheme) private var scheme

  private static let vw = 340.0
  private static let vh = 72.0
  private static let bleed = 16.0

  var body: some View {
    GeometryReader { geo in
      // viên tên hạng ở bậc đầu / cuối thò ra ngoài hộp (như SVG của RN tràn
      // vào lề thẻ) — vẽ rộng thêm `bleed` mỗi bên để không bị cắt
      let k = geo.size.width / Self.vw
      Canvas { ctx, _ in
        ctx.translateBy(x: Self.bleed, y: 0)
        draw(&ctx, k: k)
      }
      .frame(width: geo.size.width + 2 * Self.bleed, height: geo.size.width / Self.vw * Self.vh)
      .offset(x: -Self.bleed)
    }
    .aspectRatio(Self.vw / Self.vh, contentMode: .fit)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(String(localized: "mr.journey")))
    .accessibilityValue(Text(verbatim: a11yValue))
  }

  /// "Newbie, 0 Gains (đang ở đây); Gym Rat, 40 Gains; …" — điều trục nói bằng hình.
  /// Mốc là Gains (vóc dáng theo tập, #527 đợt 1), không còn là cấp.
  private var a11yValue: String {
    ranks.enumerated().map { i, r in
      let s = "\(r.name(lang)), \(String(localized: "koa.gains.at \(Self.mark(i))"))"
      return r.key == currentKey ? "\(s) ✓" : s
    }.joined(separator: "; ")
  }

  static func mark(_ i: Int) -> Int { i < KoaGains.thresholds.count ? KoaGains.thresholds[i] : 0 }

  private func draw(_ ctx: inout GraphicsContext, k: Double) {
    guard !ranks.isEmpty else { return }
    // Bản tối giữ mã màu phòng tối của RN; bản sáng lấy token đúng nghĩa.
    let dark = scheme == .dark
    let track = dark ? Color(hex: "#26262c") : DS.Color.ringTrack.swiftUI
    let hollowFill = dark ? Color(hex: "#151518") : DS.Color.secondary.swiftUI
    let hollowRim = dark ? Color(hex: "#3a3a3f") : DS.Color.ringTrack.swiftUI
    let reachedLabel = dark ? Color(hex: "#c9c9cf") : DS.Color.foreground.swiftUI
    let cardBg = DS.Color.card.swiftUI

    let n = ranks.count
    let current = max(0, ranks.firstIndex { $0.key == currentKey } ?? 0)
    let cur = ranks[current]
    let curColor = Color(hex: cur.colorHex)
    let padX = 18.0
    let y = 40.0
    let step = (Self.vw - padX * 2) / Double(max(1, n - 1))
    func x(_ i: Int) -> Double { padX + Double(i) * step }
    func pt(_ px: Double, _ py: Double) -> CGPoint { CGPoint(x: px * k, y: py * k) }
    func circle(_ cx: Double, _ r: Double) -> Path {
      Path(ellipseIn: CGRect(x: (cx - r) * k, y: (y - r) * k, width: 2 * r * k, height: 2 * r * k))
    }
    let px = x(current)
    let line = StrokeStyle(lineWidth: 3 * k, lineCap: .round)

    // đường nền + đoạn đã đi tới hạng hiện tại
    var base = Path()
    base.move(to: pt(x(0), y))
    base.addLine(to: pt(x(n - 1), y))
    ctx.stroke(base, with: .color(track), style: line)
    var done = Path()
    done.move(to: pt(x(0), y))
    done.addLine(to: pt(px, y))
    ctx.stroke(done, with: .color(curColor), style: line)

    // viên "bạn đang ở đây" phía trên chấm hiện tại
    ctx.fill(
      Path(roundedRect: CGRect(x: (px - 32) * k, y: 0, width: 64 * k, height: 19 * k), cornerRadius: 9.5 * k),
      with: .color(curColor))
    var tip = Path()
    tip.move(to: pt(px - 4, 19))
    tip.addLine(to: pt(px + 4, 19))
    tip.addLine(to: pt(px, 24))
    tip.closeSubpath()
    ctx.fill(tip, with: .color(curColor))
    ctx.draw(
      Text(verbatim: cur.name(lang)).font(.system(size: 10.5 * k, weight: .heavy)).foregroundStyle(cardBg),
      at: pt(px, 9.5), anchor: .center)

    for (i, rk) in ranks.enumerated() {
      let reached = i <= current
      let cx = x(i)
      let color = Color(hex: rk.colorHex)
      if i == current {
        ctx.stroke(circle(cx, 14), with: .color(color.opacity(0.35)), lineWidth: 2 * k)
        ctx.fill(circle(cx, 9), with: .color(color))
        ctx.fill(circle(cx, 3.5), with: .color(cardBg))
      } else if reached {
        ctx.fill(circle(cx, 6.5), with: .color(color))
      } else {
        ctx.fill(circle(cx, 6), with: .color(hollowFill))
        ctx.stroke(circle(cx, 6), with: .color(hollowRim), lineWidth: 2 * k)
      }
      ctx.draw(
        Text(verbatim: String(Self.mark(i)))
          .font(.system(size: 10 * k, weight: .bold))
          .foregroundStyle(reached ? reachedLabel : DS.Color.mutedForeground.swiftUI),
        // `y + 24` là đường chân chữ trong SVG; tâm chữ 10 điểm nằm cao hơn ~3,5
        at: pt(cx, y + 20.5), anchor: .center)
    }
  }
}
