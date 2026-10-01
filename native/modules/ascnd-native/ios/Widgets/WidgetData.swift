import Foundation

// MARK: - ASCND shared native data abstraction (spike #195)
//
// ONE abstraction feeds both widgets — neither widget invents its own data
// format. Production wiring (not in this spike):
//   TypeScript -> AscndNative.updateWidgetData(json) -> App Group shared
//   UserDefaults -> WidgetDataStore.read*() -> widgets, then
//   WidgetCenter.shared.reloadAllTimelines().
// The read path below is real code; until the App Group is provisioned it
// returns nil and widgets fall back to MockWidgetDataProvider (explicitly
// marked SPIKE-ONLY). See native/docs/native-spike-195.md.

/// Widget 1 — Today's Workout.
struct TodayWorkoutData: Codable, Hashable {
  /// e.g. "Upper Body Strength".
  var workoutName: String
  /// e.g. "In progress · 25 min left" or "Scheduled · 45 min".
  var statusText: String
  /// Next exercise to perform, when known.
  var nextExerciseName: String?
  var completedExercises: Int
  var totalExercises: Int
}

/// Widget 2 — Streak + Readiness.
struct StreakReadinessData: Codable, Hashable {
  var streakDays: Int
  /// 0-100, nil when no readiness value is available.
  var readinessScore: Int?
  /// e.g. "Ready to train".
  var statusText: String
}

enum WidgetDataStore {
  /// App Group shared between the app and the ASCNDWidgets extension.
  /// NOT provisioned in the #195 spike (no entitlements added) — provisioning
  /// the group in the Apple Developer portal is a documented production step.
  static let appGroupIdentifier = "group.com.ascnd.fitnessos"

  static func readTodayWorkout() -> TodayWorkoutData? {
    read(key: "ascnd.widget.todayWorkout")
  }

  static func readStreakReadiness() -> StreakReadinessData? {
    read(key: "ascnd.widget.streakReadiness")
  }

  private static func read<T: Decodable>(key: String) -> T? {
    guard
      let defaults = UserDefaults(suiteName: appGroupIdentifier),
      let data = defaults.data(forKey: key)
    else {
      return nil
    }
    return try? JSONDecoder().decode(T.self, from: data)
  }
}

/// SPIKE-ONLY mock data adapter. Temporary by design: renders both widget UIs
/// without production data. Delete when the App Group pipeline above is live —
/// do NOT mistake this for a production integration.
enum MockWidgetDataProvider {
  static func todayWorkout() -> TodayWorkoutData {
    TodayWorkoutData(
      workoutName: "Upper Body Strength",
      statusText: "Scheduled · 45 min",
      nextExerciseName: "Bench Press",
      completedExercises: 2,
      totalExercises: 6
    )
  }

  static func streakReadiness() -> StreakReadinessData {
    StreakReadinessData(
      streakDays: 12,
      readinessScore: 86,
      statusText: "Ready to train"
    )
  }
}
