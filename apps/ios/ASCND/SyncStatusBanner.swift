// Sync status banner — C sở hữu (#385).
//
// Reusable banner cho Today/Workout/Summary:
// offline, queued/saving, synced, retryable failure, retrying.
// Nhận typed display state; không query SQLite/Supabase/Outbox.
import ASCNDDesignSystem
import SwiftUI

/// Trạng thái đồng bộ.
public enum SyncState: Hashable, Sendable {
  case synced
  case offline
  case queued(Int) // số items đang chờ
  case saving
  case retrying
  case failed(String)
}

public struct SyncStatusBanner: View {
  let state: SyncState
  var onRetry: () -> Void

  public init(state: SyncState, onRetry: @escaping () -> Void = {}) {
    self.state = state
    self.onRetry = onRetry
  }

  public var body: some View {
    switch state {
    case .synced:
      EmptyView()
    case .offline:
      banner(
        icon: "wifi.slash",
        message: String(localized: "sync.offline"),
        color: DS.Color.mutedForeground
      )
    case .queued(let count):
      banner(
        icon: "clock",
        message: String(
          format: String(localized: "sync.queued"),
          count
        ),
        color: DS.Color.readinessYellow
      )
    case .saving:
      HStack(spacing: DS.Spacing.xs) {
        ProgressView()
          .controlSize(.small)
        Text(String(localized: "sync.saving"))
          .font(DS.TextStyle.caption)
      }
      .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      .padding(.vertical, DS.Spacing.xs)
      .frame(maxWidth: .infinity)
      .background(DS.Color.secondary.swiftUI)
      .accessibilityElement(children: .combine)
      .accessibilityLabel(Text(String(localized: "sync.saving")))
    case .retrying:
      banner(
        icon: "arrow.clockwise",
        message: String(localized: "sync.retrying"),
        color: DS.Color.metricBlue
      )
    case .failed(let message):
      HStack(spacing: DS.Spacing.sm) {
        Image(systemName: "exclamationmark.triangle")
          .foregroundStyle(DS.Color.destructive.swiftUI)
          .accessibilityHidden(true)
        Text(message)
          .font(DS.TextStyle.caption)
          .foregroundStyle(DS.Color.foreground.swiftUI)
        Spacer()
        Button(String(localized: "sync.retry")) {
          onRetry()
        }
        .font(DS.TextStyle.caption.bold())
        .foregroundStyle(DS.Color.metricBlue.swiftUI)
        .frame(minHeight: 44)
      }
      .padding(.horizontal, DS.Spacing.md)
      .padding(.vertical, DS.Spacing.xs)
      .background(DS.Color.destructive.swiftUI.opacity(0.1))
      .accessibilityElement(children: .contain)
    }
  }

  private func banner(
    icon: String,
    message: String,
    color: DSColor
  ) -> some View {
    HStack(spacing: DS.Spacing.xs) {
      Image(systemName: icon)
        .accessibilityHidden(true)
      Text(message)
        .font(DS.TextStyle.caption)
    }
    .foregroundStyle(color.swiftUI)
    .padding(.vertical, DS.Spacing.xs)
    .frame(maxWidth: .infinity)
    .background(DS.Color.secondary.swiftUI)
    .accessibilityElement(children: .combine)
    .accessibilityLabel(Text(message))
  }
}

// MARK: - Preview

#Preview("Sync — offline") {
  SyncStatusBanner(state: .offline)
}

#Preview("Sync — queued") {
  SyncStatusBanner(state: .queued(3))
}

#Preview("Sync — failed") {
  SyncStatusBanner(state: .failed("Không thể đồng bộ.")) {}
}

#Preview("Sync — retrying") {
  SyncStatusBanner(state: .retrying)
}
