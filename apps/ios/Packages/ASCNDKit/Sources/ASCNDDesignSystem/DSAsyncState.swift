// Trạng thái async dùng chung — C sở hữu (#301).
//
// Bộ presentation components cho Today/Auth/Workout:
// loading, retryable error, empty, offline, submitting.
// KHÔNG networking/domain logic — chỉ vẽ theo state được truyền vào.
#if canImport(SwiftUI)
@_exported import SwiftUI

/// Trạng thái async chung cho mọi màn.
public enum AsyncState: Hashable, Sendable {
  case loading
  case loaded
  case empty
  case offline
  case error(String)
  case submitting
}

public struct DSLoadingView: View {
  let message: String?

  public init(message: String? = nil) {
    self.message = message
  }

  public var body: some View {
    VStack(spacing: DS.Spacing.md) {
      ProgressView()
        .controlSize(.large)
      if let message {
        Text(message)
          .font(DS.TextStyle.body)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
          .multilineTextAlignment(.center)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .accessibilityElement(children: .combine)
    .accessibilityLabel(Text(message ?? String(localized: "async.loading")))
  }
}

public struct DSErrorView: View {
  let message: String
  let onRetry: () -> Void

  public init(message: String, onRetry: @escaping () -> Void) {
    self.message = message
    self.onRetry = onRetry
  }

  public var body: some View {
    VStack(spacing: DS.Spacing.md) {
      Image(systemName: "exclamationmark.triangle")
        .font(.system(size: 44))
        .foregroundStyle(DS.Color.destructive.swiftUI)
        .accessibilityHidden(true)
      Text(message)
        .font(DS.TextStyle.body)
        .foregroundStyle(DS.Color.foreground.swiftUI)
        .multilineTextAlignment(.center)
      DSButton(
        String(localized: "async.retry"),
        style: .secondary,
        action: onRetry
      )
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .padding(DS.Spacing.lg)
  }
}

public struct DSOfflineView: View {
  let onRetry: (() -> Void)?

  public init(onRetry: (() -> Void)? = nil) {
    self.onRetry = onRetry
  }

  public var body: some View {
    VStack(spacing: DS.Spacing.md) {
      Image(systemName: "wifi.slash")
        .font(.system(size: 44))
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .accessibilityHidden(true)
      Text(String(localized: "async.offline"))
        .font(DS.TextStyle.body)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        .multilineTextAlignment(.center)
      if let onRetry {
        DSButton(
          String(localized: "async.retry"),
          style: .secondary,
          action: onRetry
        )
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .padding(DS.Spacing.lg)
    .accessibilityElement(children: .contain)
  }
}

public struct DSSubmittingOverlay: View {
  let message: String?

  public init(message: String? = nil) {
    self.message = message
  }

  public var body: some View {
    ZStack {
      DS.Color.foreground.swiftUI.opacity(0.15)
        .ignoresSafeArea()
      VStack(spacing: DS.Spacing.md) {
        ProgressView()
          .controlSize(.large)
        if let message {
          Text(message)
            .font(DS.TextStyle.body)
            .foregroundStyle(DS.Color.foreground.swiftUI)
        }
      }
      .padding(DS.Spacing.xl)
      .background(DS.Color.card.swiftUI)
      .clipShape(RoundedRectangle(cornerRadius: DS.Radius.lg))
      .shadow(radius: 8)
    }
    .accessibilityElement(children: .combine)
    .accessibilityLabel(Text(message ?? String(localized: "async.submitting")))
  }
}

// MARK: - Preview

#Preview("Loading — Light") {
  DSLoadingView(message: "Đang tải…")
    .preferredColorScheme(.light)
}

#Preview("Error — Dark") {
  DSErrorView(message: "Có lỗi xảy ra.") { }
    .preferredColorScheme(.dark)
}

#Preview("Offline — XXXL") {
  DSOfflineView { }
    .dynamicTypeSize(.accessibility3)
}

#Preview("Submitting") {
  DSSubmittingOverlay(message: "Đang gửi…")
}
#endif
