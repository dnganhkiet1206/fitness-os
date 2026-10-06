// Lịch sử buổi tập — C sở hữu (#367).
//
// Read-only UI: ngày, tên buổi, trạng thái, volume/tóm tắt.
// Dùng fixture khi repository chưa production-ready.
// Query/repository logic ở ngoài View.
import ASCNDDesignSystem
import SwiftUI

/// Một buổi đã tập — dữ liệu hiển thị.
public struct HistorySession: Hashable, Sendable {
  public let id: String
  public let date: Date
  public let templateName: String
  public let volumeKg: Int
  public let completedSets: Int
  public let exerciseCount: Int
  public let hasPR: Bool

  public init(
    id: String,
    date: Date,
    templateName: String,
    volumeKg: Int,
    completedSets: Int,
    exerciseCount: Int,
    hasPR: Bool = false
  ) {
    self.id = id
    self.date = date
    self.templateName = templateName
    self.volumeKg = volumeKg
    self.completedSets = completedSets
    self.exerciseCount = exerciseCount
    self.hasPR = hasPR
  }
}

/// Trạng thái màn lịch sử.
public enum HistoryState: Hashable, Sendable {
  case loading
  case loaded([HistorySession])
  case empty
  case offline([HistorySession])
  case error(String)
}

public struct WorkoutHistoryView: View {
  let state: HistoryState
  var onRetry: () -> Void
  var onSelect: (HistorySession) -> Void

  public init(
    state: HistoryState,
    onRetry: @escaping () -> Void = {},
    onSelect: @escaping (HistorySession) -> Void = { _ in }
  ) {
    self.state = state
    self.onRetry = onRetry
    self.onSelect = onSelect
  }

  public var body: some View {
    NavigationStack {
      Group {
        switch state {
        case .loading:
          DSLoadingView(message: String(localized: "history.loading"))
        case .loaded(let sessions):
          sessionList(sessions, offline: false)
        case .empty:
          DSEmptyState(
            systemImage: "dumbbell",
            title: String(localized: "history.empty.title"),
            message: String(localized: "history.empty.message")
          )
        case .offline(let sessions):
          VStack(spacing: 0) {
            offlineBanner
            sessionList(sessions, offline: true)
          }
        case .error(let message):
          DSErrorView(message: message, onRetry: onRetry)
        }
      }
      .navigationTitle(String(localized: "history.title"))
    }
  }

  private func sessionList(_ sessions: [HistorySession], offline: Bool) -> some View {
    List(sessions, id: \.id) { session in
      Button {
        onSelect(session)
      } label: {
        sessionRow(session)
      }
      .frame(minHeight: 44)
    }
    .listStyle(.plain)
  }

  private func sessionRow(_ s: HistorySession) -> some View {
    HStack(spacing: DS.Spacing.md) {
      VStack(alignment: .leading, spacing: 4) {
        HStack(spacing: DS.Spacing.xs) {
          Text(s.templateName)
            .font(DS.TextStyle.headline)
            .foregroundStyle(DS.Color.foreground.swiftUI)
          if s.hasPR {
            Image(systemName: "trophy.fill")
              .font(.caption)
              .foregroundStyle(DS.Color.readinessYellow.swiftUI)
              .accessibilityLabel(Text(String(localized: "history.pr")))
          }
        }
        Text(s.date, format: .dateTime.day().month().year())
          .font(DS.TextStyle.caption)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
      Spacer()
      VStack(alignment: .trailing, spacing: 4) {
        Text("\(s.volumeKg) kg")
          .font(DS.TextStyle.body.monospacedDigit())
          .foregroundStyle(DS.Color.foreground.swiftUI)
        Text(
          String(
            format: String(localized: "history.sets"),
            s.completedSets, s.exerciseCount
          )
        )
        .font(DS.TextStyle.caption)
        .foregroundStyle(DS.Color.mutedForeground.swiftUI)
      }
    }
    .padding(.vertical, DS.Spacing.xs)
    .accessibilityElement(children: .combine)
    .accessibilityLabel(
      Text(
        String(
          format: String(localized: "history.a11y.row"),
          s.templateName, s.volumeKg, s.completedSets
        )
      )
    )
  }

  private var offlineBanner: some View {
    HStack(spacing: DS.Spacing.xs) {
      Image(systemName: "wifi.slash")
        .accessibilityHidden(true)
      Text(String(localized: "history.offline"))
        .font(DS.TextStyle.caption)
    }
    .foregroundStyle(DS.Color.mutedForeground.swiftUI)
    .padding(.vertical, DS.Spacing.xs)
    .frame(maxWidth: .infinity)
    .background(DS.Color.secondary.swiftUI)
  }
}

// MARK: - Preview

#Preview("History — loaded") {
  WorkoutHistoryView(
    state: .loaded([
      .init(
        id: "1", date: Date(),
        templateName: "Ngực – Vai – Tay",
        volumeKg: 2400, completedSets: 12, exerciseCount: 5,
        hasPR: true
      ),
      .init(
        id: "2", date: Date().addingTimeInterval(-86400),
        templateName: "Chân – Mông",
        volumeKg: 1800, completedSets: 10, exerciseCount: 4
      ),
    ])
  )
}

#Preview("History — empty") {
  WorkoutHistoryView(state: .empty)
}

#Preview("History — offline") {
  WorkoutHistoryView(
    state: .offline([
      .init(
        id: "1", date: Date(),
        templateName: "Ngực – Vai – Tay",
        volumeKg: 2400, completedSets: 12, exerciseCount: 5
      ),
    ])
  )
}
