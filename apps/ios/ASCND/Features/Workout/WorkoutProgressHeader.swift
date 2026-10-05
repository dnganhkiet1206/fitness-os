// Header tiến trình buổi tập — C sở hữu (#311).
//
// Presentation thuần: nhận số đã tính sẵn, không đọc controller/domain.
// Hiển thị: bài hiện tại, set đã xong/tổng, thanh tiến trình.
import ASCNDDesignSystem
import SwiftUI

/// Dữ liệu hiển thị của header tiến trình — controller cung cấp.
public struct WorkoutProgressDisplay: Hashable, Sendable {
  public let exerciseName: String
  public let exerciseIndex: Int
  public let exerciseTotal: Int
  public let completedSets: Int
  public let totalSets: Int
  public let isFinished: Bool

  public init(
    exerciseName: String,
    exerciseIndex: Int,
    exerciseTotal: Int,
    completedSets: Int,
    totalSets: Int,
    isFinished: Bool = false
  ) {
    self.exerciseName = exerciseName
    self.exerciseIndex = exerciseIndex
    self.exerciseTotal = exerciseTotal
    self.completedSets = completedSets
    self.totalSets = totalSets
    self.isFinished = isFinished
  }

  /// Phần trăm hoàn thành (0–1).
  public var fraction: Double {
    guard totalSets > 0 else { return 0 }
    return min(1, Double(completedSets) / Double(totalSets))
  }
}

public struct WorkoutProgressHeader: View {
  let progress: WorkoutProgressDisplay

  public init(progress: WorkoutProgressDisplay) {
    self.progress = progress
  }

  public var body: some View {
    VStack(alignment: .leading, spacing: DS.Spacing.xs) {
      HStack {
        VStack(alignment: .leading, spacing: 2) {
          Text(progress.exerciseName)
            .font(DS.TextStyle.headline)
            .foregroundStyle(DS.Color.foreground.swiftUI)
          Text(
            String(
              format: String(localized: "workout.progress.exercise"),
              progress.exerciseIndex, progress.exerciseTotal
            )
          )
          .font(DS.TextStyle.caption)
          .foregroundStyle(DS.Color.mutedForeground.swiftUI)
        }
        Spacer()
        Text(
          String(
            format: String(localized: "workout.progress.sets"),
            progress.completedSets, progress.totalSets
          )
        )
        .font(DS.TextStyle.headline.monospacedDigit())
        .foregroundStyle(
          progress.isFinished
            ? DS.Color.metricGreen.swiftUI
            : DS.Color.foreground.swiftUI
        )
      }

      // Thanh tiến trình.
      GeometryReader { geo in
        ZStack(alignment: .leading) {
          RoundedRectangle(cornerRadius: DS.Radius.sm)
            .fill(DS.Color.secondary.swiftUI)
            .frame(height: 8)
          RoundedRectangle(cornerRadius: DS.Radius.sm)
            .fill(
              progress.isFinished
                ? DS.Color.metricGreen.swiftUI
                : DS.Color.primary.swiftUI
            )
            .frame(
              width: geo.size.width * progress.fraction,
              height: 8
            )
        }
      }
      .frame(height: 8)
    }
    .accessibilityElement(children: .combine)
    .accessibilityLabel(
      Text(
        String(
          format: String(localized: "workout.progress.accessibility"),
          progress.exerciseName, progress.completedSets, progress.totalSets
        )
      )
    )
    .accessibilityValue(
      Text("\(Int(progress.fraction * 100))%")
    )
  }
}

// MARK: - Preview

#Preview("Progress — Light") {
  WorkoutProgressHeader(
    progress: .init(
      exerciseName: "Bench Press",
      exerciseIndex: 2, exerciseTotal: 5,
      completedSets: 7, totalSets: 12
    )
  )
  .padding()
  .preferredColorScheme(.light)
}

#Preview("Progress — Finished") {
  WorkoutProgressHeader(
    progress: .init(
      exerciseName: "Bench Press",
      exerciseIndex: 5, exerciseTotal: 5,
      completedSets: 12, totalSets: 12,
      isFinished: true
    )
  )
  .padding()
  .preferredColorScheme(.dark)
}

#Preview("Progress — XXXL") {
  WorkoutProgressHeader(
    progress: .init(
      exerciseName: "Bench Press",
      exerciseIndex: 1, exerciseTotal: 5,
      completedSets: 0, totalSets: 12
    )
  )
  .padding()
  .dynamicTypeSize(.accessibility3)
}
