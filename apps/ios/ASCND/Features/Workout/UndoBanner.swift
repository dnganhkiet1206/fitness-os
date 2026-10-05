// Undo banner 8 giây — C sở hữu (#408).
#if canImport(SwiftUI)
@_exported import SwiftUI
#endif

/// Banner undo hiện 8s sau khi xoá extra exercise.
public struct UndoBanner: View {
  let exerciseName: String
  /// Thời gian còn lại (giây) — view cha quản lý countdown.
  let secondsRemaining: Int
  var onUndo: () -> Void

  public init(
    exerciseName: String,
    secondsRemaining: Int,
    onUndo: @escaping () -> Void = {}
  ) {
    self.exerciseName = exerciseName
    self.secondsRemaining = secondsRemaining
    self.onUndo = onUndo
  }

  public var body: some View {
    HStack {
      Image(systemName: "trash")
        .accessibilityHidden(true)
      VStack(alignment: .leading, spacing: 2) {
        Text(
          String(localized: "extra.undo.deleted \(exerciseName)")
        )
        .font(.subheadline)
        .lineLimit(1)
        Text(
          String(localized: "extra.undo.countdown \(secondsRemaining)")
        )
        .font(.caption)
        .foregroundStyle(.secondary)
      }
      Spacer()
      Button(String(localized: "extra.undo.action")) {
        onUndo()
      }
      .buttonStyle(.borderedProminent)
      .controlSize(.small)
    }
    .padding()
    .background(.regularMaterial)
    .cornerRadius(12)
    .shadow(radius: 4)
    .accessibilityElement(children: .combine)
    .accessibilityLabel(
      String(localized: "extra.undo.deleted \(exerciseName)")
    )
    .accessibilityHint(
      String(localized: "extra.undo.hint \(secondsRemaining)")
    )
  }
}

/// Container quản lý countdown 8s cho undo banner.
public struct UndoBannerContainer: View {
  let exerciseName: String
  @State private var secondsRemaining = 8
  @State private var isExpired = false

  var onUndo: () -> Void
  var onExpire: () -> Void

  public init(
    exerciseName: String,
    onUndo: @escaping () -> Void = {},
    onExpire: @escaping () -> Void = {}
  ) {
    self.exerciseName = exerciseName
    self.onUndo = onUndo
    self.onExpire = onExpire
  }

  public var body: some View {
    Group {
      if !isExpired {
        UndoBanner(
          exerciseName: exerciseName,
          secondsRemaining: secondsRemaining,
          onUndo: {
            onUndo()
          }
        )
        .onAppear {
          startCountdown()
        }
      }
    }
  }

  private func startCountdown() {
    Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { timer in
      if secondsRemaining > 1 {
        secondsRemaining -= 1
      } else {
        timer.invalidate()
        isExpired = true
        onExpire()
      }
    }
  }
}

// MARK: - Previews

#Preview("UndoBanner — Visible") {
  UndoBanner(
    exerciseName: "Incline Dumbbell Press",
    secondsRemaining: 6
  )
  .padding()
}

#Preview("UndoBanner — Almost Expired") {
  UndoBanner(
    exerciseName: "Cable Fly",
    secondsRemaining: 1
  )
  .padding()
}
