// Tiêu đề mục của ASCND — C sở hữu (#229, #247).
//
// Dòng tiêu đề cho các mục trong màn hình (ví dụ: các mục ở tab Hôm nay).
#if canImport(SwiftUI)
public import SwiftUI

public struct DSSectionHeader: View {
  let title: String
  var actionTitle: String?
  var action: (() -> Void)?

  public init(_ title: String, actionTitle: String? = nil, action: (() -> Void)? = nil) {
    self.title = title
    self.actionTitle = actionTitle
    self.action = action
  }

  public var body: some View {
    HStack {
      Text(title)
        .font(DS.TextStyle.title2)
        .foregroundStyle(DS.Color.foreground.swiftUI)
        .accessibilityAddTraits(.isHeader)
      Spacer()
      if let actionTitle, let action {
        Button(actionTitle, action: action)
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.metricBlue.swiftUI)
          .frame(minHeight: 44)
          .accessibilityLabel(Text(actionTitle))
          .accessibilityAddTraits(.isButton)
      }
    }
    .accessibilityElement(children: .combine)
  }
}

#Preview("Light") {
  VStack(spacing: DS.Spacing.md) {
    DSSectionHeader("Hôm nay")
    DSSectionHeader("Tuần này", actionTitle: "Xem tất cả") {}
  }
  .padding()
  .preferredColorScheme(.light)
}

#Preview("Dark") {
  VStack(spacing: DS.Spacing.md) {
    DSSectionHeader("Hôm nay")
    DSSectionHeader("Tuần này", actionTitle: "Xem tất cả") {}
  }
  .padding()
  .preferredColorScheme(.dark)
}

#Preview("Dynamic Type XXL") {
  VStack(spacing: DS.Spacing.md) {
    DSSectionHeader("Hôm nay")
    DSSectionHeader("Tuần này", actionTitle: "Xem tất cả") {}
  }
  .padding()
  .dynamicTypeSize(.accessibility3)
}
#endif
