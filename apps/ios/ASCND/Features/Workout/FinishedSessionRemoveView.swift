// Seam xoá exercise khỏi session đã finish — C sở hữu (#408).
//
// UI seam cho flow A19 (#415): `canRemove(key)` đúng → hiện hộp hỏi lại
// kiểu destructive này → xác nhận thì parent gọi `removeLoggedSet`.
// KHÔNG quyết định policy offline (#235/#241) — chỉ consume
// typed contract trong tương lai.
#if canImport(SwiftUI)
@_exported import SwiftUI
#endif

/// Confirmation cho việc xoá exercise khỏi buổi đã finish.
public struct FinishedSessionRemoveView: View {
  let exerciseName: String
  let sessionDate: String

  var onConfirmRemoval: () -> Void
  var onCancelRemoval: () -> Void

  public init(
    exerciseName: String,
    sessionDate: String,
    onConfirmRemoval: @escaping () -> Void = {},
    onCancelRemoval: @escaping () -> Void = {}
  ) {
    self.exerciseName = exerciseName
    self.sessionDate = sessionDate
    self.onConfirmRemoval = onConfirmRemoval
    self.onCancelRemoval = onCancelRemoval
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
          onCancelRemoval()
        }
        .buttonStyle(.bordered)
        .frame(minHeight: 44)
        Button(
          String(localized: "extra.remove.finished.confirm"),
          role: .destructive
        ) {
          onConfirmRemoval()
        }
        .buttonStyle(.borderedProminent)
        .frame(minHeight: 44)
      }
    }
    .padding()
    // .contain — KHÔNG .combine: combine gộp 2 nút thành 1 phần tử,
    // VoiceOver không bấm riêng từng nút được.
    .accessibilityElement(children: .contain)
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
