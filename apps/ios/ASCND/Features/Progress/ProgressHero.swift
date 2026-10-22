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
  static let rim: CGFloat = 1.6
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
        let level = results.first { $0.group == g }?.level ?? .insufficient
        let tint = ProgressStyle.color(g)
        let icon: Color
        switch level {
        case .good:
          ctx.fill(part, with: .color(tint))
          icon = .white
        case .attention:
          ctx.fill(part, with: .color(.black))
          var inner = ctx
          inner.clip(to: part)
          inner.stroke(part, with: .color(tint), style: StrokeStyle(lineWidth: Self.rim * 2, lineJoin: .round))
          icon = tint
        case .insufficient:
          // Sắc tối của chính màu nhóm, không phải xám chung.
          ctx.fill(part, with: .color(ProgressStyle.shade(g)))
          icon = tint.opacity(0.85)
        }
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

  /// "Tập luyện: cần chú ý. Vận động: tốt. …"
  static func spoken(_ results: [ProgressStatus.Result]) -> String {
    results.map { "\(ProgressStyle.name($0.group)): \(ProgressStyle.word($0.level))" }.joined(separator: ". ")
  }

  // MARK: - Hình

  /// Đường bao chữ A (dò từ ảnh `BrandMark` 222 × 222, bỏ đầu Koa, giản lược ≤ 0,3).
  static let logo: Path = {
    // Khung chữ A toàn đoạn thẳng (theo các mép của logo, kéo dài cho gặp nhau): đỉnh
    // phẳng, đáy chân nằm ngang. Mọi góc chỉ được bo bởi CÙNG một bán kính `corner`
    // khi tách mảng — các cạnh bo đều nhau (Kiệt 22/10).
    let pts: [(CGFloat, CGFloat)] = [
      (96.2, 35.5), (124.8, 35.5),  // đỉnh phẳng
      (210.2, 185), (173.7, 185),  // chân phải: mép ngoài, đáy ngang
      (110.5, 77.1),  // vòm trong (tách đôi ở giữa)
      (47.3, 185), (10.8, 185),  // chân trái: đáy ngang, mép ngoài
    ]
    var p = Path()
    p.move(to: CGPoint(x: pts[0].0, y: pts[0].1))
    for (x, y) in pts.dropFirst() { p.addLine(to: CGPoint(x: x, y: y)) }
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

  private static let rounded: [ProgressStatus.Group: Path] = {
    var out: [ProgressStatus.Group: Path] = [:]
    for g in ProgressStatus.Group.allCases {
      let p = sharp(g)
      let shrink = p.subtracting(p.strokedPath(StrokeStyle(lineWidth: (corner + gap) * 2, lineJoin: .miter)))
      out[g] = shrink.union(shrink.strokedPath(StrokeStyle(lineWidth: corner * 2, lineCap: .round, lineJoin: .round)))
    }
    return out
  }()

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

/// Chú thích ba cách tô dưới hình.
struct ProgressLegend: View {
  var body: some View {
    HStack(spacing: DS.Spacing.md) {
      item(.good) { RoundedRectangle(cornerRadius: 3).fill(DS.Color.foreground.swiftUI.opacity(0.8)) }
      item(.attention) { RoundedRectangle(cornerRadius: 3).strokeBorder(DS.Color.foreground.swiftUI.opacity(0.8), lineWidth: 1.3) }
      item(.insufficient) { RoundedRectangle(cornerRadius: 3).fill(DS.Color.mutedForeground.swiftUI.opacity(0.3)) }
    }
    .font(DS.TextStyle.caption)
    .foregroundStyle(DS.Color.mutedForeground.swiftUI)
    .frame(maxWidth: .infinity)
    .accessibilityHidden(true)
  }

  private func item(_ l: ProgressStatus.Level, @ViewBuilder mark: () -> some View) -> some View {
    HStack(spacing: 5) {
      mark().frame(width: 10, height: 10)
      Text(verbatim: ProgressStyle.word(l))
    }
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
