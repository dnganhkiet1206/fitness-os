// Màn hình trống của ASCND — C sở hữu (#229, #247).
//
// Dùng khi chưa có nội dung (ví dụ: tab Hôm nay chưa có kế hoạch).
// Thay PlaceholderScreen của #232 khi màn hình thật chưa có.
#if canImport(SwiftUI)
public import SwiftUI

public struct DSEmptyState: View {
  let systemImage: String
  let title: String
  let message: String?
  var actionTitle: String?
  var action: (() -> Void)?

  public init(
    systemImage: String,
    title: String,
    message: String? = nil,
    actionTitle: String? = nil,
    action: (() -> Void)? = nil
  ) {
    self.systemImage = systemImage
    self.title = title
    self.message = message
    self.actionTitle = actionTitle
    self.action = action
  }

  public var body: some View {
    VStack(spacing: DS.Spacing.md) {
      Image(systemName: systemImage)
        .font(.system(size: 48))
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .accessibilityHidden(true)
      Text(title)
        .font(DS.TextStyle.title2)
        .foregroundStyle(DS.Color.foreground.swiftUI)
        .multilineTextAlignment(.center)
      if let message {
        Text(message)
          .font(DS.TextStyle.body)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .multilineTextAlignment(.center)
      }
      if let actionTitle, let action {
        DSButton(actionTitle, style: .primary, action: action)
          .padding(.top, DS.Spacing.sm)
      }
    }
    .padding(DS.Spacing.xl)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .accessibilityElement(children: .combine)
  }
}

#Preview("Light") {
  DSEmptyState(
    systemImage: "calendar.badge.plus",
    title: String(localized: "ds.empty.title"),
    message: String(localized: "ds.empty.message"),
    actionTitle: String(localized: "ds.empty.action"),
    action: {}
  )
  .preferredColorScheme(.light)
}

#Preview("Dark") {
  DSEmptyState(
    systemImage: "calendar.badge.plus",
    title: String(localized: "ds.empty.title"),
    message: String(localized: "ds.empty.message"),
    actionTitle: String(localized: "ds.empty.action"),
    action: {}
  )
  .preferredColorScheme(.dark)
}

#Preview("Dynamic Type XXL") {
  DSEmptyState(
    systemImage: "calendar.badge.plus",
    title: String(localized: "ds.empty.title"),
    message: String(localized: "ds.empty.message")
  )
  .dynamicTypeSize(.accessibility3)
}
#endif
