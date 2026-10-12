// Thẻ của ASCND — C sở hữu (#229, #247).
//
// Vùng chứa nội dung: mặt kính, viền sáng mảnh và bo góc theo token.
#if canImport(SwiftUI)
public import SwiftUI

public struct DSCard<Content: View>: View {
  let content: Content
  @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
  @Environment(\.colorScheme) private var scheme

  public init(@ViewBuilder content: () -> Content) {
    self.content = content()
  }

  /// Kính của hệ thống trên nền giấy (chủ dự án, 2026-10-12 — cùng chất liệu
  /// với các thẻ của Hôm nay): iOS 26 `glassEffect`, máy cũ hơn material;
  /// viền sáng mảnh ở mép trên, bóng mềm có độ lệch. Reduce Transparency →
  /// mặt thẻ đặc với viền token như trước.
  public var body: some View {
    let shape = RoundedRectangle(cornerRadius: DS.Radius.lg, style: .continuous)
    content
      .padding(DS.Spacing.card)
      .modifier(DSGlassSurface(shape: shape, solid: reduceTransparency))
      .overlay {
        if reduceTransparency {
          shape.stroke(DS.Color.border.swiftUI, lineWidth: 1)
        } else {
          shape.strokeBorder(
            LinearGradient(
              colors: [.white.opacity(scheme == .dark ? 0.22 : 0.7), .white.opacity(scheme == .dark ? 0.04 : 0.15)],
              startPoint: .top, endPoint: .bottom),
            lineWidth: 0.75)
        }
      }
      .shadow(color: .black.opacity(scheme == .dark ? 0.3 : 0.07), radius: 18, y: 8)
  }
}

/// Mặt kính dùng chung của DS (thẻ, hàng lối tắt).
public struct DSGlassSurface<S: Shape>: ViewModifier {
  let shape: S
  let solid: Bool

  public init(shape: S, solid: Bool) {
    self.shape = shape
    self.solid = solid
  }

  public func body(content: Content) -> some View {
    if solid {
      content.background(DS.Color.card.swiftUI, in: shape)
    } else if #available(iOS 26.0, macOS 26.0, *) {
      content.glassEffect(.regular, in: shape)
    } else {
      content.background(.regularMaterial, in: shape)
    }
  }
}

#Preview("Light") {
  DSCard {
    VStack(alignment: .leading, spacing: DS.Spacing.sm) {
      Text("Buổi tập hôm nay").font(DS.TextStyle.headline)
      Text("3 bài · 45 phút").font(DS.TextStyle.body).foregroundStyle(DS.Color.mutedForeground.swiftUI)
    }
  }
  .padding()
  .preferredColorScheme(.light)
}

#Preview("Dark") {
  DSCard {
    VStack(alignment: .leading, spacing: DS.Spacing.sm) {
      Text("Buổi tập hôm nay").font(DS.TextStyle.headline)
      Text("3 bài · 45 phút").font(DS.TextStyle.body).foregroundStyle(DS.Color.mutedForeground.swiftUI)
    }
  }
  .padding()
  .preferredColorScheme(.dark)
}

#Preview("Dynamic Type XXL") {
  DSCard {
    VStack(alignment: .leading, spacing: DS.Spacing.sm) {
      Text("Buổi tập hôm nay").font(DS.TextStyle.headline)
      Text("3 bài · 45 phút").font(DS.TextStyle.body).foregroundStyle(DS.Color.mutedForeground.swiftUI)
    }
  }
  .padding()
  .dynamicTypeSize(.accessibility3)
}
#endif
