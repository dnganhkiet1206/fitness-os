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

  static let letter: Path = {
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

  static let pulse: Path = {
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

  static let koa: Path = {
    var p = Path()
    p.addPath(circle(-17, -9, 11))
    p.addPath(circle(17, -9, 11))
    p.addPath(circle(0, 0, 17))
    return p
  }()

  static let koaHoles: Path = {
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

/// ASCND Intelligence khi AI đang làm việc (16/10, chủ dự án: bỏ quả cầu tròn —
/// "hơi giống chatbot", phải hợp nền kem; chọn mock "1 · Nhịp tim chạy qua logo,
/// màu theo Siri mới", và nhắc phải khớp đúng mock). Chính ký hiệu chữ A: gạch
/// nhịp tim được vẽ đi vẽ lại bằng một nét đen trong như kính tối, lõi mảnh ánh màu
/// Siri iOS 27 (xanh dương → tím → hồng → cam, trôi), chữ A thở 55 % ↔ 100 % trong 1,8 s. Không khung, không quầng; rãnh
/// quanh nhịp tim trong suốt nên lộ đúng nền kem. `ink`: màu chữ A (trắng khi đè
/// lên ảnh tối). Giảm chuyển động: nhịp tim tô đủ màu, đứng yên.
struct IntelligenceOrb: View {
  var size: CGFloat = 40
  var ink: Color = Intelligence.ink
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  /// Dải màu Siri iOS 27 cho lõi ánh của nét nhịp tim (chủ dự án: "phải mang màu
  /// của Siri AI iOS 27" rồi "màu phải đen clear"): xanh dương → tím → hồng → cam.
  static let siri: [Color] = [
    Color(red: 0.03, green: 0.58, blue: 1.00),
    Color(red: 0.79, green: 0.35, blue: 0.87),
    Color(red: 1.00, green: 0.18, blue: 0.33),
    Color(red: 1.00, green: 0.56, blue: 0.02),
  ]

  var body: some View {
    TimelineView(.animation(minimumInterval: 1 / 30, paused: reduceMotion)) { tl in
      let t = reduceMotion ? 0 : tl.date.timeIntervalSinceReferenceDate
      Canvas { ctx, canvas in
        let k = min(canvas.width, canvas.height) / 220
        ctx.scaleBy(x: k, y: k)
        let mark = IntelligenceMark.self
        var a = ctx
        a.opacity = Self.breath(t)
        a.fill(mark.letter, with: .color(ink))
        var cut = a
        cut.blendMode = .destinationOut
        cut.stroke(mark.pulse, with: .color(.black),
                   style: StrokeStyle(lineWidth: 16, lineCap: .round, lineJoin: .round))
        a.fill(mark.koa, with: .color(ink))
        cut.fill(mark.koaHoles, with: .color(.black))
        let shade = Self.shading(t)
        let line = StrokeStyle(lineWidth: 9, lineCap: .round, lineJoin: .round)
        // Đen trong như kính tối (chủ dự án: "màu phải đen clear"): thân nét màu mực
        // hơi trong, lõi mảnh ánh màu Siri rất nhẹ trôi bên trong.
        let core = StrokeStyle(lineWidth: 3, lineCap: .round, lineJoin: .round)
        for (from, to) in Self.dashes(t) {
          let lit = mark.pulse.trimmedPath(from: from, to: to)
          ctx.stroke(lit, with: .color(ink.opacity(0.82)), style: line)
          var glint = ctx
          glint.opacity = 0.55
          glint.stroke(lit, with: shade, style: core)
        }
      }
      .frame(width: size, height: size)
    }
    .accessibilityHidden(true)
  }

  /// Màu trôi dọc gạch nhịp tim như viền Siri: một vòng 4 màu dài 232 (gấp đôi
  /// gạch), trượt trọn một vòng mỗi 3 s nên nối liền không giật.
  static func shading(_ t: TimeInterval) -> GraphicsContext.Shading {
    let cycle: CGFloat = 232
    let shift = CGFloat(t.truncatingRemainder(dividingBy: 3) / 3) * cycle
    let colors = siri + siri + [siri[0]]
    return .linearGradient(Gradient(colors: colors),
                           startPoint: CGPoint(x: 52 - shift, y: 124),
                           endPoint: CGPoint(x: 52 - shift + 2 * cycle, y: 124))
  }

  /// Độ đậm chữ A: 0,55 → 1 → 0,55 trong 1,8 s (ease-in-out). Đứng yên: 1.
  static func breath(_ t: TimeInterval) -> Double {
    guard t > 0 else { return 1 }
    let p = t.truncatingRemainder(dividingBy: 1.8) / 1.8
    return 0.55 + 0.45 * (0.5 - 0.5 * cos(p * 2 * Double.pi))
  }

  /// Độ dài gạch nhịp tim trong khung 220 (tổng các đoạn thẳng).
  static let length: Double = {
    let pts: [(Double, Double)] = [(52, 124), (84, 124), (94, 104), (108, 146), (120, 116), (128, 124), (168, 124)]
    return zip(pts, pts.dropFirst()).reduce(0) { $0 + hypot($1.1.0 - $1.0.0, $1.1.1 - $1.0.1) }
  }()

  /// Các đoạn sáng (0…1 theo chiều dài), như mock: nét đứt 130 sáng / 130 tối,
  /// độ lệch chạy 260 → 0 trong 60 % đầu rồi 0 → −260 trong 40 % còn lại, mỗi chặng
  /// ease-in-out. Đứng yên (t = 0): cả đường.
  static func dashes(_ t: TimeInterval) -> [(CGFloat, CGFloat)] {
    guard t > 0 else { return [(0, 1)] }
    func ease(_ x: Double) -> Double { x * x * (3 - 2 * x) }
    let p = t.truncatingRemainder(dividingBy: 1.8) / 1.8
    let offset = p < 0.6 ? 260 * (1 - ease(p / 0.6)) : -260 * ease((p - 0.6) / 0.4)
    // Nét k sáng từ k·260 − offset đến k·260 − offset + 130.
    var out: [(CGFloat, CGFloat)] = []
    for k in -2...2 {
      let s = Double(k) * 260 - offset, e = s + 130
      let a = max(0, s) / length, b = min(length, e) / length
      if b > a { out.append((CGFloat(a), CGFloat(b))) }
    }
    return out
  }
}
