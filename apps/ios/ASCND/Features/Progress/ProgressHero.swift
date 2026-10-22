import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Hình chính của Tiến bộ (#527, Kiệt duyệt mock `progress-status-words.html` bản 10):
/// chữ A của logo ASCND (`BrandMark`, không Koa), liền khối, tách 6 mảng theo đường leo —
/// chân trái dưới → trên → đỉnh → chân phải trên → dưới — bằng đường mảnh.
///
/// Mỗi mảng một nhóm, màu của chính nhóm ấy trong app; cách tô theo Health:
/// Tốt = tô đặc, icon trắng · Cần chú ý = viền màu, nền đen, icon màu ·
/// Chưa đủ dữ liệu = sắc tối của CHÍNH màu nhóm (như ô nâu đậm của Health), icon màu.
/// 22/10 (Kiệt): mọi mảng bo tròn và tách nhau bằng khe như cánh hoa của Apple.
/// Chạm một mảng → chi tiết nhóm.
struct ProgressHero: View {
  let results: [ProgressStatus.Result]
  var onTap: (ProgressStatus.Group) -> Void = { _ in }

  /// Khung vẽ trong toạ độ 222 × 222 của ảnh logo (cắt sát chữ A).
  static let frame = CGRect(x: 2, y: 30, width: 218, height: 166)
  static let rim: CGFloat = 1.3
  static let hairline: CGFloat = 0.9
  /// Bán kính bo góc và nửa khe giữa hai mảng (đơn vị khung 222).
  static let corner: CGFloat = 6
  static let gap: CGFloat = 0.3

  var body: some View {
    Canvas { ctx, size in
      let k = size.width / Self.frame.width
      ctx.scaleBy(x: k, y: k)
      ctx.translateBy(x: -Self.frame.minX, y: -Self.frame.minY)
      for g in ProgressStatus.Group.allCases {
        let part = Self.part(g)
        let result = results.first { $0.group == g }
        let level = result?.level ?? .insufficient
        let fill = result.map(ProgressStatus.fill) ?? 0
        let tint = ProgressStyle.color(g)
        // Nấc như cánh hoa của Apple Health (Kiệt 22/10): nền = sắc tối của màu nhóm; bên
        // trong là CÙNG hình mảng thu nhỏ đồng tâm, diện tích theo nấc 25 / 50 / 75 / 100 %
        // của số thật. Chưa đủ dữ liệu: mảng trong mờ hơn.
        ctx.fill(part, with: .color(ProgressStyle.shade(g)))
        let tier = Self.tier(fill)
        if tier > 0 {
          let c = CGPoint(x: part.boundingRect.midX, y: part.boundingRect.midY)
          let k = CGFloat(tier.squareRoot())
          let inner = part.applying(
            CGAffineTransform(translationX: c.x, y: c.y).scaledBy(x: k, y: k).translatedBy(x: -c.x, y: -c.y))
          ctx.fill(inner, with: .color(level == .insufficient ? tint.opacity(0.45) : tint))
        }
        // Cần chú ý: thêm viền mảnh đều quanh mảng.
        if level == .attention {
          ctx.fill(part.subtracting(Self.core(g)), with: .color(tint))
        }
        // Icon nằm giữa mảng = trên mảng trong đồng tâm: có nấc thì trắng, không thì màu nhóm.
        let icon: Color = tier > 0 ? .white : tint
        // Icon SF Symbol giữ đúng tỉ lệ gốc của Apple (Kiệt 22/10: không bóp vào ô vuông).
        let symbol = ctx.resolve(
          Text(Image(systemName: ProgressStyle.symbol(g))).font(.system(size: 11, weight: .semibold)).foregroundStyle(icon))
        ctx.draw(symbol, at: Self.iconCenter(g), anchor: .center)
      }
    }
    .aspectRatio(Self.frame.width / Self.frame.height, contentMode: .fit)
    .overlay {
      GeometryReader { geo in
        let k = geo.size.width / Self.frame.width
        ForEach(ProgressStatus.Group.allCases, id: \.self) { g in
          let r = Self.rect(g).intersection(Self.frame)
          Color.clear
            .contentShape(Rectangle())
            .frame(width: r.width * k, height: r.height * k)
            .position(x: (r.midX - Self.frame.minX) * k, y: (r.midY - Self.frame.minY) * k)
            .onTapGesture { onTap(g) }
        }
      }
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(Self.spoken(results)))
  }

  /// "Tập luyện: cần chú ý, 50 %. Vận động: tốt, 100 %. …"
  static func spoken(_ results: [ProgressStatus.Result]) -> String {
    results.map {
      let pct = Int((ProgressStatus.fill($0) * 100).rounded())
      return "\(ProgressStyle.name($0.group)): \(ProgressStyle.word($0.level)), \(pct) %"
    }.joined(separator: ". ")
  }

  /// Nấc của mảng: 0, ¼, ½, ¾, 1 (làm tròn lên — có chút số là thấy ¼).
  static func tier(_ fill: Double) -> Double {
    guard fill > 0 else { return 0 }
    return min(1, (fill * 4).rounded(.up) / 4)
  }

  // MARK: - Hình

  /// Đường bao chữ A (dò từ ảnh `BrandMark` 222 × 222, bỏ đầu Koa, giản lược ≤ 0,3).
  static let logo: Path = {
    // Đỉnh và hai mép trong / ngoài giữ theo logo; hai bàn chân vẽ lại bằng đường cong
    // liền (đường dò cũ gãy khúc ở đáy — Kiệt 22/10). Bản chân thẳng, đáy ngang bị Kiệt
    // chê xấu hơn — giữ bản cong này.
    var p = Path()
    p.move(to: CGPoint(x: 110.5, y: 35.4))
    p.addCurve(to: CGPoint(x: 91.3, y: 44), control1: CGPoint(x: 101, y: 35.6), control2: CGPoint(x: 95, y: 38))
    p.addLine(to: CGPoint(x: 14.2, y: 179))
    p.addQuadCurve(to: CGPoint(x: 17.5, y: 185), control: CGPoint(x: 10.8, y: 185))
    p.addCurve(to: CGPoint(x: 57.7, y: 167), control1: CGPoint(x: 36, y: 184.5), control2: CGPoint(x: 50.5, y: 178))
    p.addLine(to: CGPoint(x: 104.1, y: 88))
    p.addQuadCurve(to: CGPoint(x: 117, y: 88), control: CGPoint(x: 110.5, y: 77))
    p.addLine(to: CGPoint(x: 162, y: 165))
    p.addCurve(to: CGPoint(x: 203.5, y: 185), control1: CGPoint(x: 169.5, y: 177), control2: CGPoint(x: 185, y: 184.5))
    p.addQuadCurve(to: CGPoint(x: 206.8, y: 179), control: CGPoint(x: 210.2, y: 185))
    p.addLine(to: CGPoint(x: 129.1, y: 43))
    p.addCurve(to: CGPoint(x: 110.5, y: 35.4), control1: CGPoint(x: 126, y: 38), control2: CGPoint(x: 120, y: 35.6))
    p.closeSubpath()
    return p
  }()

  /// Ô chữ nhật của mảng; các ô cách nhau `hairline` (đường mảnh giữa các tầng / ở đỉnh).
  static func rect(_ g: ProgressStatus.Group) -> CGRect {
    let h = hairline / 2, mid: CGFloat = 110.5, t1: CGFloat = 85.5, t2: CGFloat = 131
    switch g {
    case .training: return CGRect(x: -10, y: t2 + h, width: mid - h + 10, height: 80)
    case .steps: return CGRect(x: -10, y: t1 + h, width: mid - h + 10, height: t2 - t1 - 2 * h)
    case .nutrition: return CGRect(x: -10, y: 0, width: mid - h + 10, height: t1 - h)
    case .sleep: return CGRect(x: mid + h, y: 0, width: 130, height: t1 - h)
    case .recovery: return CGRect(x: mid + h, y: t1 + h, width: 130, height: t2 - t1 - 2 * h)
    case .body: return CGRect(x: mid + h, y: t2 + h, width: 130, height: 80)
    }
  }

  /// Mảng đã bo: thu vào `corner + gap` (góc vẫn nhọn), rồi nở ra `corner` với khớp tròn
  /// — góc lồi thành cung bán kính `corner`, mảng nhỏ đi `gap` mỗi phía nên giữa hai mảng
  /// có khe. Tính một lần.
  static func part(_ g: ProgressStatus.Group) -> Path { rounded[g] ?? sharp(g) }

  static func sharp(_ g: ProgressStatus.Group) -> Path { logo.intersection(Path(rect(g))) }

  /// Lõi của mảng "Cần chú ý".
  static func core(_ g: ProgressStatus.Group) -> Path { cores[g] ?? part(g) }

  /// Thu `inset + corner` (góc nhọn) rồi nở `corner` khớp tròn.
  private static func opened(_ p: Path, inset: CGFloat) -> Path {
    let shrink = p.subtracting(p.strokedPath(StrokeStyle(lineWidth: (corner + inset) * 2, lineJoin: .miter)))
    return shrink.union(shrink.strokedPath(StrokeStyle(lineWidth: corner * 2, lineCap: .round, lineJoin: .round)))
  }

  private static let rounded: [ProgressStatus.Group: Path] = Dictionary(
    uniqueKeysWithValues: ProgressStatus.Group.allCases.map { ($0, opened(sharp($0), inset: gap)) })

  /// Lõi = mảng đã bo trừ đi một dải rộng đúng `rim` (khớp tròn) — viền dày ĐỀU ở mọi
  /// cạnh và góc, góc trong đồng tâm với góc ngoài (Kiệt 22/10: "các nét mỏng đều").
  private static let cores: [ProgressStatus.Group: Path] = Dictionary(
    uniqueKeysWithValues: ProgressStatus.Group.allCases.map { g in
      let p = part(g)
      return (g, p.subtracting(p.strokedPath(StrokeStyle(lineWidth: rim * 2, lineJoin: .round))))
    })

  static func iconCenter(_ g: ProgressStatus.Group) -> CGPoint {
    switch g {
    case .training: CGPoint(x: 43, y: 160)
    case .steps: CGPoint(x: 72, y: 110)
    case .nutrition: CGPoint(x: 96, y: 62)
    case .sleep: CGPoint(x: 125, y: 62)
    case .recovery: CGPoint(x: 149, y: 110)
    case .body: CGPoint(x: 178, y: 160)
    }
  }
}

/// Chú thích dưới hình: phần tô = mức đạt mục tiêu 7 ngày; viền = cần chú ý.
struct ProgressLegend: View {
  var body: some View {
    HStack(spacing: DS.Spacing.md) {
      HStack(spacing: 5) {
        ZStack(alignment: .bottom) {
          RoundedRectangle(cornerRadius: 3).fill(DS.Color.foreground.swiftUI.opacity(0.25))
          RoundedRectangle(cornerRadius: 3).fill(DS.Color.foreground.swiftUI.opacity(0.85)).frame(height: 6)
        }
        .frame(width: 10, height: 10)
        Text("ps.legend.fill")
      }
      HStack(spacing: 5) {
        RoundedRectangle(cornerRadius: 3).strokeBorder(DS.Color.foreground.swiftUI.opacity(0.85), lineWidth: 1.3)
          .frame(width: 10, height: 10)
        Text(verbatim: ProgressStyle.word(.attention))
      }
    }
    .font(DS.TextStyle.caption)
    .foregroundStyle(DS.Color.mutedForeground.swiftUI)
    .frame(maxWidth: .infinity)
    .accessibilityHidden(true)
  }
}

/// Tên, màu, icon, chữ trạng thái của từng nhóm — một chỗ cho hình, thẻ và chi tiết.
enum ProgressStyle {
  /// Màu của chính nhóm trong app (Hôm nay / Vận động / Sẵn sàng / Cơ thể).
  static func color(_ g: ProgressStatus.Group) -> Color {
    switch g {
    case .training: DS.Color.metricRose.swiftUI
    case .steps: DS.Color.readinessGreen.swiftUI
    case .nutrition: DS.Color.metricOrangeGraphic.swiftUI
    case .sleep: DS.Color.metricPurple.swiftUI
    // Đỏ sáng (Kiệt 22/10) — đỏ tươi nhất của bảng màu app.
    case .recovery: DS.Color.destructive.swiftUI
    case .body: DS.Color.metricSteel.swiftUI
    }
  }

  /// Sắc tối của màu nhóm cho "Chưa đủ dữ liệu" — cùng màu, chỉ tối đi (Kiệt 22/10).
  static func shade(_ g: ProgressStatus.Group) -> Color { color(g).mix(with: .black, by: 0.62) }

  /// SF Symbols như Apple Health (Kiệt 22/10: "nhìn cách Apple vẽ icon mà học theo"):
  /// người cử tạ qua đầu, người chạy, cà rốt, giường (Ngủ của Health), tim, người dang tay
  /// (Số đo cơ thể của Health).
  static func symbol(_ g: ProgressStatus.Group) -> String {
    switch g {
    case .training: "figure.strengthtraining.traditional"
    case .steps: "figure.run"
    case .nutrition: "carrot.fill"
    case .sleep: "bed.double.fill"
    case .recovery: "heart.fill"
    case .body: "figure.arms.open"
    }
  }

  static func name(_ g: ProgressStatus.Group) -> String {
    switch g {
    case .training: String(localized: "ps.g.training")
    case .steps: String(localized: "ps.g.steps")
    case .nutrition: String(localized: "ps.g.nutrition")
    case .sleep: String(localized: "ps.g.sleep")
    case .recovery: String(localized: "ps.g.recovery")
    case .body: String(localized: "ps.g.body")
    }
  }

  static func word(_ l: ProgressStatus.Level) -> String {
    switch l {
    case .good: String(localized: "ps.l.good")
    case .attention: String(localized: "ps.l.attention")
    case .insufficient: String(localized: "ps.l.insufficient")
    }
  }
}
