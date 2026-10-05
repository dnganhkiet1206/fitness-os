// Nút của ASCND — C sở hữu (#229, #247).
//
// Ba kiểu: primary (hành động chính), secondary (hành động phụ),
// destructive (hành động huỷ bỏ). Vùng chạm ≥ 44pt theo HIG.
#if canImport(SwiftUI)
import SwiftUI

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
        .frame(minHeight: 48)
        .background(backgroundColor.swiftUI)
        .foregroundStyle(foregroundColor.swiftUI)
        .clipShape(RoundedRectangle(cornerRadius: DS.Radius.md))
    }
    .accessibilityLabel(Text(title))
    .accessibilityAddTraits(.isButton)
  }

  private var backgroundColor: DSColor {
    switch style {
    case .primary: DS.Color.primary
    case .secondary: DS.Color.secondary
    case .destructive: DS.Color.destructive
    }
  }

  private var foregroundColor: DSColor {
    switch style {
    case .primary: DS.Color.primaryForeground
    case .secondary: DS.Color.foreground
    case .destructive: DS.Color.destructiveForeground
    }
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
