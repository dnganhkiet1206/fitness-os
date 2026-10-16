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
///
/// Chữ màu mực, một vệt ánh tím xám rất nhẹ lướt qua (16/10, chủ dự án chọn
/// hướng 3 — tông tối kiểu Siri iOS 27, ít màu). Giảm chuyển động: chữ đứng yên.
struct IntelligenceBadge: View {
  var size: CGFloat = 14
  var mark = true

  var body: some View {
    HStack(spacing: size * 0.55) {
      if mark { IntelligenceMark(size: size) }
      IntelligenceSheenText(text: Text("ai.brand"), font: .system(size: size * 0.86, weight: .semibold))
    }
    .accessibilityElement(children: .combine)
  }
}

/// Bảng màu dịu của ASCND Intelligence (hồng, xanh đậm, tím, cam nhạt — như sóng
/// của Siri iOS 27): chỉ dùng cho ánh, không bao giờ làm màu chữ hay nền.
enum IntelligenceTones {
  static let rose = Color(red: 0.91, green: 0.59, blue: 0.67)
  static let navy = Color(red: 0.27, green: 0.35, blue: 0.67)
  static let violet = Color(red: 0.59, green: 0.43, blue: 0.78)
  static let apricot = Color(red: 0.88, green: 0.59, blue: 0.43)
  static let sheen = Color(red: 0.44, green: 0.42, blue: 0.56)
}

/// Chữ mực có một vệt ánh lướt qua mỗi ~4 giây.
struct IntelligenceSheenText: View {
  let text: Text
  let font: Font
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    if reduceMotion {
      text.font(font).foregroundStyle(Intelligence.ink)
    } else {
      TimelineView(.animation(minimumInterval: 1 / 30)) { ctx in
        let phase = Self.phase(ctx.date)
        text.font(font).foregroundStyle(Self.gradient(phase))
      }
    }
  }

  /// 0…1 trong 4 giây; vệt đi từ ngoài trái qua ngoài phải (−0,3 → 1,3).
  static func phase(_ date: Date) -> Double {
    date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 4) / 4
  }

  static func gradient(_ phase: Double) -> LinearGradient {
    let c = -0.3 + 1.6 * phase
    let w = 0.14
    return LinearGradient(
      stops: [
        .init(color: Intelligence.ink, location: 0),
        .init(color: Intelligence.ink, location: max(0, min(1, c - w))),
        .init(color: IntelligenceTones.sheen, location: max(0, min(1, c))),
        .init(color: Intelligence.ink, location: max(0, min(1, c + w))),
        .init(color: Intelligence.ink, location: 1),
      ], startPoint: .leading, endPoint: .trailing)
  }
}

/// Quả cầu ASCND Intelligence khi AI đang làm việc (16/10, chủ dự án: kiểu Siri
/// iOS 27 — "trong suốt hơn, ba chấm thay vạch, chuyển động như Siri"). Cầu kính
/// trong (vật liệu mờ, nhìn xuyên nền), ba đốm màu dịu trôi lượn bên trong theo
/// quỹ đạo lệch nhịp, cầu "thở" nhẹ, ba chấm trắng nhấp nhô lần lượt. Thay ba
/// chấm / vòng quay ở mọi chỗ AI đang nghĩ. Giảm chuyển động: đứng yên.
struct IntelligenceOrb: View {
  var size: CGFloat = 40
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    TimelineView(.animation(minimumInterval: 1 / 30, paused: reduceMotion)) { ctx in
      let t = reduceMotion ? 0 : ctx.date.timeIntervalSinceReferenceDate
      ZStack {
        // Kính trong: vật liệu mờ + một lớp tối rất nhẹ cho chấm trắng nổi.
        Circle().fill(.ultraThinMaterial)
        Circle().fill(Color.black.opacity(0.16))
        // Ba đốm màu dịu trôi lượn (quỹ đạo Lissajous, mỗi đốm một nhịp).
        ZStack {
          blob(IntelligenceTones.violet, t, speed: 0.55, phase: 0)
          blob(IntelligenceTones.rose, t, speed: 0.43, phase: 2.1)
          blob(IntelligenceTones.navy, t, speed: 0.37, phase: 4.2)
          blob(IntelligenceTones.apricot, t, speed: 0.61, phase: 1.3).opacity(0.7)
        }
        .blur(radius: size * 0.16)
        .clipShape(Circle())
        // Ba chấm trắng nhấp nhô lần lượt.
        HStack(spacing: size * 0.09) {
          ForEach(0..<3, id: \.self) { i in
            let p = Self.dot(i, t)
            Circle()
              .fill(.white.opacity(0.65 + 0.35 * p))
              .frame(width: size * 0.12, height: size * 0.12)
              .offset(y: -size * 0.06 * p)
          }
        }
        // Mép kính: sáng phía trên, mảnh.
        Circle().strokeBorder(
          LinearGradient(colors: [.white.opacity(0.55), .white.opacity(0.08)], startPoint: .top, endPoint: .bottom),
          lineWidth: 0.8)
      }
      .frame(width: size, height: size)
      .scaleEffect(reduceMotion ? 1 : 1 + 0.035 * sin(t * 2 * Double.pi / 2.4))
      .shadow(color: IntelligenceTones.violet.opacity(0.25), radius: size * 0.22, y: size * 0.06)
    }
    .accessibilityHidden(true)
  }

  private func blob(_ color: Color, _ t: TimeInterval, speed: Double, phase: Double) -> some View {
    let r = size * 0.22
    let x = r * cos(t * speed * 2 + phase)
    let y = r * sin(t * speed * 3 + phase * 1.3)
    return Circle()
      .fill(color.opacity(0.75))
      .frame(width: size * 0.62, height: size * 0.62)
      .offset(x: x, y: y)
  }

  /// 0…1 cho chấm thứ `i`: nhịp ~1,2 s, mỗi chấm trễ 0,18 s.
  static func dot(_ i: Int, _ t: TimeInterval) -> Double {
    guard t > 0 else { return 0.5 }
    let local = (t - Double(i) * 0.18).truncatingRemainder(dividingBy: 1.2) / 1.2
    return local < 0.5 ? sin(local * 2 * Double.pi) * 1 : 0
  }
}
