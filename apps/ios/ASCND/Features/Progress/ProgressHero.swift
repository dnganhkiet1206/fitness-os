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
  static let hairline: CGFloat = 0

  var body: some View {
    Canvas { ctx, size in
      let k = size.width / Self.frame.width
      ctx.scaleBy(x: k, y: k)
      ctx.translateBy(x: -Self.frame.minX, y: -Self.frame.minY)
      // Vẽ từ dưới lên: mảng trên đè mảng dưới, có bóng mờ (theo hình mẫu Kiệt 22/10).
      for g in Self.drawOrder {
        let shape = Self.shape(g)
        let level = results.first { $0.group == g }?.level ?? .insufficient
        let tint = ProgressStyle.color(g)
        ctx.drawLayer { layer in
          // Bóng tối rõ ở chỗ nối: mảng trên tách khỏi mảng dưới như hình mẫu.
          layer.addFilter(.shadow(color: .black.opacity(0.85), radius: 3, x: 0, y: 1.5))
          switch level {
          case .good: layer.fill(shape, with: .color(tint))
          case .attention:
            layer.fill(shape, with: .color(tint))
            layer.fill(Self.inner(g), with: .color(.black))
          case .insufficient: layer.fill(shape, with: .color(Color(white: 0.17)))
          }
        }
        let icon: Color = switch level {
        case .good: .white
        case .attention: tint
        case .insufficient: .white.opacity(0.75)
        }
        // Icon SF Symbol giữ đúng tỉ lệ gốc của Apple.
        let symbol = ctx.resolve(
          Text(Image(systemName: ProgressStyle.symbol(g))).font(.system(size: 13, weight: .semibold)).foregroundStyle(icon))
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

  // MARK: - Hình theo mẫu (Kiệt 22/10)

  /// Dưới → trên, để mảng trên phủ lên mảng dưới.
  static let drawOrder: [ProgressStatus.Group] = [.training, .body, .steps, .recovery, .nutrition, .sleep]
  /// Hình của mảng — dò từ thiết kế Kiệt dựng (22/10, ảnh Progress 10:39), quy về khung
  /// 222 của chữ A hiện tại.
  static func shape(_ g: ProgressStatus.Group) -> Path { shapes[g] ?? Path() }

  private static let traced: [ProgressStatus.Group: [(CGFloat, CGFloat)]] = [
    .nutrition: [(102.16, 85.12), (104.79, 84.07), (108.02, 81.19), (109.08, 79.84), (110.46, 75.91), (110.46, 43.08), (109.52, 41.77), (108.72, 39.29), (106.97, 37.80), (106.10, 37.22), (104.79, 37.22), (102.16, 35.87), (99.51, 35.87), (95.58, 37.22), (94.27, 38.49), (92.96, 38.75), (88.70, 43.08), (88.22, 44.39), (86.15, 47.01), (82.47, 53.53), (82.07, 54.91), (73.05, 70.67), (72.68, 71.98), (71.52, 73.29), (70.64, 75.77), (70.61, 78.53), (70.79, 79.84), (72.32, 82.50), (74.57, 84.47), (76.21, 85.12), (95.58, 85.30), (96.89, 85.63), (100.85, 85.30)],
    .sleep: [(144.28, 85.12), (146.79, 84.21), (149.63, 81.19), (150.07, 78.53), (149.67, 73.29), (133.65, 44.68), (128.41, 39.26), (125.79, 37.58), (121.86, 36.02), (115.30, 35.18), (107.41, 35.22), (106.10, 36.49), (108.93, 39.15), (111.19, 43.08), (111.19, 75.91), (111.56, 78.53), (112.14, 79.84), (115.27, 83.12), (117.89, 84.79), (119.20, 85.08), (142.82, 85.30)],
    .steps: [(75.81, 131.09), (80.40, 128.47), (83.78, 124.21), (97.18, 100.88), (97.61, 99.57), (98.85, 98.26), (100.42, 94.33), (100.53, 91.67), (99.51, 89.05), (98.42, 87.74), (96.89, 86.43), (95.58, 85.99), (75.88, 85.99), (74.57, 85.27), (71.95, 85.27), (68.02, 86.18), (64.31, 89.05), (63.22, 90.36), (57.61, 99.57), (54.37, 106.12), (48.33, 116.46), (46.62, 120.57), (46.47, 123.23), (48.33, 128.14), (50.95, 130.51), (53.57, 131.75), (54.88, 132.08), (73.26, 132.08), (74.57, 131.75)],
    .recovery: [(168.99, 131.09), (170.41, 130.37), (172.56, 128.47), (174.13, 125.85), (174.45, 124.54), (174.20, 119.26), (172.41, 115.33), (169.72, 111.40), (169.43, 110.09), (161.39, 95.64), (159.13, 91.67), (157.96, 90.36), (157.27, 88.11), (154.65, 83.85), (153.34, 82.61), (150.94, 81.19), (148.10, 84.21), (145.48, 85.74), (144.17, 85.96), (120.51, 86.03), (118.76, 87.74), (118.58, 90.36), (119.05, 91.67), (124.88, 102.19), (126.12, 103.50), (127.10, 105.98), (132.74, 115.33), (133.18, 116.64), (134.34, 117.95), (134.74, 119.26), (137.76, 124.54), (141.51, 128.73), (142.82, 129.75), (145.48, 130.77), (146.79, 131.68), (149.41, 132.08), (165.13, 132.08), (167.79, 131.75)],
    .training: [(39.27, 184.96), (43.09, 184.05), (44.40, 182.96), (46.40, 182.34), (50.95, 178.67), (54.70, 174.44), (58.12, 167.89), (63.00, 159.99), (63.40, 158.68), (64.56, 157.37), (64.71, 156.06), (65.87, 154.75), (74.76, 138.99), (74.79, 135.02), (74.39, 133.71), (73.26, 132.88), (71.95, 132.48), (54.88, 132.48), (50.95, 131.49), (49.64, 130.37), (48.33, 130.18), (45.71, 130.47), (41.78, 132.37), (37.85, 136.15), (30.06, 149.47), (26.75, 156.06), (23.47, 161.30), (21.76, 165.27), (21.43, 173.13), (21.87, 175.75), (24.05, 179.72), (27.33, 182.74), (29.95, 184.31), (33.73, 184.96), (35.23, 185.62), (36.54, 185.62), (37.85, 185.04)],
    .body: [(188.50, 184.96), (191.42, 184.24), (194.04, 182.60), (196.00, 181.03), (197.97, 178.41), (200.11, 173.13), (200.19, 167.89), (198.59, 162.61), (195.96, 158.68), (195.60, 157.37), (192.40, 152.13), (192.00, 150.82), (190.80, 149.47), (185.30, 138.99), (184.10, 137.68), (183.77, 136.37), (179.59, 129.93), (176.96, 127.45), (175.65, 126.80), (174.13, 127.16), (173.69, 128.47), (172.67, 129.78), (170.41, 131.42), (167.86, 132.40), (149.41, 132.48), (146.79, 132.88), (146.13, 133.71), (145.88, 135.02), (146.10, 138.99), (159.46, 162.61), (160.66, 163.92), (162.44, 167.89), (165.72, 173.13), (166.95, 174.44), (167.50, 175.75), (173.03, 181.03), (178.27, 184.24), (183.52, 185.04), (184.83, 185.62), (187.45, 185.25)],
  ]

  /// Nối các điểm dò bằng đường cong qua trung điểm — mép mượt, không răng cưa.
  private static let shapes: [ProgressStatus.Group: Path] = traced.mapValues { raw in
    let q = raw.map { CGPoint(x: $0.0, y: $0.1) }
    let n = q.count
    func mid(_ a: CGPoint, _ b: CGPoint) -> CGPoint { CGPoint(x: (a.x + b.x) / 2, y: (a.y + b.y) / 2) }
    var p = Path()
    p.move(to: mid(q[n - 1], q[0]))
    for i in 0..<n { p.addQuadCurve(to: mid(q[i], q[(i + 1) % n]), control: q[i]) }
    p.closeSubpath()
    return p
  }

  /// Tâm icon = tâm khung bao của mảng đã dò.
  static func iconCenter(_ g: ProgressStatus.Group) -> CGPoint {
    let b = shape(g).boundingRect
    return CGPoint(x: b.midX, y: b.midY)
  }

  /// Lõi đen của mảng "Cần chú ý": viền đều `rim × 1.6`.
  static func inner(_ g: ProgressStatus.Group) -> Path {
    let p = shape(g)
    return p.subtracting(p.strokedPath(StrokeStyle(lineWidth: rim * 1.7, lineJoin: .round)))
  }

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

  static func sharp(_ g: ProgressStatus.Group) -> Path { logo.intersection(Path(rect(g))) }


}

/// Chú thích ba trạng thái dưới hình (như hình mẫu).
struct ProgressLegend: View {
  var body: some View {
    HStack(spacing: DS.Spacing.md) {
      item(.good) { RoundedRectangle(cornerRadius: 3).fill(DS.Color.foreground.swiftUI.opacity(0.8)) }
      item(.attention) { RoundedRectangle(cornerRadius: 3).strokeBorder(DS.Color.foreground.swiftUI.opacity(0.8), lineWidth: 1.3) }
      item(.insufficient) { RoundedRectangle(cornerRadius: 3).fill(Color(white: 0.17)) }
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
