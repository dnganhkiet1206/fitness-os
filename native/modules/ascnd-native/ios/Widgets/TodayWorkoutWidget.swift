import SwiftUI
import WidgetKit

// MARK: - Widget 1 — Today's Workout (primary widget, spike #195)

struct TodayWorkoutEntry: TimelineEntry {
  let date: Date
  let data: TodayWorkoutData
}

struct TodayWorkoutProvider: TimelineProvider {
  func placeholder(in context: Context) -> TodayWorkoutEntry {
    TodayWorkoutEntry(date: .now, data: MockWidgetDataProvider.todayWorkout())
  }

  func getSnapshot(in context: Context, completion: @escaping (TodayWorkoutEntry) -> Void) {
    completion(TodayWorkoutEntry(date: .now, data: currentData()))
  }

  func getTimeline(
    in context: Context,
    completion: @escaping (Timeline<TodayWorkoutEntry>) -> Void
  ) {
    let entry = TodayWorkoutEntry(date: .now, data: currentData())
    // Refresh every 30 minutes; production pushes updates via WidgetCenter.
    let timeline = Timeline(
      entries: [entry],
      policy: .after(.now.addingTimeInterval(30 * 60))
    )
    completion(timeline)
  }

  private func currentData() -> TodayWorkoutData {
    WidgetDataStore.readTodayWorkout() ?? MockWidgetDataProvider.todayWorkout()
  }
}

struct TodayWorkoutWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(
      kind: "com.ascnd.fitnessos.widgets.today-workout",
      provider: TodayWorkoutProvider()
    ) { entry in
      TodayWorkoutView(data: entry.data)
    }
    .configurationDisplayName("Today's Workout")
    .description("Your ASCND workout for today.")
    .supportedFamilies([.systemSmall, .systemMedium])
  }
}

struct TodayWorkoutView: View {
  let data: TodayWorkoutData

  @Environment(\.widgetFamily) private var family

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      // ASCND branding, small and quiet.
      Text("ASCND")
        .font(.caption2)
        .foregroundStyle(.secondary)
      Text(data.workoutName)
        .font(.headline)
        .lineLimit(2)
      Text(data.statusText)
        .font(.caption)
        .foregroundStyle(.secondary)
      if family == .systemMedium {
        if let next = data.nextExerciseName {
          Text("Next: \(next)")
            .font(.caption)
            .lineLimit(1)
        }
        ProgressView(
          value: Double(data.completedExercises),
          total: Double(max(data.totalExercises, 1))
        )
      } else {
        Text("\(data.completedExercises)/\(data.totalExercises)")
          .font(.caption)
          .foregroundStyle(.secondary)
      }
    }
    .padding()
  }
}
