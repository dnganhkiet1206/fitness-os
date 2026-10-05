// Thẻ của ASCND — C sở hữu (#229, #247).
//
// Vùng chứa nội dung có mặt thẻ, viền và bo góc theo token.
#if canImport(SwiftUI)
@_exported import SwiftUI

public struct DSCard<Content: View>: View {
  let content: Content

  public init(@ViewBuilder content: () -> Content) {
    self.content = content()
  }

  public var body: some View {
    content
      .padding(DS.Spacing.card)
      .background(DS.Color.card.swiftUI)
      .clipShape(RoundedRectangle(cornerRadius: DS.Radius.lg))
      .overlay(
        RoundedRectangle(cornerRadius: DS.Radius.lg)
          .stroke(DS.Color.border.swiftUI, lineWidth: 1)
      )
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
