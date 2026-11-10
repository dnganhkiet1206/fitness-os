// Nút của ASCND — C sở hữu (#229, #247).
//
// Ba kiểu: primary (hành động chính), secondary (hành động phụ),
// destructive (hành động huỷ bỏ). Vùng chạm ≥ 44pt theo HIG.
//
// 10/11 (Kiệt duyệt mock "Thống nhất nút và biểu đồ",
// https://claude.ai/artifact/Kmt7Y9vxeMnmsBGA79FdV3): MỘT họ nút viên cho cả app,
// cùng màu với `.dsPill` — chính: viên đặc màu mực; phụ: viên viền mảnh; nguy hiểm:
// viên viền đỏ, chữ đỏ. Cao 50 khi trải ngang (DSButton); 40 trong hàng (`.dsPill`).
// Trước đây chính là chữ nhật màu kem bo 16, lệch với viên ở Tập luyện / Cơ thể.
#if canImport(SwiftUI)
public import SwiftUI

/// Kiểu nút trong design system.
public enum DSButtonStyle {
  case primary
  case secondary
  case destructive
}

public struct DSButton: View {
  let title: String
  let style: DSButtonStyle
  let action: () -> Void
  /// Trạng thái disabled — View cha truyền vào qua `.disabled()`.
  @Environment(\.isEnabled) private var isEnabled

  public init(_ title: String, style: DSButtonStyle = .primary, action: @escaping () -> Void) {
    self.title = title
    self.style = style
    self.action = action
  }

  public var body: some View {
    Button(action: action) {
      Text(title)
        .font(DS.TextStyle.headline)
        .frame(maxWidth: .infinity)
        .frame(minHeight: 50)
        .foregroundStyle(foregroundColor.swiftUI)
        .background {
          switch style {
          case .primary: Capsule().fill(DS.Color.foreground.swiftUI)
          case .secondary: Capsule().strokeBorder(DS.Color.foreground.swiftUI.opacity(0.2), lineWidth: 1)
          case .destructive: Capsule().strokeBorder(DS.Color.destructive.swiftUI.opacity(0.45), lineWidth: 1)
          }
        }
        .contentShape(Capsule())
        // Disabled: mờ đi (#304).
        .opacity(isEnabled ? 1.0 : 0.4)
    }
    .buttonStyle(DSButtonPressStyle())
    .accessibilityLabel(Text(title))
    .accessibilityAddTraits(.isButton)
  }

  private var foregroundColor: DSColor {
    switch style {
    case .primary: DS.Color.background
    case .secondary: DS.Color.foreground
    case .destructive: DS.Color.destructive
    }
  }
}

/// Pressed state: scale nhẹ khi chạm (#304).
private struct DSButtonPressStyle: ButtonStyle {
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .scaleEffect(configuration.isPressed ? 0.97 : 1.0)
      .animation(DSMotion.animation(.easeInOut(duration: 0.1), reduceMotion: reduceMotion), value: configuration.isPressed)
  }
}

#Preview("Light") {
  VStack(spacing: DS.Spacing.md) {
    DSButton("Bắt đầu buổi tập", style: .primary) {}
    DSButton("Bỏ qua", style: .secondary) {}
    DSButton("Xoá buổi tập", style: .destructive) {}
  }
  .padding()
  .preferredColorScheme(.light)
}

#Preview("Dark") {
  VStack(spacing: DS.Spacing.md) {
    DSButton("Bắt đầu buổi tập", style: .primary) {}
    DSButton("Bỏ qua", style: .secondary) {}
    DSButton("Xoá buổi tập", style: .destructive) {}
  }
  .padding()
  .preferredColorScheme(.dark)
}

#Preview("Dynamic Type XXL") {
  VStack(spacing: DS.Spacing.md) {
    DSButton("Bắt đầu buổi tập", style: .primary) {}
    DSButton("Bỏ qua", style: .secondary) {}
  }
  .padding()
  .dynamicTypeSize(.accessibility3)
}
#endif
