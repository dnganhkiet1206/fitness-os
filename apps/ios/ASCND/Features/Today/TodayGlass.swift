import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

// Chất liệu và chuyển động của tab Hôm nay (#527).
//
// Một ý duy nhất, như nền ảnh bìa nhoè của Apple Music: sau mọi thẻ là MỘT
// trường màu sống dựng từ năm màu tín hiệu, và mọi thẻ là kính thật làm nhoè
// nó. Trường màu có nghĩa — tín hiệu nào xong thì vũng màu của nó đậm lên, nên
// một ngày càng đầy thì căn phòng càng nhiều màu. Kính là của hệ thống
// (`glassEffect` iOS 26, material ở máy cũ), không tự vẽ.
//
// Trợ năng: Reduce Transparency → nền đặc, không trường màu; Reduce Motion →
// trường màu đứng yên, chuyển cảnh chỉ còn mờ dần.

/// Trường màu phía sau trang. `done`: tín hiệu đã xong (đậm hơn).
struct TodayAmbient: View {
  let done: Set<MascotRules.Quest>

  @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Environment(\.colorScheme) private var scheme

  var body: some View {
    ZStack {
      DS.Color.background.swiftUI
      if !reduceTransparency {
        if reduceMotion {
          field(t: 0)
        } else {
          TimelineView(.animation(minimumInterval: 1.0 / 20)) { ctx in
            field(t: ctx.date.timeIntervalSinceReferenceDate)
          }
        }
      }
    }
    .ignoresSafeArea()
    .animation(.smooth(duration: 1.2), value: done)
    .accessibilityHidden(true)
  }

  /// Lưới 3×3: hàng giữa trôi rất chậm (chu kỳ ~20–30 s) — đủ để kính "sống",
  /// không đủ để mắt bám theo.
  private func field(t: Double) -> some View {
    let s = { (k: Double, a: Double) in Float(0.5 + a * sin(t / k)) }
    let points: [SIMD2<Float>] = [
      [0, 0], [s(23, 0.12), 0], [1, 0],
      [0, s(29, 0.1)], [s(19, 0.14), s(27, 0.12)], [1, s(31, 0.1)],
      [0, 1], [s(25, 0.12), 1], [1, 1],
    ]
    return MeshGradient(width: 3, height: 3, points: points, colors: colors)
      .blur(radius: 30)
  }

  /// Chín màu: năm màu tín hiệu ở nửa trên (nơi khối ngày nằm), tâm và giữa
  /// đáy là nền để chữ dễ đọc, hai góc dưới vọng lại nước / ngủ ở nửa độ đậm.
  /// Tín hiệu xong ≈ 50 %, chưa xong ≈ 20 % (tối: ×0,75).
  private var colors: [Color] {
    let base = DS.Color.background.swiftUI
    let k = scheme == .dark ? 0.75 : 1.0
    func hue(_ q: MascotRules.Quest, _ w: Double = 1) -> Color {
      MascotRoomView.signalColor(q).opacity((done.contains(q) ? 0.5 : 0.2) * k * w)
    }
    return [
      hue(.sleep), hue(.meal), hue(.water),
      hue(.workout, 0.8), base, hue(.steps, 0.8),
      hue(.water, 0.5), base, hue(.sleep, 0.5),
    ].map { blend($0, over: base) }
  }

  private func blend(_ c: Color, over base: Color) -> Color {
    // MeshGradient nội suy theo kênh; trộn sẵn lên nền để không lộ vệt xám.
    Color(uiColor: UIColor { traits in
      let b = UIColor(base).resolvedColor(with: traits)
      let f = UIColor(c).resolvedColor(with: traits)
      var (br, bg, bb, ba): (CGFloat, CGFloat, CGFloat, CGFloat) = (0, 0, 0, 0)
      var (fr, fg, fb, fa): (CGFloat, CGFloat, CGFloat, CGFloat) = (0, 0, 0, 0)
      b.getRed(&br, green: &bg, blue: &bb, alpha: &ba)
      f.getRed(&fr, green: &fg, blue: &fb, alpha: &fa)
      return UIColor(red: br + (fr - br) * fa, green: bg + (fg - bg) * fa, blue: bb + (fb - bb) * fa, alpha: 1)
    })
  }
}

/// Tín hiệu đã xong, từ `TodayExtras` lên `TodayView` (trường màu nằm sau
/// cả ScrollView, đứng yên khi cuộn).
struct TodayDonePreference: PreferenceKey {
  static let defaultValue: Set<MascotRules.Quest> = []
  static func reduce(value: inout Set<MascotRules.Quest>, nextValue: () -> Set<MascotRules.Quest>) {
    value.formUnion(nextValue())
  }
}

extension View {
  /// Thẻ kính của Today: kính hệ thống bo `radius`, viền sáng mảnh (sáng ở
  /// trên, tắt dần xuống dưới — ánh sáng đến từ trên), bóng mềm có độ lệch.
  /// Reduce Transparency → nền thẻ đặc với viền thường.
  func todayCard(radius: CGFloat = 26) -> some View {
    modifier(TodayCardStyle(radius: radius))
  }

  /// Vào trang lần đầu: mờ + nhoè + nhích lên, so le theo `order` (tổng ≤ 200 ms).
  /// Reduce Motion: chỉ mờ dần.
  func todayEntrance(_ order: Int) -> some View {
    modifier(TodayEntrance(order: order))
  }
}

private struct TodayCardStyle: ViewModifier {
  let radius: CGFloat
  @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
  @Environment(\.colorScheme) private var scheme

  func body(content: Content) -> some View {
    let shape = RoundedRectangle(cornerRadius: radius, style: .continuous)
    content
      .todayGlass(cornerRadius: radius, solid: reduceTransparency)
      .overlay {
        shape.strokeBorder(
          reduceTransparency
            ? AnyShapeStyle(DS.Color.border.swiftUI)
            : AnyShapeStyle(
              LinearGradient(
                colors: [.white.opacity(scheme == .dark ? 0.22 : 0.7), .white.opacity(scheme == .dark ? 0.04 : 0.15)],
                startPoint: .top, endPoint: .bottom)),
          lineWidth: 0.75)
      }
      .shadow(color: .black.opacity(scheme == .dark ? 0.3 : 0.07), radius: 18, y: 8)
  }
}

private struct TodayEntrance: ViewModifier {
  let order: Int
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var shown = false

  func body(content: Content) -> some View {
    content
      .opacity(shown ? 1 : 0)
      .blur(radius: shown || reduceMotion ? 0 : 6)
      .offset(y: shown || reduceMotion ? 0 : 14)
      .onAppear {
        guard !shown else { return }
        withAnimation(.smooth(duration: 0.55).delay(Double(min(order, 4)) * 0.05)) { shown = true }
      }
  }
}

/// Nhấn: thu nhẹ và sáng lại bằng lò xo — phản hồi ngay dưới ngón tay, không
/// đợi màn kế. Reduce Motion: chỉ đổi độ mờ.
struct TodayPressStyle: ButtonStyle {
  var scale: CGFloat = 0.97
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .scaleEffect(configuration.isPressed && !reduceMotion ? scale : 1)
      .opacity(configuration.isPressed ? 0.85 : 1)
      .animation(.spring(duration: 0.28, bounce: 0.25), value: configuration.isPressed)
  }
}

/// `matchedTransitionSource` khi có không gian zoom.
struct ZoomSource: ViewModifier {
  let id: String
  let space: Namespace.ID?
  func body(content: Content) -> some View {
    if let space { content.matchedTransitionSource(id: id, in: space) } else { content }
  }
}

extension View {
  /// Màn đích của chuyển cảnh zoom (iOS 18): phóng ra từ đúng chỗ vừa chạm.
  /// Reduce Motion: hệ thống tự đổi zoom thành mờ dần.
  func todayZoom(_ id: String, in space: Namespace.ID) -> some View {
    navigationTransition(.zoom(sourceID: id, in: space))
  }
}
