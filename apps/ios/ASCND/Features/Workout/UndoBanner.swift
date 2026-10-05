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
          String(
            format: String(localized: "extra.undo.deleted.format"),
            exerciseName
          )
        )
        .font(.subheadline)
        // Dynamic Type lớn: cho xuống 2 dòng thay vì cắt tên bài tập.
        .lineLimit(2)
        Text(
          String(
            format: String(localized: "extra.undo.countdown.format"),
            secondsRemaining
          )
        )
        .font(.caption)
        .foregroundStyle(.secondary)
      }
      Spacer()
      Button(String(localized: "extra.undo.action")) {
        onUndo()
      }
      .buttonStyle(.borderedProminent)
      // 44pt theo HIG — nút undo bấm gấp, càng cần dễ trúng.
      .frame(minHeight: 44)
    }
    .padding()
    .background(.regularMaterial)
    .cornerRadius(12)
    .shadow(radius: 4)
    .accessibilityElement(children: .combine)
    .accessibilityLabel(
      String(
        format: String(localized: "extra.undo.deleted.format"),
        exerciseName
      )
    )
    .accessibilityHint(
      String(
        format: String(localized: "extra.undo.hint.format"),
        secondsRemaining
      )
    )
  }
}

/// Container quản lý countdown cho undo banner.
///
/// Align A19 (#415): nhận `UndoRemoval` (mirror của `Removal` —
/// key/sessionId/expiresAt/deletedSession), đếm ngược dẫn xuất từ
/// `expiresAt`, hết hạn gọi `onUndoExpired` (ứng với `RemoveRefusal.expired`).
/// Không session mutation — callbacks thuần presentation, A20 nối tiếp.
public struct UndoBannerContainer: View {
  let removal: UndoRemoval
  @State private var secondsRemaining: Int
  @State private var isExpired: Bool
  @State private var timer: Timer?

  var onUndo: () -> Void
  var onUndoExpired: () -> Void

  public init(
    removal: UndoRemoval,
    onUndo: @escaping () -> Void = {},
    onUndoExpired: @escaping () -> Void = {}
  ) {
    self.removal = removal
    // Deterministic: hết hạn ngay nếu expiresAt đã qua (preview "expired"
    // dùng .distantPast — không phụ thuộc thời điểm xem).
    let remaining = Int(removal.expiresAt.timeIntervalSinceNow.rounded(.up))
    self._secondsRemaining = State(initialValue: max(0, remaining))
    self._isExpired = State(initialValue: removal.expiresAt <= Date.now)
    self.onUndo = onUndo
    self.onUndoExpired = onUndoExpired
  }

  public var body: some View {
    Group {
      if !isExpired {
        UndoBanner(
          exerciseName: removal.exerciseName,
          secondsRemaining: secondsRemaining,
          onUndo: {
            timer?.invalidate()
            onUndo()
          }
        )
        .onAppear {
          startCountdown()
        }
        .onDisappear {
          timer?.invalidate()
        }
        // Parent tái dùng container cho lần gỡ khác (cùng identity):
        // reset đếm ngược theo removal mới, không giữ số giây cũ.
        .onChange(of: removal) { _, _ in
          let remaining = Int(removal.expiresAt.timeIntervalSinceNow.rounded(.up))
          secondsRemaining = max(0, remaining)
          isExpired = removal.expiresAt <= Date.now
          startCountdown()
        }
      }
    }
  }

  private func startCountdown() {
    timer?.invalidate()
    timer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { t in
      if secondsRemaining > 1 {
        secondsRemaining -= 1
      } else {
        t.invalidate()
        isExpired = true
        onUndoExpired()
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

#Preview("UndoBannerContainer — Visible") {
  UndoBannerContainer(
    removal: UndoRemoval(
      key: "x1",
      sessionId: "preview-session",
      expiresAt: Date.now.addingTimeInterval(6),
      exerciseName: "Incline Dumbbell Press"
    )
  )
  .padding()
}

#Preview("UndoBannerContainer — Expired") {
  // Deterministic: expiresAt đã qua → banner không hiện (trạng thái
  // "hết hạn" thật, không phụ thuộc thời điểm xem preview).
  UndoBannerContainer(
    removal: UndoRemoval(
      key: "x1",
      sessionId: "preview-session",
      expiresAt: .distantPast,
      deletedSession: true,
      exerciseName: "Bench Press"
    )
  )
  .padding()
}
