// Màn tóm tắt sau buổi tập — C sở hữu (#248).
//
// CHỈ HIỂN THỊ: nhận [PlannedSet] + DayProgress, tính bằng WorkoutDay /
// WorkoutMath của A. Không ghi server (outbox là phần của A, #225),
// không phát hiện kỷ lục (chờ A nối lịch sử).
#if canImport(SwiftUI)
import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Một dòng set đã làm, để hiển thị.
private struct SummaryRow: Hashable {
  let set: PlannedSet
  let performed: PerformedSet
  let ticked: Bool
}

public struct WorkoutSummaryView: View {
  let rows: [PlannedSet]
  let progress: DayProgress

  public init(rows: [PlannedSet], progress: DayProgress) {
    self.rows = rows
    self.progress = progress
  }

  private var summaryRows: [SummaryRow] {
    rows.map { row in
      SummaryRow(
        set: row,
        performed: WorkoutDay.performed(row, progress),
        ticked: progress.done[row.key] ?? false
      )
    }
  }

  private var loggedSets: [LoggedSet] {
    summaryRows.filter(\.ticked).map { r in
      LoggedSet(
        reps: r.performed.reps,
        weight: r.performed.weightKg > 0 ? r.performed.weightKg : nil,
        warmup: r.set.warmup,
        durationSec: r.performed.durationSec
      )
    }
  }

  private var exerciseGroups: [(name: String, rows: [SummaryRow])] {
    let ticked = summaryRows.filter(\.ticked)
    var order: [String] = []
    var groups: [String: [SummaryRow]] = [:]
    for r in ticked {
      if groups[r.set.exerciseName] == nil { order.append(r.set.exerciseName) }
      groups[r.set.exerciseName, default: []].append(r)
    }
    return order.map { (name: $0, rows: groups[$0] ?? []) }
  }

  public var body: some View {
    let volume = WorkoutMath.volume(of: loggedSets)
    let setCount = WorkoutMath.performedSetCount(loggedSets)

    ScrollView {
      VStack(spacing: DS.Spacing.md) {
        DSCard {
          HStack(spacing: DS.Spacing.md) {
            DSStatTile(
              label: String(localized: "summary.volume"),
              value: String(format: "%.0f", volume),
              unit: "kg"
            )
            DSStatTile(
              label: String(localized: "summary.sets"),
              value: "\(setCount)"
            )
            DSStatTile(
              label: String(localized: "summary.exercises"),
              value: "\(exerciseGroups.count)"
            )
          }
        }

        ForEach(exerciseGroups, id: \.name) { group in
          VStack(alignment: .leading, spacing: DS.Spacing.sm) {
            DSSectionHeader(group.name)
            ForEach(group.rows, id: \.set.key) { r in
              HStack {
                Text(setLabel(r))
                  .font(DS.TextStyle.body.monospacedDigit())
                  .foregroundStyle(DS.Color.foreground.swiftUI)
                Spacer()
                if r.set.warmup {
                  Text(String(localized: "summary.warmup"))
                    .font(DS.TextStyle.caption)
                    .foregroundStyle(DS.Color.mutedForeground.swiftUI)
                }
              }
              .opacity(r.set.warmup ? 0.5 : 1)
              .accessibilityElement(children: .combine)
              .accessibilityLabel(Text("\(group.name), \(setLabel(r))"))
            }
          }
        }
      }
      .padding(DS.Spacing.md)
    }
    .navigationTitle(Text(String(localized: "summary.title")))
  }

  private func setLabel(_ r: SummaryRow) -> String {
    if let secs = r.performed.durationSec, secs > 0 {
      return "\(secs)s"
    }
    let w = r.performed.weightKg
    if w > 0 {
      return "\(String(format: "%g", w)) kg × \(r.performed.reps)"
    }
    return "× \(r.performed.reps)"
  }
}

#Preview("Light") {
  NavigationStack {
    WorkoutSummaryView(rows: WorkoutSummaryView.sampleRows, progress: WorkoutSummaryView.sampleProgress)
  }
  .preferredColorScheme(.light)
}

#Preview("Dark") {
  NavigationStack {
    WorkoutSummaryView(rows: WorkoutSummaryView.sampleRows, progress: WorkoutSummaryView.sampleProgress)
  }
  .preferredColorScheme(.dark)
}

#Preview("Dynamic Type XXL") {
  NavigationStack {
    WorkoutSummaryView(rows: WorkoutSummaryView.sampleRows, progress: WorkoutSummaryView.sampleProgress)
  }
  .dynamicTypeSize(.accessibility3)
}

extension WorkoutSummaryView {
  static let sampleRows: [PlannedSet] = [
    PlannedSet(key: "w1", exerciseName: "Bench Press", ordinal: 1, of: 3, weightKg: 40, reps: 8, plannedRest: 90, warmup: true),
    PlannedSet(key: "s1", exerciseName: "Bench Press", ordinal: 1, of: 3, weightKg: 60, reps: 8, plannedRest: 90),
    PlannedSet(key: "s2", exerciseName: "Bench Press", ordinal: 2, of: 3, weightKg: 60, reps: 8, plannedRest: 90),
    PlannedSet(key: "s3", exerciseName: "Bench Press", ordinal: 3, of: 3, weightKg: 62.5, reps: 6, plannedRest: 120),
    PlannedSet(key: "p1", exerciseName: "Plank", ordinal: 1, of: 2, weightKg: 0, reps: 0, plannedRest: 60),
  ]

  static let sampleProgress: DayProgress = {
    var p = DayProgress()
    p.done = ["w1": true, "s1": true, "s2": true, "s3": true, "p1": true]
    p.repsText = ["p1": "45s"]
    return p
  }()
}
#endif
