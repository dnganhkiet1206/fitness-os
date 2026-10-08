// Thẻ nghỉ trong app — C sở hữu UI (#277).
//
// Dùng `RestTimer.ringFraction(at:)` — CÙNG công thức với Island (#227 H4),
// không tự tính vòng riêng. #235: chiều vòng / −15 / tạm dừng đều do
// `RestTimer` quyết; thẻ chỉ vẽ và chuyển nút bấm về controller.
//
// Presentation thuần: nhận `RestTimer` + callback, không giữ state nghỉ.
import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

public struct RestCard: View {
  let timer: RestTimer
  var onAdjust: (Int) -> Void
  var onSkip: () -> Void
  /// Tạm dừng (`true`) / tiếp tục (`false`) — `RestTimerController.setPaused`.
  var onSetPaused: (Bool) -> Void

  public init(
    timer: RestTimer,
    onAdjust: @escaping (Int) -> Void = { _ in },
    onSkip: @escaping () -> Void = {},
    onSetPaused: @escaping (Bool) -> Void = { _ in }
  ) {
    self.timer = timer
    self.onAdjust = onAdjust
    self.onSkip = onSkip
    self.onSetPaused = onSetPaused
  }

  public var body: some View {
    // Tick mỗi giây để vẽ vòng mượt — digits chính xác nhờ `remaining(at:)`,
    // vòng mượt nhờ `ringFraction(at:)` (cùng hàm Island dùng).
    TimelineView(.periodic(from: .now, by: 0.25)) { context in
      content(now: EpochMillis(context.date))
    }
  }

  private func content(now: EpochMillis) -> some View {
    let left = timer.remaining(at: now)
    let fraction = timer.ringFraction(at: now)
    let paused = timer.isPaused
    // Vòng đứng yên không đỏ: cảnh báo là về thời gian đang cạn (RT-10c).
    let warning = RestTimer.warns(left: left, paused: paused)

    return DSCard {
      VStack(spacing: DS.Spacing.md) {
        HStack {
          // Vòng nghỉ.
          ZStack {
            Circle()
              .stroke(DS.Color.secondary.swiftUI, lineWidth: 10)
            Circle()
              .trim(from: 0, to: fraction)
              .stroke(
                warning ? DS.Color.destructive.swiftUI : DS.Color.primary.swiftUI,
                style: StrokeStyle(lineWidth: 10, lineCap: .round)
              )
              .rotationEffect(.degrees(-90))
            Text(verbatim: "\(left)s")
              .font(DS.TextStyle.mono(.title))
              .foregroundStyle(DS.Color.foreground.swiftUI)
              .monospacedDigit()
          }
          .frame(width: 88, height: 88)
          .accessibilityLabel(
            Text(
              String(
                format: String(localized: "workout.rest.left"),
                left
              )
            )
          )

          VStack(alignment: .leading, spacing: DS.Spacing.xs) {
            Text(paused ? String(localized: "workout.rest.title.paused") : String(localized: "workout.rest.title"))
              .font(DS.TextStyle.headline)
              .foregroundStyle(DS.Color.foreground.swiftUI)
            if warning {
              Text(String(localized: "workout.rest.warning"))
                .font(DS.TextStyle.footnote)
                .foregroundStyle(DS.Color.destructive.swiftUI)
            } else {
              Text(String(localized: "workout.rest.hint"))
                .font(DS.TextStyle.footnote)
                .foregroundStyle(DS.Color.mutedForeground.swiftUI)
            }
          }

          Spacer(minLength: 0)
        }

        // −15 / +15 / Tạm dừng / Bỏ qua.
        HStack(spacing: DS.Spacing.sm) {
          adjustButton(delta: -15)
          adjustButton(delta: 15)
          pauseButton(paused: paused)
          Spacer(minLength: 0)
          Button(String(localized: "workout.rest.skip")) {
            onSkip()
          }
          .font(DS.TextStyle.footnote)
          .foregroundStyle(DS.Color.metricBlue.swiftUI)
          .frame(minHeight: 44)
          .accessibilityAddTraits(.isButton)
        }
      }
    }
  }

  private func pauseButton(paused: Bool) -> some View {
    Button {
      onSetPaused(!paused)
    } label: {
      Image(systemName: paused ? "play.fill" : "pause.fill")
        .font(DS.TextStyle.footnote)
        .padding(.horizontal, DS.Spacing.md)
        .frame(minWidth: 44, minHeight: 44)
        .background(DS.Color.secondary.swiftUI)
        .foregroundStyle(DS.Color.foreground.swiftUI)
        .clipShape(Capsule())
    }
    .accessibilityLabel(Text(paused ? String(localized: "workout.rest.resume") : String(localized: "workout.rest.pause")))
  }

  private func adjustButton(delta: Int) -> some View {
    Button {
      onAdjust(delta)
    } label: {
      Text(delta > 0 ? "+\(delta)s" : "\(delta)s")
        .font(DS.TextStyle.footnote)
        .padding(.horizontal, DS.Spacing.md)
        .frame(minHeight: 44)
        .background(DS.Color.secondary.swiftUI)
        .foregroundStyle(DS.Color.foreground.swiftUI)
        .clipShape(Capsule())
    }
    .accessibilityLabel(
      Text(
        String(
          format: String(localized: "workout.rest.adjust"),
          delta > 0 ? "+\(delta)" : "\(delta)"
        )
      )
    )
  }
}

// MARK: - Preview

#Preview("Rest — Light") {
  RestCard(
    timer: RestTimer.start(
      seconds: 90,
      at: EpochMillis(Date().addingTimeInterval(-30))
    )!
  )
  .padding()
  .preferredColorScheme(.light)
}

#Preview("Rest — Dark") {
  RestCard(
    timer: RestTimer.start(
      seconds: 90,
      at: EpochMillis(Date().addingTimeInterval(-30))
    )!
  )
  .padding()
  .preferredColorScheme(.dark)
}

#Preview("Rest — Warning (5s)") {
  RestCard(
    timer: RestTimer.start(
      seconds: 90,
      at: EpochMillis(Date().addingTimeInterval(-86))
    )!
  )
  .padding()
}

#Preview("Dynamic Type XXXL") {
  RestCard(
    timer: RestTimer.start(
      seconds: 90,
      at: EpochMillis(Date().addingTimeInterval(-30))
    )!
  )
  .padding()
  .dynamicTypeSize(.accessibility3)
}
