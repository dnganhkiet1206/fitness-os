import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

// Chất liệu và chuyển động của tab Hôm nay (#527).
//
// Nền là giấy ấm `WarmPaper` như mọi màn (một quầng cam nhạt cố định, 13/10).
// Kính là của hệ thống (`glassEffect` iOS 26, material ở máy cũ), không tự vẽ.
//
// Trợ năng: Reduce Transparency → thẻ nền đặc.

/// Nền trang của Hôm nay / Dinh dưỡng: GIẤY ẤM `WarmPaper`, giống hệt mọi màn
/// khác (`ascndPage`). Trước đây có một quầng màu đổi theo việc kế tiếp (tím / cam
/// / xanh…) và Dinh dưỡng luôn cam — chủ dự án báo "tone giấy chỗ có chỗ
/// không, lúc hiện lúc không" (13/10, B). Màu tín hiệu chỉ còn ở ống, vòng và
/// nút — nơi nó mang nghĩa. `accent` giữ lại cho nơi gọi, không còn vẽ.
struct TodayAmbient: View {
  let accent: MascotRules.Quest?

  var body: some View { WarmPaper() }
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
  /// Thẻ của Today = mặt thẻ chung `dsCard` của Design System (15/10).
  func todayCard(radius: CGFloat = DS.Radius.xl) -> some View {
    dsCard(radius: radius)
  }

  /// Vào trang lần đầu: mờ + nhoè + nhích lên, so le theo `order` (tổng ≤ 200 ms).
  /// Reduce Motion: chỉ mờ dần.
  func todayEntrance(_ order: Int) -> some View {
    modifier(TodayEntrance(order: order))
  }

  /// Lớp che vùng thanh trạng thái cho trang ẩn thanh điều hướng (Hôm nay, Dinh
  /// dưỡng): không có nó, nội dung cuộn chạy thẳng dưới giờ và Dynamic Island
  /// (chữ đè chữ). Nhoè thuần (không tô màu) tắt dần xuống dưới; Reduce
  /// Transparency → nền đặc.
  func statusBarScrim() -> some View {
    modifier(StatusBarScrim())
  }
}

private struct StatusBarScrim: ViewModifier {
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
  /// Chiều cao vùng thanh trạng thái, đọc từ nội dung (một `GeometryReader` đã
  /// bỏ qua vùng an toàn thì đọc ra 0).
  @State private var top: CGFloat = 0
  /// Nội dung đã cuộn lên dưới thanh trạng thái. Ở đầu trang — và khi đang KÉO
  /// XUỐNG để làm mới — dải nhoè tắt: không có gì bên dưới để nhoè, và nó
  /// phủ đúng chỗ hệ thống vẽ vòng xoay làm mới (chủ dự án: "khựng" khi thả).
  @State private var scrolled = false

  func body(content: Content) -> some View {
    content
      .onScrollGeometryChange(for: Bool.self) { g in
        g.contentOffset.y + g.contentInsets.top > 6
      } action: { _, now in
        withAnimation(DSMotion.animation(.easeOut(duration: 0.18), reduceMotion: reduceMotion)) { scrolled = now }
      }
      .background {
        GeometryReader { g in
          Color.clear
            .onAppear { top = g.safeAreaInsets.top }
            .onChange(of: g.safeAreaInsets.top) { _, t in top = t }
        }
      }
      .overlay(alignment: .top) {
        // NHOÈ thuần, không phủ màu và không phải kính (chủ dự án, 13/10):
        // kính / material đều mang một lớp trắng. Tắt dần xuống dưới.
        Group {
          if reduceTransparency {
            Rectangle().fill(DS.Color.background.swiftUI)
          } else {
            PureBlur()
          }
        }
        .frame(height: top + 20)
        .opacity(scrolled ? 1 : 0)
        .mask(
          LinearGradient(
            stops: [.init(color: .black, location: 0), .init(color: .black, location: 0.55), .init(color: .clear, location: 1)],
            startPoint: .top, endPoint: .bottom))
        .ignoresSafeArea(edges: .top)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
      }
  }
}

/// Nhoè của hệ thống KHÔNG có lớp tô: `UIVisualEffectView` giữ lớp nhoè nền
/// (backdrop) và ẩn các lớp tô màu / độ sáng mà mọi kiểu material mang theo.
/// Không gọi API riêng — chỉ ẩn các view con công khai trong cây của nó.
private struct PureBlur: UIViewRepresentable {
  func makeUIView(context: Context) -> UntintedBlurView { UntintedBlurView() }
  func updateUIView(_ view: UntintedBlurView, context: Context) {}
}

private final class UntintedBlurView: UIVisualEffectView {
  init() {
    super.init(effect: UIBlurEffect(style: .systemUltraThinMaterial))
    isUserInteractionEnabled = false
  }

  required init?(coder: NSCoder) { nil }

  override func layoutSubviews() {
    super.layoutSubviews()
    stripTint()
  }

  override func traitCollectionDidChange(_ previous: UITraitCollection?) {
    super.traitCollectionDidChange(previous)
    stripTint()
  }

  /// Lớp tô là các `_UIVisualEffectSubview`; lớp nhoè là `_UIVisualEffectBackdropView`.
  private func stripTint() {
    for v in subviews where String(describing: type(of: v)).contains("VisualEffectSubview") {
      v.isHidden = true
    }
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
