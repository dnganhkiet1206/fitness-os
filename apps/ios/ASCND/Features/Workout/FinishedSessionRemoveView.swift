// Seam xoá exercise khỏi session đã finish — C sở hữu (#408).
//
// UI seam cho flow "remove exercise from finished session".
// KHÔNG quyết định policy offline (#235/#241) — chỉ consume
// typed contract trong tương lai.
#if canImport(SwiftUI)
@_exported import SwiftUI
#endif

/// Confirmation cho việc xoá exercise khỏi buổi đã finish.
public struct FinishedSessionRemoveView: View {
  let exerciseName: String
  let sessionDate: String

  var onConfirm: () -> Void
  var onCancel: () -> Void

  public init(
    exerciseName: String,
    sessionDate: String,
    onConfirm: @escaping () -> Void = {},
    onCancel: @escaping () -> Void = {}
  ) {
    self.exerciseName = exerciseName
    self.sessionDate = sessionDate
    self.onConfirm = onConfirm
    self.onCancel = onCancel
  }

  public var body: some View {
    VStack(spacing: 16) {
      Image(systemName: "exclamationmark.triangle")
        .font(.largeTitle)
        .foregroundStyle(.orange)
        .accessibilityHidden(true)
      Text(String(localized: "extra.remove.finished.title"))
        .font(.headline)
      Text(
        String(
          format: String(localized: "extra.remove.finished.message.format"),
          exerciseName,
          sessionDate
        )
      )
      .font(.subheadline)
      .foregroundStyle(.secondary)
      .multilineTextAlignment(.center)
      HStack(spacing: 12) {
        Button(String(localized: "common.cancel")) {
          onCancel()
        }
        .buttonStyle(.bordered)
        Button(
          String(localized: "extra.remove.finished.confirm"),
          role: .destructive
        ) {
          onConfirm()
        }
        .buttonStyle(.borderedProminent)
      }
    }
    .padding()
    .accessibilityElement(children: .combine)
  }
}

// MARK: - Previews

#Preview("FinishedSessionRemove") {
  FinishedSessionRemoveView(
    exerciseName: "Bench Press",
    sessionDate: "5 tháng 10"
  )
  .padding()
}
