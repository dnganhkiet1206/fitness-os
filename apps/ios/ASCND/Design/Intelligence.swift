import ASCNDDesignSystem
import SwiftUI

/// ASCND Intelligence (15/10, chủ dự án: "các tính năng liên quan đến AI thì đều
/// được gọi là ASCND Intelligence"). Một ký hiệu chung cho mọi chỗ AI — Insight,
/// Koa Coach, gợi ý bữa, phân tích tuần, quét món — thay cho `sparkles` rời rạc.
///
/// Ký hiệu (15/10, chủ dự án: "màu tối… logo phải có Koa"): chính logo ASCND
/// (`BrandMark` — chữ "A" có Koa, tối trên nền sáng / sáng trên nền tối) và một tia
/// sáng bốn cánh ở góc trên phải, cùng màu chữ. Không dải màu.
enum Intelligence {
  static let ink = DS.Color.foreground.swiftUI
  /// Nền tròn cho ký hiệu khi đứng một mình (hàng trong bảng, avatar chat).
  static let wash = DS.Color.secondary.swiftUI
}

/// Ký hiệu ASCND Intelligence — chỉ hình, không chữ. Trang trí: ẩn khỏi VoiceOver
/// (chỗ đặt nó luôn có chữ đi kèm).
struct IntelligenceMark: View {
  var size: CGFloat = 18

  var body: some View {
    Image("BrandMark")
      .resizable()
      .interpolation(.high)
      .scaledToFit()
      .frame(width: size, height: size)
      .overlay(alignment: .topTrailing) {
        Sparkle()
          .fill(Intelligence.ink)
          .frame(width: size * 0.42, height: size * 0.42)
          .offset(x: size * 0.2, y: -size * 0.14)
      }
      .accessibilityHidden(true)
  }
}

/// Ký hiệu + chữ "ASCND Intelligence": nhãn "do AI làm" ở thẻ và màn AI.
/// `mark: false` khi ký hiệu lớn đã đứng ngay cạnh (không lặp hai ký hiệu).
struct IntelligenceBadge: View {
  var size: CGFloat = 14
  var mark = true

  var body: some View {
    HStack(spacing: size * 0.55) {
      if mark { IntelligenceMark(size: size) }
      Text("ai.brand")
        .font(.system(size: size * 0.86, weight: .semibold))
        .foregroundStyle(Intelligence.ink)
    }
    .accessibilityElement(children: .combine)
  }
}

/// Tia sáng bốn cánh, cạnh lõm.
private struct Sparkle: Shape {
  func path(in r: CGRect) -> Path {
    // Điểm điều khiển lệch khỏi tâm về từng góc: cánh thon mà vẫn có thân.
    let k = r.width * 0.1
    var p = Path()
    p.move(to: CGPoint(x: r.midX, y: r.minY))
    p.addQuadCurve(to: CGPoint(x: r.maxX, y: r.midY), control: CGPoint(x: r.midX + k, y: r.midY - k))
    p.addQuadCurve(to: CGPoint(x: r.midX, y: r.maxY), control: CGPoint(x: r.midX + k, y: r.midY + k))
    p.addQuadCurve(to: CGPoint(x: r.minX, y: r.midY), control: CGPoint(x: r.midX - k, y: r.midY + k))
    p.addQuadCurve(to: CGPoint(x: r.midX, y: r.minY), control: CGPoint(x: r.midX - k, y: r.midY - k))
    p.closeSubpath()
    return p
  }
}
