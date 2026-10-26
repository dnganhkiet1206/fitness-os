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
  /// Nguồn zoom sang chi tiết nhóm (`todayZoom("ps.<nhóm>")`); `nil` = không zoom.
  var zoom: Namespace.ID?

  /// Khung vẽ trong toạ độ 222 × 222 của ảnh logo (cắt sát chữ A).
  static let frame = CGRect(x: 2, y: 30, width: 218, height: 166)
  static let rim: CGFloat = 1.3

  /// Chuyển động (Kiệt duyệt mock 22/10): lúc mở màn 6 mảng hiện theo đường leo,
  /// mảng "Cần chú ý" thở 3 nhịp rồi đứng yên, chạm lún nhẹ, đổi trạng thái thì
  /// đổi màu tại chỗ và nảy một lần. Reduce Motion: chỉ mờ dần.
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var shown = false
  @State private var breathe = 0

  var body: some View {
    GeometryReader { geo in
      let k = geo.size.width / Self.frame.width
      ZStack(alignment: .topLeading) {
        ForEach(Self.drawOrder, id: \.self) { g in
          let level = results.first { $0.group == g }?.level ?? .insufficient
          let step = Self.climb.firstIndex(of: g) ?? 0
          Button {
            tapCount += 1
            onTap(g)
          } label: {
            ProgressSegment(group: g, level: level, scale: k, breathe: breathe, reduceMotion: reduceMotion)
          }
          .buttonStyle(SegmentPressStyle(anchor: Self.anchor(g), reduceMotion: reduceMotion))
          .modifier(ZoomSource(id: "ps.\(g.rawValue)", space: zoom))
          .opacity(shown ? 1 : 0)
          .scaleEffect(shown || reduceMotion ? 1 : 0.9, anchor: Self.anchor(g))
          .offset(y: shown || reduceMotion ? 0 : 10 * k)
          .animation(Self.entrance(step, reduceMotion: reduceMotion), value: shown)
          .accessibilityLabel(Text(verbatim: "\(ProgressStyle.name(g)): \(ProgressStyle.word(level))"))
          .accessibilitySortPriority(Double(Self.climb.count - step))
        }
      }
      .frame(width: geo.size.width, height: geo.size.height, alignment: .topLeading)
    }
    .aspectRatio(Self.frame.width / Self.frame.height, contentMode: .fit)
    .sensoryFeedback(.impact(weight: .light), trigger: tapCount)
    .accessibilityElement(children: .contain)
    .onAppear {
      shown = true
      guard !reduceMotion else { return }
      // Thở sau khi mảng cuối đã hiện.
      Task {
        try? await Task.sleep(for: .milliseconds(900))
        breathe += 1
      }
    }
    .onDisappear { shown = false }
  }

  /// Rung nhẹ mỗi lần chạm một mảng (đếm trong `SegmentPressStyle` không được — đếm ở đây).
  @State private var tapCount = 0

  /// Thứ tự đường leo: chân trái dưới → trên → đỉnh → chân phải trên → dưới.
  static let climb: [ProgressStatus.Group] = [.training, .steps, .nutrition, .sleep, .recovery, .body]

  static func entrance(_ step: Int, reduceMotion: Bool) -> Animation {
    reduceMotion ? .easeOut(duration: 0.25) : .spring(duration: 0.42, bounce: 0.2).delay(Double(step) * 0.09)
  }

  /// Tâm diện tích của mảng, theo tỉ lệ khung — gốc co / nảy của mảng.
  static func anchor(_ g: ProgressStatus.Group) -> UnitPoint {
    let c = iconCenter(g)
    return UnitPoint(x: (c.x - frame.minX) / frame.width, y: (c.y - frame.minY) / frame.height)
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
    .nutrition: [(102.16, 85.12), (108.02, 81.19), (110.46, 75.91), (110.46, 43.08), (106.97, 37.80), (99.51, 35.87), (92.96, 38.75), (88.70, 43.08), (71.52, 73.29), (70.61, 78.53), (72.32, 82.50), (76.21, 85.12), (100.85, 85.30)],
    .sleep: [(144.28, 85.12), (146.79, 84.21), (149.63, 81.19), (149.67, 73.29), (133.65, 44.68), (128.41, 39.26), (121.86, 36.02), (107.41, 35.22), (106.10, 36.49), (111.19, 43.08), (111.19, 75.91), (112.14, 79.84), (115.27, 83.12), (119.20, 85.08), (142.82, 85.30)],
    .steps: [(75.81, 131.09), (80.40, 128.47), (83.78, 124.21), (98.85, 98.26), (100.53, 91.67), (98.42, 87.74), (95.58, 85.99), (71.95, 85.27), (68.02, 86.18), (63.22, 90.36), (57.61, 99.57), (48.33, 116.46), (46.47, 123.23), (48.33, 128.14), (53.57, 131.75), (74.57, 131.75)],
    .recovery: [(168.99, 131.09), (172.56, 128.47), (174.13, 125.85), (174.20, 119.26), (157.27, 88.11), (153.34, 82.61), (150.94, 81.19), (148.10, 84.21), (144.17, 85.96), (120.51, 86.03), (118.76, 87.74), (119.05, 91.67), (137.76, 124.54), (141.51, 128.73), (149.41, 132.08), (167.79, 131.75)],
    .training: [(39.27, 184.96), (46.40, 182.34), (54.70, 174.44), (74.76, 138.99), (74.79, 135.02), (73.26, 132.88), (54.88, 132.48), (48.33, 130.18), (41.78, 132.37), (37.85, 136.15), (21.76, 165.27), (21.43, 173.13), (24.05, 179.72), (29.95, 184.31), (35.23, 185.62), (37.85, 185.04)],
    .body: [(188.50, 184.96), (194.04, 182.60), (197.97, 178.41), (200.11, 173.13), (200.19, 167.89), (198.59, 162.61), (179.59, 129.93), (175.65, 126.80), (174.13, 127.16), (172.67, 129.78), (167.86, 132.40), (146.79, 132.88), (146.10, 138.99), (167.50, 175.75), (173.03, 181.03), (178.27, 184.24), (187.45, 185.25)],
  ]

  /// Nối các điểm dò bằng đường cong qua trung điểm — mép mượt, không răng cưa.
  private static let shapes: [ProgressStatus.Group: Path] = {
    var out = smoothed
    // Hai mảng chân: lấy NGUYÊN đường bao logo gốc (bàn chân cong của logo), cắt từ mép
    // trên của mảng đã dò, bo 10 — không gộp với mảng dò (gộp tạo bướu, Kiệt 22/10).
    for (g, left) in [(ProgressStatus.Group.training, true), (.body, false)] {
      let top = (out[g] ?? Path()).boundingRect.minY
      let box = left ? CGRect(x: -10, y: top, width: 110.5 + 10, height: 80) : CGRect(x: 110.5, y: top, width: 130, height: 80)
      out[g] = opened(logo.intersection(Path(box)), r: 10, inset: 0)
    }
    return out
  }()

  private static let smoothed: [ProgressStatus.Group: Path] = traced.mapValues { raw in
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
  /// Tâm icon = trọng tâm (tâm diện tích) của mảng — mảng nghiêng / bàn chân cong có
  /// tâm khung bao lệch khỏi giữa mảng (Kiệt 22/10: icon lệch). Tính một lần.
  static func iconCenter(_ g: ProgressStatus.Group) -> CGPoint { centers[g] ?? .zero }

  private static let centers: [ProgressStatus.Group: CGPoint] = Dictionary(
    uniqueKeysWithValues: ProgressStatus.Group.allCases.map { g in
      let p = shape(g), b = p.boundingRect
      var sx: CGFloat = 0, sy: CGFloat = 0, n: CGFloat = 0
      var y = b.minY
      while y <= b.maxY {
        var x = b.minX
        while x <= b.maxX {
          if p.contains(CGPoint(x: x, y: y)) { sx += x; sy += y; n += 1 }
          x += 0.5
        }
        y += 0.5
      }
      return (g, n > 0 ? CGPoint(x: sx / n, y: sy / n) : CGPoint(x: b.midX, y: b.midY))
    })

  /// Lõi đen của mảng "Cần chú ý": viền đều `rim × 1.6`.
  static func inner(_ g: ProgressStatus.Group) -> Path {
    let p = shape(g)
    return p.subtracting(p.strokedPath(StrokeStyle(lineWidth: 2.0, lineJoin: .round)))
  }

  /// Mở hình (bo góc lồi bán kính `r`): thu `r + inset` góc nhọn rồi nở `r` khớp tròn.
  private static func opened(_ p: Path, r: CGFloat, inset: CGFloat) -> Path {
    let shrink = p.subtracting(p.strokedPath(StrokeStyle(lineWidth: (r + inset) * 2, lineJoin: .miter)))
    return shrink.union(shrink.strokedPath(StrokeStyle(lineWidth: r * 2, lineCap: .round, lineJoin: .round)))
  }
}

/// Một mảng của chữ A, vẽ trong toàn khung chữ A (các mảng chồng nhau trong `ZStack`)
/// — vùng chạm là đúng hình mảng, không phải ô chữ nhật bao quanh.
/// Cách tô theo Health: Tốt = tô đặc, icon trắng · Cần chú ý = khung viền màu, lõi
/// trong suốt, icon màu · Chưa đủ dữ liệu = xám theo giao diện sáng / tối, icon mờ.
struct ProgressSegment: View {
  let group: ProgressStatus.Group
  let level: ProgressStatus.Level
  /// Điểm / đơn vị khung 222.
  let scale: CGFloat
  /// Tăng một lần sau khi chữ A hiện: mảng "Cần chú ý" thở 3 nhịp rồi đứng yên.
  let breathe: Int
  let reduceMotion: Bool
  @Environment(\.colorScheme) private var scheme

  /// Mảng "Chưa đủ dữ liệu".
  private var empty: Color { scheme == .dark ? Color(white: 0.17) : Color(white: 0.86) }

  var body: some View {
    let tint = ProgressStyle.color(group)
    let outline = SegmentShape(path: ProgressHero.shape(group))
    let c = ProgressHero.iconCenter(group)
    ZStack(alignment: .topLeading) {
      outline
        .fill(level == .insufficient ? empty : tint)
        .keyframeAnimator(initialValue: 1.0, trigger: breathe) { content, o in
          content.opacity(level == .attention && !reduceMotion ? o : 1)
        } keyframes: { _ in
          CubicKeyframe(0.45, duration: 1.1)
          CubicKeyframe(1, duration: 1.1)
          CubicKeyframe(0.45, duration: 1.1)
          CubicKeyframe(1, duration: 1.1)
          CubicKeyframe(0.45, duration: 1.1)
          CubicKeyframe(1, duration: 1.1)
        }
      // Lõi trong suốt (Kiệt 23/10: "Cần chú ý" chỉ là một khung màu bình thường).
      SegmentShape(path: ProgressHero.inner(group))
        .fill(Color.black)
        .blendMode(.destinationOut)
        .opacity(level == .attention ? 1 : 0)
      Image(systemName: ProgressStyle.symbol(group))
        .font(.system(size: 11 * scale, weight: .semibold))
        .foregroundStyle(icon(tint))
        .position(x: (c.x - ProgressHero.frame.minX) * scale, y: (c.y - ProgressHero.frame.minY) * scale)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    // Bóng tối ở chỗ nối: mảng trên tách khỏi mảng dưới như hình mẫu.
    .compositingGroup()
    .shadow(color: .black.opacity(scheme == .dark ? 0.4 : 0.18), radius: 1.6 * scale, x: 0, y: 0.8 * scale)
    .contentShape(outline)
    // Vừa ghi dữ liệu: đổi màu tại chỗ rồi nảy một lần.
    .animation(reduceMotion ? nil : .smooth(duration: 0.6), value: level)
    .keyframeAnimator(initialValue: 1.0, trigger: level) { content, s in
      content.scaleEffect(reduceMotion ? 1 : s, anchor: ProgressHero.anchor(group))
    } keyframes: { _ in
      CubicKeyframe(1.06, duration: 0.2)
      SpringKeyframe(1, duration: 0.35)
    }
  }

  private func icon(_ tint: Color) -> Color {
    switch level {
    case .good: .white
    case .attention: tint
    case .insufficient: scheme == .dark ? .white.opacity(0.75) : .black.opacity(0.45)
    }
  }
}

/// Hình trong toạ độ khung 222, co giãn theo khung vẽ.
private struct SegmentShape: Shape {
  let path: Path
  func path(in rect: CGRect) -> Path {
    let k = rect.width / ProgressHero.frame.width
    return path.applying(
      CGAffineTransform(scaleX: k, y: k).translatedBy(x: -ProgressHero.frame.minX, y: -ProgressHero.frame.minY))
  }
}

/// Chạm: mảng lún nhẹ quanh tâm của nó.
private struct SegmentPressStyle: ButtonStyle {
  let anchor: UnitPoint
  let reduceMotion: Bool
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .scaleEffect(configuration.isPressed && !reduceMotion ? 0.95 : 1, anchor: anchor)
      .animation(reduceMotion ? nil : .spring(duration: 0.22, bounce: 0.3), value: configuration.isPressed)
  }
}

/// Chữ trạng thái: icon + chữ, cùng màu theo ý nghĩa (`ProgressStyle.tint`).
struct ProgressStatusWord: View {
  let level: ProgressStatus.Level
  let font: Font

  var body: some View {
    Label {
      Text(verbatim: ProgressStyle.word(level))
    } icon: {
      Image(systemName: ProgressStyle.statusSymbol(level)).accessibilityHidden(true)
    }
    .labelStyle(StatusWordLabelStyle())
    .font(font)
    .foregroundStyle(ProgressStyle.tint(level))
  }
}

private struct StatusWordLabelStyle: LabelStyle {
  func makeBody(configuration: Configuration) -> some View {
    HStack(spacing: 6) {
      configuration.icon
      configuration.title
    }
  }
}

/// Chú thích ba trạng thái dưới hình (như hình mẫu).
struct ProgressLegend: View {
  @Environment(\.colorScheme) private var scheme

  var body: some View {
    HStack(spacing: DS.Spacing.md) {
      item(.good) { RoundedRectangle(cornerRadius: 3).fill(DS.Color.foreground.swiftUI.opacity(0.8)) }
      item(.attention) { RoundedRectangle(cornerRadius: 3).strokeBorder(DS.Color.foreground.swiftUI.opacity(0.8), lineWidth: 1.3) }
      item(.insufficient) {
        RoundedRectangle(cornerRadius: 3).fill(scheme == .dark ? Color(white: 0.17) : Color(white: 0.86))
      }
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

  /// Màu của chữ trạng thái (Kiệt duyệt phương án A, 26/10): theo ý nghĩa, dịu,
  /// không đỏ / cam (giống Vitals của Apple: không báo động). "Tốt" là bạc hà
  /// (Kiệt chọn), khác mọi màu nhóm (Vận động đã xanh lá).
  static func tint(_ l: ProgressStatus.Level) -> Color {
    switch l {
    case .good: DS.Color.statusGood.swiftUI
    case .attention: DS.Color.statusAttention.swiftUI
    case .insufficient: DS.Color.mutedForeground.swiftUI
    }
  }

  /// Icon đi kèm chữ — trạng thái không chỉ nói bằng màu. "Cần chú ý" là mũi tên
  /// lên: còn chỗ để tiến, không phải cảnh báo.
  static func statusSymbol(_ l: ProgressStatus.Level) -> String {
    switch l {
    case .good: "checkmark.circle.fill"
    case .attention: "arrow.up.right.circle"
    case .insufficient: "circle.dashed"
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
