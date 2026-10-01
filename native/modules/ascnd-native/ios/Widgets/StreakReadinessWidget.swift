import SwiftUI
import WidgetKit

// MARK: - Widget 2 — Streak + Readiness (spike #195)

struct StreakReadinessEntry: TimelineEntry {
  let date: Date
  let data: StreakReadinessData
}

struct StreakReadinessProvider: TimelineProvider {
  func placeholder(in context: Context) -> StreakReadinessEntry {
    StreakReadinessEntry(date: .now, data: MockWidgetDataProvider.streakReadiness())
  }

  func getSnapshot(in context: Context, completion: @escaping (StreakReadinessEntry) -> Void) {
    completion(StreakReadinessEntry(date: .now, data: currentData()))
  }

  func getTimeline(
    in context: Context,
    completion: @escaping (Timeline<StreakReadinessEntry>) -> Void
  ) {
    let entry = StreakReadinessEntry(date: .now, data: currentData())
    let timeline = Timeline(
      entries: [entry],
      policy: .after(.now.addingTimeInterval(30 * 60))
    )
    completion(timeline)
  }

  private func currentData() -> StreakReadinessData {
    WidgetDataStore.readStreakReadiness() ?? MockWidgetDataProvider.streakReadiness()
  }
}

struct StreakReadinessWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(
      kind: "com.ascnd.fitnessos.widgets.streak-readiness",
      provider: StreakReadinessProvider()
    ) { entry in
      StreakReadinessView(data: entry.data)
    }
    .configurationDisplayName("Streak + Readiness")
    .description("Your ASCND streak and readiness.")
    .supportedFamilies([.systemSmall, .systemMedium])
  }
}

struct StreakReadinessView: View {
  let data: StreakReadinessData

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      Text("ASCND")
        .font(.caption2)
        .foregroundStyle(.secondary)
      HStack(alignment: .firstTextBaseline, spacing: 4) {
        Text("\(data.streakDays)")
          .font(.system(size: 34, weight: .bold, design: .rounded))
        Text(data.streakDays == 1 ? "day" : "days")
          .font(.caption)
          .foregroundStyle(.secondary)
      }
      if let score = data.readinessScore {
        Text("Readiness \(score)")
          .font(.caption)
      }
      Text(data.statusText)
        .font(.caption)
        .foregroundStyle(.secondary)
        .lineLimit(2)
    }
    .padding()
  }
}
