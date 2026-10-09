import ASCNDDesignSystem
import SwiftUI

/// Ánh sáng nền của tab Trợ lý (#527) — `components/ascnd/assistant-aura.tsx`
/// @ fac9ac2.
///
/// Như RN: bốn vùng sáng rất mềm trôi chậm sau toàn bộ nội dung; vùng chính
/// mang MÀU ĐIỂM SẴN SÀNG hôm nay (xanh / vàng / đỏ; chưa có điểm → tím), ba
/// vùng còn lại cố định (tím, xanh lơ, ấm thấp dưới); cường độ thấp (đỉnh
/// 0.135 / 0.10 / 0.07 / 0.03 ở nền tối, cao hơn ở nền sáng) để không tranh
/// với chữ; chu kỳ 17 / 23 / 29 / 13 giây lệch pha để không lặp ra mắt; Giảm
/// chuyển động → đứng yên.
///
/// Khác RN: không có lớp "bụi neon" bay lên và nhịp "bừng sáng" khi vào tab —
/// chỉ còn bốn vùng sáng (vẽ một `Canvas`, không có view nào đổi bố cục).
struct AssistantAura: View {
  /// `readiness_status` của hôm nay: `green` / `yellow` / `red` / `nil`.
  let status: String?

  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Environment(\.colorScheme) private var scheme

  private struct Pool {
    let color: Color
    let peak: Double
    let peakLight: Double
    let cx: Double
    let cy: Double
    let dx: Double
    let dy: Double
    let scale: Double
    let period: Double
    let phase: Double
  }

  private var stateColor: Color {
    switch status {
    case "green": DS.Color.readinessGreen.swiftUI
    case "yellow": DS.Color.readinessYellow.swiftUI
    case "red": DS.Color.readinessRed.swiftUI
    default: DS.Color.metricPurple.swiftUI
    }
  }

  private var pools: [Pool] {
    [
      Pool(
        color: stateColor, peak: 0.135, peakLight: 0.5, cx: 0.44, cy: 0.31, dx: 34, dy: 44, scale: 0.18,
        period: 17, phase: 0),
      Pool(
        color: Color(red: 123.0 / 255, green: 61.0 / 255, blue: 1), peak: 0.10, peakLight: 0.37, cx: 0.62, cy: 0.24,
        dx: 44, dy: 30, scale: 0.15, period: 23, phase: 0.33),
      Pool(
        color: Color(red: 34.0 / 255, green: 184.0 / 255, blue: 1), peak: 0.07, peakLight: 0.26, cx: 0.33, cy: 0.44,
        dx: 40, dy: 36, scale: 0.17, period: 29, phase: 0.66),
      Pool(
        color: Color(red: 1, green: 179.0 / 255, blue: 122.0 / 255), peak: 0.03, peakLight: 0.11, cx: 0.68, cy: 0.66,
        dx: 28, dy: 24, scale: 0.13, period: 13, phase: 0.5),
    ]
  }

  var body: some View {
    TimelineView(.animation(minimumInterval: 1.0 / 20, paused: reduceMotion)) { context in
      let t = reduceMotion ? 0 : context.date.timeIntervalSinceReferenceDate
      Canvas { ctx, size in
        let dark = scheme == .dark
        for p in pools {
          // Một vòng trôi kín theo chu kỳ của vùng ấy; lệch pha giữa các vùng.
          let a = (t / p.period + p.phase) * 2 * .pi
          let x = size.width * p.cx + p.dx * sin(a)
          let y = size.height * p.cy + p.dy * sin(a * 2 + 1)
          let r = size.width * 0.55 * (1 + p.scale * sin(a + 2))
          let peak = dark ? p.peak : p.peakLight
          let gradient = Gradient(stops: [
            .init(color: p.color.opacity(peak), location: 0),
            .init(color: p.color.opacity(peak * 0.45), location: 0.45),
            .init(color: p.color.opacity(0), location: 1),
          ])
          let rect = CGRect(x: x - r, y: y - r, width: r * 2, height: r * 2)
          ctx.fill(
            Path(ellipseIn: rect),
            with: .radialGradient(gradient, center: CGPoint(x: x, y: y), startRadius: 0, endRadius: r))
        }
      }
    }
    .ignoresSafeArea()
    .allowsHitTesting(false)
    .accessibilityHidden(true)
  }
}
