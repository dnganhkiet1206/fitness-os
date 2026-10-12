import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

// Chất liệu và chuyển động của tab Hôm nay (#527).
//
// Tối giản: sau mọi thẻ chỉ có MỘT vầng sáng rất nhạt ở đầu trang, mang màu
// của việc kế tiếp (cùng màu nút trong bong bóng Koa) — đủ để kính có thứ làm
// nhoè, không thành bảng màu. Xong hết việc thì vầng sáng tắt về nền giấy.
// Kính là của hệ thống (`glassEffect` iOS 26, material ở máy cũ), không tự vẽ.
//
// Trợ năng: Reduce Transparency → nền đặc, không vầng sáng; Reduce Motion →
// đổi màu tức thì thay vì chuyển dần.

/// Vầng sáng sau trang. `accent`: màu việc kế tiếp; `nil` = chỉ nền.
struct TodayAmbient: View {
  let accent: MascotRules.Quest?

  @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Environment(\.colorScheme) private var scheme

  var body: some View {
    ZStack(alignment: .top) {
      DS.Color.background.swiftUI
      if !reduceTransparency, let accent {
        GeometryReader { geo in
          Ellipse()
            .fill(MascotRoomView.signalColor(accent).opacity(scheme == .dark ? 0.22 : 0.16))
            .frame(width: geo.size.width * 1.3, height: geo.size.height * 0.55)
            .position(x: geo.size.width * 0.5, y: geo.size.height * 0.08)
            .blur(radius: 90)
        }
        .transition(.opacity)
      }
    }
    .ignoresSafeArea()
    .animation(reduceMotion ? nil : .smooth(duration: 1.0), value: accent)
    .accessibilityHidden(true)
  }
}

/// Việc kế tiếp, từ `TodayExtras` lên `TodayView` (vầng sáng nằm sau cả
/// ScrollView, đứng yên khi cuộn).
struct TodayAccentPreference: PreferenceKey {
  static let defaultValue: MascotRules.Quest? = nil
  static func reduce(value: inout MascotRules.Quest?, nextValue: () -> MascotRules.Quest?) {
    value = value ?? nextValue()
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
