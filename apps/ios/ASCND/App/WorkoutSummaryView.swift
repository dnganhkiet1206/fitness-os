// Màn tóm tắt sau buổi tập — C sở hữu UI (#248, #279).
//
// SEAM cho A (#279): nhận `WorkoutSummary` THẬT do
// `WorkoutSessionController.finish()` trả về, KHÔNG tự tính lại từ
// `[PlannedSet] + DayProgress`.
//  - Số trên màn (volume, số set, số bài) = đúng `volume_load` gửi lên
//    server (Int, đã bỏ khởi động) — lấy từ `summary`, không gọi
//    `WorkoutMath` trong View (lệch làm tròn với `Math.round` baseline).
//  - Danh sách chi tiết lấy từ `sets` (A8 dựng từ bản ghi đã chốt).
//  - Fixture độc lập cho Preview (không cần controller thật).
#if canImport(SwiftUI)
import ASCNDCore
import ASCNDDesignSystem
import SwiftUI

/// Một set đã làm, để hiển thị — A8 (#272) dựng từ bản ghi đã chốt.
public struct SummarySet: Hashable, Sendable {
  public let exerciseName: String
  public let weightKg: Double?
  public let reps: Int
  public let durationSec: Int?
  public let warmup: Bool

  public init(
    exerciseName: String,
    weightKg: Double? = nil,
    reps: Int,
    durationSec: Int? = nil,
    warmup: Bool = false
  ) {
    self.exerciseName = exerciseName
    self.weightKg = weightKg
    self.reps = reps
    self.durationSec = durationSec
    self.warmup = warmup
  }
}

public struct WorkoutSummaryView: View {
  /// Tổng hợp thật từ `finish()` — số trên màn = số lên server.
  let summary: WorkoutSummary
  /// Chi tiết từng set đã làm (kể cả khởi động, hiện mờ).
  let sets: [SummarySet]

  public init(summary: WorkoutSummary, sets: [SummarySet]) {
    self.summary = summary
    self.sets = sets
  }

  private var exerciseGroups: [(name: String, rows: [SummarySet])] {
    var order: [String] = []
    var groups: [String: [SummarySet]] = [:]
    for s in sets {
      if groups[s.exerciseName] == nil { order.append(s.exerciseName) }
      groups[s.exerciseName, default: []].append(s)
    }
    return order.map { (name: $0, rows: groups[$0] ?? []) }
  }

  public var body: some View {
    ScrollView {
      VStack(spacing: DS.Spacing.md) {
        DSCard {
          HStack(spacing: DS.Spacing.md) {
            DSStatTile(
              label: String(localized: "summary.volume"),
              value: "\(summary.volumeKg)",
              unit: "kg"
            )
            DSStatTile(
              label: String(localized: "summary.sets"),
              value: "\(summary.completedSets)"
            )
            DSStatTile(
              label: String(localized: "summary.exercises"),
              value: "\(summary.exerciseCount)"
            )
          }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(
          Text(
            String(
              format: String(localized: "summary.stats.accessibility"),
              summary.volumeKg, summary.completedSets, summary.exerciseCount
            )
          )
        )

        ForEach(exerciseGroups, id: \.name) { group in
          VStack(alignment: .leading, spacing: DS.Spacing.sm) {
            DSSectionHeader(group.name)
            ForEach(group.rows, id: \.self) { s in
              HStack {
                Text(setLabel(s))
                  .font(DS.Type.body.monospacedDigit())
                  .foregroundStyle(DS.Color.foreground.swiftUI)
                Spacer()
                if s.warmup {
                  Text(String(localized: "summary.warmup"))
                    .font(DS.Type.caption)
                    .foregroundStyle(DS.Color.mutedForeground.swiftUI)
                }
              }
              .opacity(s.warmup ? 0.5 : 1)
              .accessibilityElement(children: .combine)
              .accessibilityLabel(Text("\(group.name), \(setLabel(s))"))
            }
          }
        }
      }
      .padding(DS.Spacing.md)
    }
    .navigationTitle(Text(summary.templateName))
  }

  private func setLabel(_ s: SummarySet) -> String {
    if let secs = s.durationSec, secs > 0 {
      return "\(secs)s"
    }
    if let w = s.weightKg, w > 0 {
      return "\(String(format: "%g", w)) kg × \(s.reps)"
    }
    return "× \(s.reps)"
  }
}

// MARK: - Fixture độc lập (không cần controller thật)

extension WorkoutSummaryView {
  static let sampleSummary = WorkoutSummary(
    sessionId: "preview-1",
    dateTime: EpochMillis(1_728_000_000_000),
    templateName: "Ngực – Vai – Tay",
    completedSets: 4,
    warmupSets: 1,
    holdSets: 1,
    exerciseCount: 2,
    volumeKg: 1340,
    sessionRpe: 8,
    prDetected: false
  )

  static let sampleSets: [SummarySet] = [
    SummarySet(exerciseName: "Bench Press", weightKg: 40, reps: 8, warmup: true),
    SummarySet(exerciseName: "Bench Press", weightKg: 60, reps: 8),
    SummarySet(exerciseName: "Bench Press", weightKg: 60, reps: 8),
    SummarySet(exerciseName: "Bench Press", weightKg: 62.5, reps: 6),
    SummarySet(exerciseName: "Plank", reps: 0, durationSec: 45),
  ]
}

#Preview("Light") {
  NavigationStack {
    WorkoutSummaryView(summary: .sampleSummary, sets: .sampleSets)
  }
  .preferredColorScheme(.light)
}

#Preview("Dark") {
  NavigationStack {
    WorkoutSummaryView(summary: .sampleSummary, sets: .sampleSets)
  }
  .preferredColorScheme(.dark)
}

#Preview("Dynamic Type XXL") {
  NavigationStack {
    WorkoutSummaryView(summary: .sampleSummary, sets: .sampleSets)
  }
  .dynamicTypeSize(.accessibility3)
}
#endif
