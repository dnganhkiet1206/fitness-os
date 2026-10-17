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
///
/// 16/10 (chủ dự án chọn mock "A · Nhịp tim làm gạch chữ A"): dùng LẠI đúng logo
/// ASCND của app (`BrandMark` — chữ A và Koa giữ nguyên, không vẽ lại), thêm một
/// đường nhịp tim cắt ngang hai chân chữ A, có rãnh trong suốt tách nét. Một màu
/// (`ink`, mặc định màu chữ; trắng khi đè lên ảnh).
struct IntelligenceMark: View {
  var size: CGFloat = 18
  var ink: Color = Intelligence.ink
  /// Một vệt sáng chạy dọc nhịp tim MỘT lần khi hiện (logo gói trả phí trên Hôm
  /// nay — 16/10, chủ dự án: "thanh nhịp tim cũng di chuyển lúc logo AI hiện ra"),
  /// ngay trước vệt sáng lướt qua chữ. Giảm chuyển động: đứng yên.
  var glint = false
  @State private var start = Date()
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    if glint && !reduceMotion {
      TimelineView(.animation(minimumInterval: 1 / 30)) { tl in
        canvas(phase: min(1, max(0, (tl.date.timeIntervalSince(start) - 0.1) / 1.1)))
      }
      .onAppear { start = Date() }
    } else {
      canvas(phase: nil)
    }
  }

  private func canvas(phase: Double?) -> some View {
    Canvas { ctx, canvas in
      // Khung 222 × 222 của ảnh logo gốc.
      let k = min(canvas.width, canvas.height) / 222
      var logo = ctx.resolve(Image("BrandMark").renderingMode(.template))
      logo.shading = .color(ink)
      ctx.draw(logo, in: CGRect(origin: .zero, size: CGSize(width: 222 * k, height: 222 * k)))
      ctx.scaleBy(x: k, y: k)
      var cut = ctx
      cut.blendMode = .destinationOut
      cut.stroke(Self.pulse, with: .color(.black),
                 style: StrokeStyle(lineWidth: 17, lineCap: .round, lineJoin: .round))
      let shade: GraphicsContext.Shading
      if let phase {
        // Vệt sáng theo bề ngang nhịp tim (x 40 → 182).
        let c = -0.3 + 1.6 * phase, w = 0.22
        func at(_ v: Double) -> CGFloat { CGFloat(max(0, min(1, v))) }
        shade = .linearGradient(
          Gradient(stops: [
            .init(color: ink, location: 0), .init(color: ink, location: at(c - w)),
            .init(color: ink.opacity(0.28), location: at(c)),
            .init(color: ink, location: at(c + w)), .init(color: ink, location: 1),
          ]), startPoint: CGPoint(x: 40, y: 122), endPoint: CGPoint(x: 182, y: 122))
      } else {
        shade = .color(ink)
      }
      ctx.stroke(Self.pulse, with: shade,
                 style: StrokeStyle(lineWidth: 8, lineCap: .round, lineJoin: .round))
    }
    .frame(width: size, height: size)
    .accessibilityHidden(true)
  }

  /// Nhịp tim ngang qua hai chân chữ A của logo gốc.
  static let pulse: Path = {
    var p = Path()
    let pts: [(CGFloat, CGFloat)] = [(40, 122), (78, 122), (90, 100), (104, 146), (118, 106), (128, 122), (182, 122)]
    p.move(to: CGPoint(x: pts[0].0, y: pts[0].1))
    for (x, y) in pts.dropFirst() { p.addLine(to: CGPoint(x: x, y: y)) }
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

/// ASCND Intelligence khi AI đang làm việc (16/10, chủ dự án chọn mock "Y"): ký
/// hiệu ĐỨNG YÊN, dòng chữ "ASCND Intelligence" chuyển động — từng chữ lần lượt
/// sáng lên và nhích nhẹ như sóng (1,6 s một vòng, mỗi chữ trễ 0,05 s). Thay hiệu
/// ứng nhịp tim chạy trước đây. `size` là cỡ ký hiệu; chữ theo tỉ lệ. `ink`: trắng
/// khi đè lên ảnh tối. Giảm chuyển động: chữ đứng yên, đậm đủ.
struct IntelligenceOrb: View {
  var size: CGFloat = 40
  var ink: Color = Intelligence.ink
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    HStack(spacing: size * 0.3) {
      IntelligenceMark(size: size, ink: ink)
      wave
    }
    .accessibilityHidden(true)
  }

  private var font: Font { .system(size: max(13, size * 0.38), weight: .semibold) }

  private var wave: some View { IntelligenceWaveText(font: font, ink: ink) }

  /// 0…1 cho chữ thứ `i`: lên nhanh tới 30 % vòng rồi lắng dần (như CSS của mock).
  static func lift(_ t: TimeInterval, _ i: Int) -> Double {
    let cycle = 1.6
    var x = (t - Double(i) * 0.05).truncatingRemainder(dividingBy: cycle) / cycle
    if x < 0 { x += 1 }
    let r = x < 0.3 ? x / 0.3 : 1 - (x - 0.3) / 0.7
    return r * r * (3 - 2 * r)
  }
}

/// Chữ "ASCND Intelligence" sáng lên lần lượt từng chữ như sóng — MỘT hiệu ứng ánh
/// sáng dùng chung cho AI trong chat và logo gói trả phí trên Hôm nay (16/10, chủ
/// dự án: "logo AI dùng chung hiệu ứng ánh sáng của AI trong chat"). Giảm chuyển
/// động: chữ đứng yên, đậm đủ.
struct IntelligenceWaveText: View {
  let font: Font
  var ink: Color = Intelligence.ink
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  private var letters: [Character] { Array(String(localized: "ai.brand")) }

  var body: some View {
    if reduceMotion {
      Text("ai.brand").font(font).foregroundStyle(ink)
    } else {
      TimelineView(.animation(minimumInterval: 1 / 30)) { tl in
        let t = tl.date.timeIntervalSinceReferenceDate
        HStack(spacing: 0) {
          ForEach(Array(letters.enumerated()), id: \.offset) { i, c in
            let p = IntelligenceOrb.lift(t, i)
            Text(String(c))
              .font(font)
              .foregroundStyle(ink)
              .opacity(0.35 + 0.65 * p)
              .offset(y: -2 * p)
          }
        }
      }
    }
  }
}
