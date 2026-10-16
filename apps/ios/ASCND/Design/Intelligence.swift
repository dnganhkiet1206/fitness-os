import ASCNDDesignSystem
import SwiftUI

/// ASCND Intelligence (15/10, chủ dự án: "các tính năng liên quan đến AI thì đều
/// được gọi là ASCND Intelligence"). Một ký hiệu chung cho mọi chỗ AI — Insight,
/// Koa Coach, gợi ý bữa, phân tích tuần, quét món — thay cho `sparkles` rời rạc.
///
/// Ký hiệu (15/10, chủ dự án chọn mock "E · Nhịp tim là gạch ngang chữ A"): chữ
/// "A" khối đặc của logo ASCND, gạch ngang là một đường nhịp tim (tech + fitness),
/// đầu Koa giữa hai chân. Một màu — màu chữ (tối trên nền sáng, sáng trên nền tối);
/// chi tiết bên trong là phần khoét trong suốt, đặt lên nền nào cũng đúng.
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
    Canvas { ctx, canvas in
      // Vẽ trong khung 220 × 220 của mock rồi co về đúng cỡ.
      let k = min(canvas.width, canvas.height) / 220
      ctx.scaleBy(x: k, y: k)
      ctx.fill(Self.letter, with: .foreground)
      // Gạch nhịp tim: khoét một rãnh rộng quanh nó cho tách khỏi hai chân chữ.
      var cut = ctx
      cut.blendMode = .destinationOut
      cut.stroke(Self.pulse, with: .color(.black),
                 style: StrokeStyle(lineWidth: 16, lineCap: .round, lineJoin: .round))
      ctx.stroke(Self.pulse, with: .foreground,
                 style: StrokeStyle(lineWidth: 7, lineCap: .round, lineJoin: .round))
      ctx.fill(Self.koa, with: .foreground)
      cut.fill(Self.koaHoles, with: .color(.black))
    }
    .foregroundStyle(Intelligence.ink)
    .frame(width: size, height: size)
    .accessibilityHidden(true)
  }

  private static let letter: Path = {
    var p = Path()
    p.move(to: CGPoint(x: 14, y: 190))
    p.addLine(to: CGPoint(x: 92, y: 38))
    p.addQuadCurve(to: CGPoint(x: 110, y: 24), control: CGPoint(x: 100, y: 24))
    p.addQuadCurve(to: CGPoint(x: 128, y: 38), control: CGPoint(x: 120, y: 24))
    p.addLine(to: CGPoint(x: 206, y: 190))
    p.addLine(to: CGPoint(x: 160, y: 190))
    p.addLine(to: CGPoint(x: 110, y: 92))
    p.addLine(to: CGPoint(x: 60, y: 190))
    p.closeSubpath()
    return p
  }()

  private static let pulse: Path = {
    var p = Path()
    let pts: [(CGFloat, CGFloat)] = [(52, 124), (84, 124), (94, 104), (108, 146), (120, 116), (128, 124), (168, 124)]
    p.move(to: CGPoint(x: pts[0].0, y: pts[0].1))
    for (x, y) in pts.dropFirst() { p.addLine(to: CGPoint(x: x, y: y)) }
    return p
  }()

  /// Đầu Koa của logo, tâm (110, 172), tỉ lệ 0,9.
  private static func circle(_ x: CGFloat, _ y: CGFloat, _ r: CGFloat) -> Path {
    let c = CGPoint(x: 110 + x * 0.9, y: 172 + y * 0.9), rr = r * 0.9
    return Path(ellipseIn: CGRect(x: c.x - rr, y: c.y - rr, width: rr * 2, height: rr * 2))
  }

  private static let koa: Path = {
    var p = Path()
    p.addPath(circle(-17, -9, 11))
    p.addPath(circle(17, -9, 11))
    p.addPath(circle(0, 0, 17))
    return p
  }()

  private static let koaHoles: Path = {
    var p = Path()
    p.addPath(circle(-17, -9, 5.5))
    p.addPath(circle(17, -9, 5.5))
    p.addPath(circle(-7, -3, 2.6))
    p.addPath(circle(7, -3, 2.6))
    p.addEllipse(in: CGRect(x: 110 - 5 * 0.9, y: 172 + (6 - 6.5) * 0.9, width: 10 * 0.9, height: 13 * 0.9))
    return p
  }()
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
