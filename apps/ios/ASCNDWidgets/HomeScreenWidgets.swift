import ASCNDCore
import SwiftUI
import WidgetKit

/// Hai widget màn hình chính của RN (`TodayWorkoutWidget`,
/// `StreakReadinessWidget`): cùng kind, cùng cỡ, cùng bố cục, cùng nguồn
/// (App Group, `WidgetDataStore`).
///
/// Khác RN có chủ đích: khi App Group chưa có dữ liệu, RN hiện SỐ GIẢ của
/// spike (#195: "Upper Body Strength", chuỗi 12 ngày, sẵn sàng 86) như số
/// thật. Ở đây: chưa có dữ liệu thì nói thế ("mở ASCND để cập nhật"); số mẫu
/// chỉ dùng cho `placeholder`, và hệ thống vẽ nó dạng che (redacted).
/// Chữ của widget theo ngôn ngữ máy (RN cứng tiếng Anh).

struct TodayWorkoutEntry: TimelineEntry {
  let date: Date
  let data: TodayWorkoutWidgetData?
}

struct TodayWorkoutProvider: TimelineProvider {
  static let sample = TodayWorkoutWidgetData(
    workoutName: "Upper Body Strength", statusText: "—", completedExercises: 2, totalExercises: 6)

  func placeholder(in context: Context) -> TodayWorkoutEntry {
    TodayWorkoutEntry(date: .now, data: Self.sample)
  }

  func getSnapshot(in context: Context, completion: @escaping (TodayWorkoutEntry) -> Void) {
    completion(TodayWorkoutEntry(date: .now, data: WidgetDataStore().todayWorkout() ?? (context.isPreview ? Self.sample : nil)))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<TodayWorkoutEntry>) -> Void) {
    // App đẩy cập nhật qua `WidgetCenter`; 30 phút là lưới an toàn (như RN).
    let entry = TodayWorkoutEntry(date: .now, data: WidgetDataStore().todayWorkout())
    completion(Timeline(entries: [entry], policy: .after(.now.addingTimeInterval(30 * 60))))
  }
}

struct TodayWorkoutWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "com.ascnd.fitnessos.widgets.today-workout", provider: TodayWorkoutProvider()) { entry in
      TodayWorkoutView(data: entry.data)
        .containerBackground(.fill.tertiary, for: .widget)
    }
    .configurationDisplayName(Text("widget.today.name"))
    .description(Text("widget.today.description"))
    .supportedFamilies([.systemSmall, .systemMedium])
  }
}

struct TodayWorkoutView: View {
  let data: TodayWorkoutWidgetData?
  @Environment(\.widgetFamily) private var family

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(verbatim: "ASCND")
        .font(.caption2)
        .foregroundStyle(.secondary)
      if let data {
        Text(data.workoutName)
          .font(.headline)
          .lineLimit(2)
        Text(data.statusText)
          .font(.caption)
          .foregroundStyle(.secondary)
        if family == .systemMedium {
          if let next = data.nextExerciseName {
            Text("widget.next \(next)")
              .font(.caption)
              .lineLimit(1)
          }
          ProgressView(value: Double(data.completedExercises), total: Double(max(data.totalExercises, 1)))
        } else {
          Text(verbatim: "\(data.completedExercises)/\(data.totalExercises)")
            .font(.caption)
            .foregroundStyle(.secondary)
        }
      } else {
        Text("widget.empty")
          .font(.caption)
          .foregroundStyle(.secondary)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
  }
}

struct StreakReadinessEntry: TimelineEntry {
  let date: Date
  let data: StreakReadinessWidgetData?
}

struct StreakReadinessProvider: TimelineProvider {
  static let sample = StreakReadinessWidgetData(streakDays: 12, readinessScore: 86, statusText: "86/100")

  func placeholder(in context: Context) -> StreakReadinessEntry {
    StreakReadinessEntry(date: .now, data: Self.sample)
  }

  func getSnapshot(in context: Context, completion: @escaping (StreakReadinessEntry) -> Void) {
    completion(
      StreakReadinessEntry(date: .now, data: WidgetDataStore().streakReadiness() ?? (context.isPreview ? Self.sample : nil)))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<StreakReadinessEntry>) -> Void) {
    let entry = StreakReadinessEntry(date: .now, data: WidgetDataStore().streakReadiness())
    completion(Timeline(entries: [entry], policy: .after(.now.addingTimeInterval(30 * 60))))
  }
}

struct StreakReadinessWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "com.ascnd.fitnessos.widgets.streak-readiness", provider: StreakReadinessProvider()) {
      entry in
      StreakReadinessView(data: entry.data)
        .containerBackground(.fill.tertiary, for: .widget)
    }
    .configurationDisplayName(Text("widget.streak.name"))
    .description(Text("widget.streak.description"))
    .supportedFamilies([.systemSmall, .systemMedium])
  }
}

struct StreakReadinessView: View {
  let data: StreakReadinessWidgetData?

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(verbatim: "ASCND")
        .font(.caption2)
        .foregroundStyle(.secondary)
      if let data {
        HStack(alignment: .firstTextBaseline, spacing: 4) {
          Text(verbatim: "\(data.streakDays)")
            .font(.system(size: 34, weight: .bold, design: .rounded))
            .monospacedDigit()
          Text("widget.streak.days \(data.streakDays)")
            .font(.caption)
            .foregroundStyle(.secondary)
        }
        .accessibilityElement(children: .combine)
        if let score = data.readinessScore {
          Text("widget.readiness \(score)")
            .font(.caption)
        }
        Text(data.statusText)
          .font(.caption)
          .foregroundStyle(.secondary)
          .lineLimit(2)
      } else {
        Text("widget.empty")
          .font(.caption)
          .foregroundStyle(.secondary)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
  }
}
