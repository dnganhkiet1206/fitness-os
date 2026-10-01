import SwiftUI
import WidgetKit

/// Widget bundle for the #195 spike: two WidgetKit widgets plus the display-only
/// rest timer Live Activity UI. All three read from the shared WidgetData
/// abstraction (WidgetData.swift) — no per-widget data pipelines.
@main
struct ASCNDWidgets: WidgetBundle {
  var body: some Widget {
    TodayWorkoutWidget()
    StreakReadinessWidget()
    if #available(iOS 16.1, *) {
      RestTimerLiveActivity()
    }
  }
}
